"""Site health + security-regression monitor — scheduled 06:15 daily.

Probes trading365.org and memeasylum.com for basic uptime and, more
importantly, for regressions of the holes behind the 2026-08-13 breach:
the forgeable ``admin_auth`` cookie, open admin endpoints, the open
translate endpoint and an unauthenticated ``/ops`` dashboard.

Saves ``health/health-YYYY-MM-DD.json`` via the store, prints a console
summary, and exits 1 when any *critical* check fails so the Task Scheduler
run shows up as failed. A down site is a failed check, not a crash.

``--dry-run`` uses bundled fixture responses (no network, no writes). Set
``HEALTH_FIXTURE_SCENARIO=breach`` to make the fixtures simulate the old
exploit succeeding again (admin endpoints answer 200, /ops answers 200) —
the run must then exit 1.
"""

import argparse
import time
from datetime import datetime
from typing import Any
from urllib.parse import urlparse

import requests

from ops import config, store
from ops.dates import today_iso

REQUEST_TIMEOUT = 20

SITE_TRADING365 = (config.get("HEALTH_SITE_TRADING365") or "https://trading365.org").rstrip("/")
SITE_MEMEASYLUM = (config.get("HEALTH_SITE_MEMEASYLUM") or "https://memeasylum.com").rstrip("/")


# --- Fixtures (dry-run) --------------------------------------------------------


def _fixture_status(method: str, path: str) -> int | None:
    breach = (config.get("HEALTH_FIXTURE_SCENARIO") or "ok") == "breach"
    table = {
        ("GET", "/"): 200,
        ("GET", "/reviews"): 200,
        ("POST", "/api/admin/articles"): 200 if breach else 401,
        ("GET", "/api/admin/affiliate-links"): 200 if breach else 401,
        ("POST", "/api/translate/article"): 200 if breach else 401,
        ("GET", "/ops"): 200 if breach else 307,
        ("GET", "/api/health"): 200,
    }
    return table.get((method, path))


# --- Probing --------------------------------------------------------------------


def _probe(
    method: str,
    url: str,
    headers: dict[str, str] | None = None,
    json_body: dict[str, Any] | None = None,
) -> tuple[int | None, int, str | None]:
    """Single request. Returns (status or None on network error, latencyMs, error)."""
    if config.DRY_RUN:
        path = urlparse(url).path or "/"
        status = _fixture_status(method, path)
        if status is None:
            return None, 5, f"no fixture for {method} {path}"
        return status, 12, None
    start = time.perf_counter()
    try:
        res = requests.request(
            method,
            url,
            headers=headers,
            json=json_body,
            timeout=REQUEST_TIMEOUT,
            allow_redirects=False,
        )
        return res.status_code, round((time.perf_counter() - start) * 1000), None
    except requests.RequestException as e:
        return None, round((time.perf_counter() - start) * 1000), str(e)


def _check(
    name: str,
    critical: bool,
    expected: tuple[int, ...],
    method: str,
    url: str,
    headers: dict[str, str] | None = None,
    json_body: dict[str, Any] | None = None,
    skip_statuses: tuple[int, ...] = (),
) -> dict[str, Any]:
    status, latency, error = _probe(method, url, headers=headers, json_body=json_body)
    if error is not None:
        ok, detail = False, f"request failed: {error}"
    elif status in skip_statuses:
        ok, detail = True, f"HTTP {status} — not present, skipped"
    else:
        ok = status in expected
        want = "/".join(str(s) for s in expected)
        detail = f"HTTP {status} (expected {want})"
    return {
        "name": name,
        "ok": ok,
        "critical": critical,
        "status": status,
        "latencyMs": latency,
        "detail": detail,
    }


def _trading365_checks(base: str) -> list[dict[str, Any]]:
    return [
        _check("homepage", True, (200,), "GET", f"{base}/"),
        _check("reviews index", False, (200,), "GET", f"{base}/reviews"),
        # The old exploit: a self-minted "admin_auth=true" cookie must NOT authenticate.
        _check(
            "admin articles rejects forged cookie",
            True,
            (401,),
            "POST",
            f"{base}/api/admin/articles",
            headers={"Cookie": "admin_auth=true"},
            json_body={"title": "health-probe", "published": False},
        ),
        _check(
            "admin affiliate-links requires auth",
            True,
            (401,),
            "GET",
            f"{base}/api/admin/affiliate-links",
        ),
        _check(
            "translate endpoint requires auth",
            True,
            (401,),
            "POST",
            f"{base}/api/translate/article",
            json_body={"text": "ping"},
        ),
        _check("ops dashboard redirects unauthenticated", True, (307,), "GET", f"{base}/ops"),
    ]


def _memeasylum_checks(base: str) -> list[dict[str, Any]]:
    return [
        _check("homepage", True, (200,), "GET", f"{base}/"),
        # /api/health may not exist — 404 is a skip, not a failure.
        _check("api health", False, (200,), "GET", f"{base}/api/health", skip_statuses=(404,)),
    ]


def build_snapshot() -> dict[str, Any]:
    sites: dict[str, Any] = {}
    for base, build in (
        (SITE_TRADING365, _trading365_checks),
        (SITE_MEMEASYLUM, _memeasylum_checks),
    ):
        host = urlparse(base).netloc or base
        checks = build(base)
        sites[host] = {"ok": all(c["ok"] for c in checks), "checks": checks}
    all_checks = [c for site in sites.values() for c in site["checks"]]
    failed = [c for c in all_checks if not c["ok"]]
    return {
        "date": today_iso(),
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "sites": sites,
        "summary": {
            "total": len(all_checks),
            "failed": len(failed),
            "criticalFailed": sum(1 for c in failed if c["critical"]),
        },
    }


def print_summary(snapshot: dict[str, Any]) -> None:
    print(f"\nHealth check — {snapshot['date']}")
    for host, site in snapshot["sites"].items():
        passed = sum(1 for c in site["checks"] if c["ok"])
        state = "OK" if site["ok"] else "PROBLEMS"
        print(f"  {host}: {passed}/{len(site['checks'])} checks OK — {state}")
        for c in site["checks"]:
            if c["ok"]:
                print(f"    ok   {c['name']}: {c['detail']} [{c['latencyMs']}ms]")
            else:
                tag = "CRITICAL" if c["critical"] else "warn"
                print(f"    FAIL {c['name']}: {c['detail']} [{c['latencyMs']}ms] ← {tag}")
    s = snapshot["summary"]
    print(f"  summary: {s['total']} checks, {s['failed']} failed, {s['criticalFailed']} critical failed")


def main() -> int:
    parser = argparse.ArgumentParser(description="Daily site health + security-regression check")
    parser.add_argument("--dry-run", action="store_true", help="fixture responses, no network, no writes")
    args = parser.parse_args()
    config.set_dry_run(args.dry_run)

    snapshot = build_snapshot()

    if config.DRY_RUN:
        print(f"[dry-run] would save health snapshot for {snapshot['date']}")
    else:
        store.save_health(snapshot["date"], snapshot)
        print(f"saved health/health-{snapshot['date']}.json")

    print_summary(snapshot)
    return 1 if snapshot["summary"]["criticalFailed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
