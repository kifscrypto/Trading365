"""Tiny JSON-file store rooted at ``config.DATA_DIR``.

Collections map to ``<name>.json``; traffic snapshots to
``traffic/traffic-YYYY-MM-DD.json``; briefings to
``briefings/briefing-YYYY-MM-DD.json``. Seed functions mirror the ops
dashboard's starter data so the suite runs standalone.
"""

import json
import random
import time
from pathlib import Path
from typing import Any, Callable

from . import config
from .dates import shift_days, today_iso

COLLECTIONS = ("content", "tasks", "inbox", "outreach", "templates", "cycles", "quora_queue")

_B36 = "0123456789abcdefghijklmnopqrstuvwxyz"


def _b36(n: int) -> str:
    if n <= 0:
        return "0"
    out = ""
    while n:
        n, r = divmod(n, 36)
        out = _B36[r] + out
    return out


def uid() -> str:
    """Random base36 + timestamp base36, same scheme as the dashboard."""
    rand = _b36(random.getrandbits(48)).rjust(10, "0")
    return rand + _b36(int(time.time() * 1000))


def _path(name: str) -> Path:
    if name not in COLLECTIONS:
        raise ValueError(f"unknown collection {name!r}; expected one of {COLLECTIONS}")
    return config.DATA_DIR / f"{name}.json"


def _read_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return fallback


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def load(name: str, seed: Callable[[], list[dict[str, Any]]] | None = None) -> list[dict[str, Any]]:
    """Load a collection, seeding and persisting starter data if missing."""
    path = _path(name)
    if not path.exists() and seed is not None:
        items = seed()
        _write_json(path, items)
        return items
    return _read_json(path, [])


def save(name: str, items: list[dict[str, Any]]) -> None:
    _write_json(_path(name), items)


def load_traffic(day: str) -> dict[str, Any] | None:
    return _read_json(config.DATA_DIR / "traffic" / f"traffic-{day}.json", None)


def save_traffic(day: str, data: dict[str, Any]) -> None:
    _write_json(config.DATA_DIR / "traffic" / f"traffic-{day}.json", data)


def save_briefing(day: str, data: dict[str, Any]) -> None:
    _write_json(config.DATA_DIR / "briefings" / f"briefing-{day}.json", data)


def _latest(subdir: str, prefix: str) -> dict[str, Any] | None:
    folder = config.DATA_DIR / subdir
    if not folder.exists():
        return None
    files = sorted(folder.glob(f"{prefix}-*.json"))
    if not files:
        return None
    return _read_json(files[-1], None)


def latest_traffic() -> dict[str, Any] | None:
    return _latest("traffic", "traffic")


def latest_briefing() -> dict[str, Any] | None:
    return _latest("briefings", "briefing")


# --- Seed data (mirrors the dashboard's starter items) -----------------------


def seed_templates() -> list[dict[str, Any]]:
    return [
        {
            "id": "review-interest",
            "name": "Sponsorship / review interest reply",
            "subject": "Re: {{subject}}",
            "body": (
                "Hi {{contactName}},\n\n"
                "Thanks for reaching out about {{company}} — this looks like a potential fit "
                "for Trading365. Could you send over your media kit, audience numbers and "
                "rates for a sponsored review?\n\n"
                "Best,\nTrading365 Editorial"
            ),
        },
        {
            "id": "outreach-initial",
            "name": "Outreach — initial contact",
            "subject": "Reviewing {{company}} on Trading365",
            "body": (
                "Hi {{contactName}},\n\n"
                "I run Trading365, a trading-platform review site. We're putting together "
                "our next round of exchange reviews and {{company}} is on the shortlist. "
                "Open to chatting about an affiliate or partnership arrangement?\n\n"
                "Best,\nTrading365"
            ),
        },
        {
            "id": "outreach-followup",
            "name": "Outreach — follow-up nudge",
            "subject": "Re: Reviewing {{company}} on Trading365",
            "body": (
                "Hi {{contactName}},\n\n"
                "Just bumping this in case it got buried — still keen to feature "
                "{{company}} in our review series. Happy to share traffic stats if useful.\n\n"
                "Best,\nTrading365"
            ),
        },
    ]


