"""Morning briefing builder — scheduled 07:30 (or at logon).

Assembles ``briefings/briefing-YYYY-MM-DD.json`` from the latest traffic
snapshot, the latest site-health snapshot, today's content item, tasks,
inbox counts, due follow-ups and voting cycle phases, and prints a
plain-text briefing to the console.
"""

import argparse
from datetime import date
from typing import Any

from ops import config, store
from ops.dates import today_iso

FOLLOWUP_STAGES = ("contacted", "followup1", "followup2")


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
        g = traffic.get("gsc", {}).get("yesterday", {})
        o = traffic.get("onsite", {}).get("yesterday", {})
        print(f"Traffic (yesterday): {g.get('clicks', 0)} GSC clicks / "
              f"{o.get('pageviews', 0)} pageviews / {o.get('sessions', 0)} sessions")
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
