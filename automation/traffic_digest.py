"""Traffic digest — scheduled 06:30 daily.

Pulls yesterday + last 8 days of Google Search Console data and on-site
analytics, merges them into one snapshot, flags anomalies (>30% drop vs the
same weekday last week; the reverse spike is informational), saves the
snapshot via the store and prints a short console summary.
"""

import argparse
from typing import Any

from ops import admin_api, config, gsc, store
from ops.dates import shift_days, today_iso

DROP_THRESHOLD = 0.30
SPIKE_THRESHOLD = 0.30


def _compare(metric: str, yesterday_val: float, week_ago_val: float, anomalies: list[dict[str, Any]]) -> None:
    if week_ago_val <= 0:
        return
    delta = (yesterday_val - week_ago_val) / week_ago_val
    if delta < -DROP_THRESHOLD:
        anomalies.append(
            {
                "level": "warning",
                "metric": metric,
                "message": f"{metric} down {abs(delta):.0%} vs same weekday last week "
                f"({yesterday_val:.0f} vs {week_ago_val:.0f})",
            }
        )
    elif delta > SPIKE_THRESHOLD:
        anomalies.append(
            {
                "level": "info",
                "metric": metric,
                "message": f"{metric} spiked {delta:.0%} vs same weekday last week "
                f"({yesterday_val:.0f} vs {week_ago_val:.0f})",
            }
        )


def _daily_map(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {r["keys"][0]: r for r in rows if r.get("keys")}


def build_snapshot(api: admin_api.AdminAPI) -> dict[str, Any]:
    today = today_iso()
    yesterday = shift_days(today, -1)
    week_ago = shift_days(yesterday, -7)
    start = shift_days(today, -8)

    # --- GSC ---
    by_date = _daily_map(
        gsc.query_search_analytics(start, yesterday, dimensions=("date",))
    )
    by_query = gsc.query_search_analytics(start, yesterday, dimensions=("query",), row_limit=10)
    by_page = gsc.query_search_analytics(start, yesterday, dimensions=("page",), row_limit=10)

    def _totals(row: dict[str, Any] | None) -> dict[str, Any]:
        if not row:
            return {"clicks": 0, "impressions": 0, "ctr": 0.0, "position": 0.0}
        return {k: row[k] for k in ("clicks", "impressions", "ctr", "position")}

    gsc_block = {
        "range": {"start": start, "end": yesterday},
        "yesterday": _totals(by_date.get(yesterday)),
        "weekAgo": _totals(by_date.get(week_ago)),
        "byDate": [
            {"date": day, **_totals(by_date.get(day))}
            for day in sorted(by_date)
        ],
        "topQueries": [
            {"query": r["keys"][0], "clicks": r["clicks"], "impressions": r["impressions"],
             "ctr": r["ctr"], "position": r["position"]}
            for r in by_query[:10]
        ],
        "topPages": [
            {"page": r["keys"][0], "clicks": r["clicks"], "impressions": r["impressions"],
             "ctr": r["ctr"], "position": r["position"]}
            for r in by_page[:10]
        ],
    }

    # --- On-site analytics ---
    analytics = api.get_analytics()
    daily = {d["day"]: d for d in analytics.get("daily", [])}
    onsite_block = {
        "yesterday": {
            "pageviews": daily.get(yesterday, {}).get("views", 0),
            "sessions": daily.get(yesterday, {}).get("sessions", 0),
        },
        "weekAgo": {
            "pageviews": daily.get(week_ago, {}).get("views", 0),
            "sessions": daily.get(week_ago, {}).get("sessions", 0),
        },
        "totals": analytics.get("totals", {}),
        "sessionStats": analytics.get("sessionStats", {}),
        "topPages": analytics.get("topPages", [])[:10],
        "topReferrers": analytics.get("topReferrers", [])[:10],
        "affiliateClicks": analytics.get("affiliateClicks", []),
    }

    # --- Anomalies ---
    anomalies: list[dict[str, Any]] = []
    _compare("gsc.clicks", gsc_block["yesterday"]["clicks"], gsc_block["weekAgo"]["clicks"], anomalies)
    _compare("onsite.pageviews", onsite_block["yesterday"]["pageviews"], onsite_block["weekAgo"]["pageviews"], anomalies)

    return {"date": today, "onsite": onsite_block, "gsc": gsc_block, "anomalies": anomalies}


def main() -> int:
    parser = argparse.ArgumentParser(description="Daily traffic digest for Trading365")
    parser.add_argument("--dry-run", action="store_true", help="use fixture data, no network, no writes")
    args = parser.parse_args()
    config.set_dry_run(args.dry_run)

    api = admin_api.AdminAPI()
    snapshot = build_snapshot(api)

    if config.DRY_RUN:
        print(f"[dry-run] would save traffic snapshot for {snapshot['date']}")
    else:
        store.save_traffic(snapshot["date"], snapshot)
        print(f"saved traffic/traffic-{snapshot['date']}.json")

    g = snapshot["gsc"]
    o = snapshot["onsite"]
    print(f"\nTraffic digest — {snapshot['date']}")
    print(f"  GSC yesterday:  {g['yesterday']['clicks']} clicks, {g['yesterday']['impressions']} impressions, "
          f"pos {g['yesterday']['position']}")
    print(f"  On-site yesterday: {o['yesterday']['pageviews']} pageviews, {o['yesterday']['sessions']} sessions")
    if g["topQueries"]:
        top = g["topQueries"][0]
        print(f"  Top query: \"{top['query']}\" ({top['clicks']} clicks)")
    if snapshot["anomalies"]:
        print("  Anomalies:")
        for a in snapshot["anomalies"]:
            print(f"    [{a['level']}] {a['message']}")
    else:
        print("  Anomalies: none")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