def seed_content() -> list[dict[str, Any]]:
    today = today_iso()
    return [
        {
            "id": uid(),
            "date": today,
            "title": "Bybit Review 2026: Fees, Features & Safety",
            "keyword": "bybit review 2026",
            "status": "idea",
            "postedX": False,
            "quoraDraft": False,
            "articleType": "exchange_review",
        },
        {
            "id": uid(),
            "date": shift_days(today, -1),
            "title": "What Is Leverage Trading? A Beginner's Guide",
            "keyword": "what is leverage trading",
            "status": "published",
            "postedX": True,
            "quoraDraft": True,
            "publishedUrl": "https://trading365.org/explainers/what-is-leverage-trading",
            "articleType": "explainer",
        },
        {
            "id": uid(),
            "date": shift_days(today, -2),
            "title": "How to Read Crypto Charts: The Basics",
            "keyword": "how to read crypto charts",
            "status": "published",
            "postedX": False,
            "quoraDraft": False,
            "publishedUrl": "https://trading365.org/guides/how-to-read-crypto-charts",
            "articleType": "how_to",
        },
        {
            "id": uid(),
            "date": shift_days(today, 1),
            "title": "Binance vs Bybit: Which Exchange Wins in 2026?",
            "keyword": "binance vs bybit",
            "status": "idea",
            "postedX": False,
            "quoraDraft": False,
            "articleType": "comparison",
        },
    ]


def seed_tasks() -> list[dict[str, Any]]:
    today = today_iso()
    return [
        {
            "id": uid(),
            "title": "Ship MutinyHub relayer gas bump fix",
            "project": "MAX",
            "status": "doing",
            "priority": "high",
            "createdAt": shift_days(today, -2),
            "plannedFor": today,
        },
        {
            "id": uid(),
            "title": "Publish today's scheduled article",
            "project": "TRADING365",
            "status": "today",
            "priority": "high",
            "createdAt": shift_days(today, -1),
            "plannedFor": today,
        },
        {
            "id": uid(),
            "title": "Reply to KIFS sponsorship inbox",
            "project": "KIFS",
            "status": "today",
            "priority": "medium",
            "createdAt": today,
            "plannedFor": today,
        },
        {
            "id": uid(),
            "title": "Renew app.memeasylum.com TLS cert check",
            "project": "OPS",
            "status": "backlog",
            "priority": "low",
            "createdAt": shift_days(today, -5),
        },
    ]


def seed_inbox() -> list[dict[str, Any]]:
    today = today_iso()
    return [
        {
            "id": uid(),
            "from": "partnerships@cryptopulse.io",
            "company": "CryptoPulse",
            "subject": "Sponsored review opportunity on Trading365",
            "receivedAt": f"{shift_days(today, -1)}T18:42:00",
            "status": "drafted",
            "templateId": "review-interest",
            "notes": "draft r1234567890",
        },
    ]


def seed_outreach() -> list[dict[str, Any]]:
    today = today_iso()
    return [
        {
            "id": uid(),
            "company": "LedgerFi",
            "contactName": "Marta",
            "email": "marta@ledgerfi.com",
            "stage": "contacted",
            "lastTouch": shift_days(today, -5),
            "nextTouch": shift_days(today, -1),
            "notes": "Met at ETHDenver side event",
        },
        {
            "id": uid(),
            "company": "NodeStake",
            "contactName": "Dev",
            "email": "dev@nodestake.xyz",
            "stage": "followup1",
            "lastTouch": shift_days(today, -2),
            "nextTouch": shift_days(today, 2),
        },
        {
            "id": uid(),
            "company": "ChainSignals",
            "contactName": "Priya",
            "email": "priya@chainsignals.io",
            "stage": "replied",
            "lastTouch": shift_days(today, -3),
            "notes": "Asked for rate card",
        },
    ]


def seed_cycles() -> list[dict[str, Any]]:
    today = today_iso()
    return [
        {
            "id": uid(),
            "label": "Meme Asylum cycle #12",
            "submissionsOpen": shift_days(today, -7),
            "votingOpens": shift_days(today, -2),
            "votingCloses": shift_days(today, 5),
            "note": "Ward Watch live",
        },
        {
            "id": uid(),
            "label": "Meme Asylum cycle #13",
            "submissionsOpen": shift_days(today, 7),
            "votingOpens": shift_days(today, 12),
            "votingCloses": shift_days(today, 19),
        },
    ]
