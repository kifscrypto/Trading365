"""Duplicate-coverage matching — shared by article_pipeline and calendar_planner.

The calendar-only guard is not enough: the live site has ~70 articles that were
never in the calendar. Both scripts build a corpus of (title, slug) pairs from
the live article list PLUS the calendar, then refuse/skip anything covered.
"""

import re
from typing import Any, Iterable

# Words that carry no topic signal for coverage purposes.
GENERIC = {
    "review", "reviews", "2024", "2025", "2026", "2027", "best", "top", "the", "a",
    "an", "for", "to", "is", "it", "its", "how", "what", "which", "who", "why",
    "crypto", "exchange", "exchanges", "trading", "guide", "vs", "and", "in", "of",
    "on", "your", "you", "with", "explained", "new", "update", "updated", "now",
    "actually", "really", "still", "worth", "using", "use", "residents",
}

CorpusEntry = tuple[str, str]  # (title, slug)


def tokens(text: str) -> set[str]:
    return {
        t
        for t in re.findall(r"[a-z0-9]+", text.lower())
        if t not in GENERIC and len(t) > 1
    }


def _slugish(text: str) -> str:
    return "-".join(re.findall(r"[a-z0-9]+", text.lower()))


def corpus_from_articles(articles: Iterable[dict[str, Any]]) -> list[CorpusEntry]:
    return [(str(a.get("title") or ""), str(a.get("slug") or "")) for a in articles]


def corpus_from_calendar(items: Iterable[dict[str, Any]]) -> list[CorpusEntry]:
    return [(str(i.get("title") or ""), _slugish(str(i.get("keyword") or ""))) for i in items]


def coverage_match(keyword: str, corpus: Iterable[CorpusEntry]) -> str | None:
    """Return a human-readable reason if the keyword is already covered, else None.

    Signals:
      1. slug equality, or existing slug starts with the keyword slug + "-"
         ("binance-review" is covered by "binance-review-2026", but
         "gate-io-review" is NOT covered by "gateio-2026-restricted-countries")
      2. token subset — keywords with >=2 significant tokens match titles+slugs;
         single-token keywords (mostly exchange names) match SLUG tokens only,
         so "bybit review"→{bybit} is covered by the slug "bybit-review" but
         not by a comparison title that merely names Bybit
      3. >=75% token overlap (>=2-token keywords only)
    """
    kw_slug = _slugish(keyword)
    kw_tokens = tokens(keyword)
    for title, slug in corpus:
        slug_tokens = tokens(slug.replace("-", " "))
        if kw_slug and slug and (kw_slug == slug or slug.startswith(kw_slug + "-")):
            return f"slug match: '{slug}'"
        if len(kw_tokens) < 2:
            if kw_tokens and kw_tokens <= slug_tokens:
                return f"name appears in slug '{slug}'"
            continue
        entry_tokens = tokens(title) | slug_tokens
        if kw_tokens <= entry_tokens:
            return f"token subset of '{title or slug}'"
        overlap = len(kw_tokens & entry_tokens) / len(kw_tokens)
        if overlap >= 0.75:
            return f"{overlap:.0%} token overlap with '{title or slug}'"
    return None
