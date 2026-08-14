"""Local-time ISO day helpers.

All day boundaries use local time ``YYYY-MM-DD`` strings. Never use
``datetime.toISOString()`` / UTC conversion for day boundaries (timezone bug).
"""

from datetime import date, datetime, timedelta


def iso_day(dt: date | datetime) -> str:
    """Format a date/datetime as a local-time ``YYYY-MM-DD`` day string."""
    return dt.strftime("%Y-%m-%d")


def today_iso() -> str:
    """Today's local-time ISO day string."""
    return iso_day(datetime.now())


def shift_days(base_iso: str, n: int) -> str:
    """Return the ISO day string ``n`` days after (or before) ``base_iso``."""
    base = datetime.strptime(base_iso, "%Y-%m-%d").date()
    return iso_day(base + timedelta(days=n))
