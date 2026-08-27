"""Morning briefing builder — scheduled 07:30 (or at logon).

Assembles ``briefings/briefing-YYYY-MM-DD.json`` from the latest traffic
snapshot, the latest site-health snapshot, today's content item, tasks,
inbox counts, due follow-ups and voting cycle phases, and prints a
plain-text briefing to the console.
"""

import argparse
from datetime import date, datetime, timedelta, timezone
from typing import Any

import requests

from ops import config, store
from ops.dates import today_iso

FOLLOWUP_STAGES = ("contacted", "followup1", "followup2")

# Live cycle state from the Meme Asylum indexer — the source of truth for the
# cycle number, start time and step length (7-day steps since the v4 cutover,
# boundaries at 22:00 UTC). The static cycles collection is only a fallback.
CYCLES_API_URL = "https://app.memeasylum.com/ponder/api/cycles/current"


def _parse_day(iso: str) -> date:
    return date.fromisoformat(iso)


def cycle_phase(cycle: dict[str, Any], today: date) -> tuple[str, int]:
    """(phase, daysLeft) — daysLeft counts down to the end of the current phase."""
    subs = _parse_day(cycle["submissionsOpen"])
    opens = _parse_day(cycle["votingOpens"])
    closes = _parse_day(cycle["votingCloses"])
    if today < subs:
        return "upcoming", (subs - today).days
    if today < opens:
        return "submissions", (opens - today).days
    if today <= closes:
        return "voting", (closes - today).days
    return "closed", 0


def live_voting_phases() -> list[dict[str, Any]] | None:
    """Current + next two cycles computed from the live Ponder API.

    Returns None in dry-run or when the API is unreachable (caller falls back
    to the static cycles collection). Step 1 = nominations & voting,
    step 2 = minting; daysLeft counts down to the end of the current phase.
    """
    if config.DRY_RUN:
        return None
    try:
        res = requests.get(CYCLES_API_URL, timeout=8)
        res.raise_for_status()
        data = res.json()
        number = int(data["number"])
        start_ts = int(data["startTime"])
        step_s = int(data["stepDuration"])
    except Exception as exc:
        print(f"voting: live cycle fetch failed ({exc}) — using static cycles collection")
        return None
    start = datetime.fromtimestamp(start_ts, tz=timezone.utc)
    step = timedelta(seconds=step_s)
    now = datetime.now(tz=timezone.utc)
    voting: list[dict[str, Any]] = []
    for i in range(3):
        cycle_start = start + i * 2 * step
        step2_start = cycle_start + step
        cycle_end = cycle_start + 2 * step
        label = f"Cycle {number + i}"
        if now < cycle_start:
            voting.append({"label": f"{label} — Nominations & Voting", "phase": "upcoming",
                           "daysLeft": (cycle_start - now).days})
        elif now < step2_start:
            voting.append({"label": f"{label} — Nominations & Voting (live)", "phase": "voting",
                           "daysLeft": (step2_start - now).days})
        elif now < cycle_end:
            voting.append({"label": f"{label} — Minting (live)", "phase": "minting",
                           "daysLeft": (cycle_end - now).days})
    return voting


