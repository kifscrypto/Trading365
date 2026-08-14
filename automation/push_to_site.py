"""Push local ops data to the live site's /api/ops (shared Postgres store).

Scripts keep writing local JSON (source of truth on this PC); this script
mirrors everything to https://trading365.org/api/ops so the online dashboard
at /ops shows the same data. Safe to run repeatedly — PUTs replace by name.

Usage:  python push_to_site.py            (push all collections + all snapshots)
        python push_to_site.py --dry-run  (list what would be pushed)
"""

import argparse
import json
import sys
import urllib.request
import urllib.error

from ops import config, store

COLLECTIONS = ["content", "tasks", "inbox", "outreach", "templates", "cycles", "quora_queue"]


def _put(base: str, token: str, name: str, data: object) -> str:
    req = urllib.request.Request(
        f"{base}/{name}",
        data=json.dumps(data).encode("utf-8"),
        method="PUT",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return f"HTTP {res.status}"
    except urllib.error.HTTPError as e:
        return f"HTTP {e.code} {e.read()[:120]!r}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Push local ops data to the live /api/ops store")
    parser.add_argument("--dry-run", action="store_true", help="list what would be pushed, no network")
    args = parser.parse_args()
    config.set_dry_run(args.dry_run)

    base = config.get("OPS_API_URL", "https://trading365.org/api/ops").rstrip("/")
    token = config.require("OPS_API_TOKEN")

    # Local files are the source — read them directly, bypassing the HTTP
    # backend (which would be pointless for a push-to-HTTP script).
    names: list[tuple[str, object]] = []
    for name in COLLECTIONS:
        path = config.DATA_DIR / f"{name}.json"
        if path.exists():
            names.append((name, json.loads(path.read_text(encoding="utf-8"))))
    for subdir in ("traffic", "health", "briefings"):
        d = config.DATA_DIR / subdir
        if d.exists():
            for f in sorted(d.glob("*.json")):
                names.append((f.stem, json.loads(f.read_text(encoding="utf-8"))))

    if not names:
        print("nothing to push (no local data files)")
        return 0

    failures = 0
    for name, data in names:
        if config.DRY_RUN:
            print(f"[dry-run] would PUT {base}/{name}")
            continue
        result = _put(base, token, name, data)
        print(f"PUT {name}: {result}")
        if not result.startswith("HTTP 2"):
            failures += 1
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