def build_briefing() -> dict[str, Any]:
    today = today_iso()
    today_date = _parse_day(today)

    traffic = store.latest_traffic()
    health = store.latest_health()

    content = store.load("content", store.seed_content)
    today_article = next((c for c in content if c.get("date") == today), None)

    tasks = store.load("tasks", store.seed_tasks)
    tasks_today = [t for t in tasks if t.get("status") == "today" or t.get("plannedFor") == today]
    tasks_doing = [t for t in tasks if t.get("status") == "doing"]

    inbox = store.load("inbox", store.seed_inbox)
    inbox_new = [e for e in inbox if e.get("status") == "new"]
    inbox_drafted = [e for e in inbox if e.get("status") == "drafted"]

    outreach = store.load("outreach", store.seed_outreach)
    followups_due = [
        c for c in outreach
        if c.get("stage") in FOLLOWUP_STAGES and c.get("nextTouch") and c["nextTouch"] <= today
    ]

    voting = live_voting_phases()
    if voting is None:
        cycles = store.load("cycles", store.seed_cycles)
        voting = []
        for cycle in cycles:
            phase, days_left = cycle_phase(cycle, today_date)
            if phase != "closed":
                voting.append({"label": cycle["label"], "phase": phase, "daysLeft": days_left})

    return {
        "date": today,
        "traffic": traffic,
        "health": health,
        "todayArticle": today_article,
        "tasks": {"today": tasks_today, "doing": tasks_doing},
        "inbox": {"new": inbox_new, "drafted": inbox_drafted},
        "followupsDue": followups_due,
        "voting": voting,
    }


def print_briefing(b: dict[str, Any]) -> None:
    print(f"\n=== Morning briefing — {b['date']} ===")
    traffic = b["traffic"]
    if traffic:
        # traffic_digest writes "gsc": null (not a missing key) when GSC creds
        # are absent — `.get("gsc", {})` would return None and crash here.
        gsc = traffic.get("gsc") or {}
        g = gsc.get("yesterday", {})
        o = (traffic.get("onsite") or {}).get("yesterday", {})
        print(f"Traffic (yesterday): {g.get('clicks', 0)} GSC clicks / "
              f"{o.get('pageviews', 0)} pageviews / {o.get('sessions', 0)} sessions")
        if not gsc and traffic.get("gscError"):
            print(f"  [warn] GSC data unavailable: {traffic['gscError']}")
        for a in traffic.get("anomalies", []):
            print(f"  [{a['level']}] {a['message']}")
    else:
        print("Traffic: no snapshot yet")
    health = b["health"]
    if health:
        sites = health.get("sites", {})
        critical_failures = [
            (host, c)
            for host, site in sites.items()
            for c in site.get("checks", [])
            if c.get("critical") and not c.get("ok")
        ]
        if critical_failures:
            print("Sites: CRITICAL — " + "; ".join(
                f"{c['name'].upper()} ({host})" for host, c in critical_failures
            ))
        else:
            ok_sites = sum(1 for site in sites.values() if site.get("ok"))
            print(f"Sites: {ok_sites}/{len(sites)} OK")
    else:
        print("Sites: no health snapshot yet")
    article = b["todayArticle"]
    if article:
        print(f"Today's article: {article.get('title')} [{article.get('status')}]")
    else:
        print("Today's article: none scheduled")
    print(f"Tasks — today ({len(b['tasks']['today'])}):")
    for t in b["tasks"]["today"]:
        print(f"  [{t['project']}] {t['title']} ({t['priority']})")
    print(f"Tasks — doing ({len(b['tasks']['doing'])}):")
    for t in b["tasks"]["doing"]:
        print(f"  [{t['project']}] {t['title']}")
    print(f"Inbox: {len(b['inbox']['new'])} new, {len(b['inbox']['drafted'])} drafted")
    if b["followupsDue"]:
        print("Follow-ups due:")
        for c in b["followupsDue"]:
            print(f"  {c['company']} ({c['stage']}) — {c.get('email')}")
    if b["voting"]:
        print("Voting cycles:")
        for v in b["voting"]:
            print(f"  {v['label']}: {v['phase']} ({v['daysLeft']}d left)")


def main() -> int:
    parser = argparse.ArgumentParser(description="Assemble the morning briefing")
    parser.add_argument("--dry-run", action="store_true", help="no writes")
    args = parser.parse_args()
    config.set_dry_run(args.dry_run)

    briefing = build_briefing()
    if config.DRY_RUN:
        print(f"[dry-run] would save briefings/briefing-{briefing['date']}.json")
    else:
        store.save_briefing(briefing["date"], briefing)
        print(f"saved briefings/briefing-{briefing['date']}.json")
    print_briefing(briefing)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
