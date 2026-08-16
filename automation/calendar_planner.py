"""Calendar planner — scheduled Sundays 08:00.

Scans the LIVE article list plus the existing calendar, then fills the next
week's every-2-days slots with fresh, deduped ideas (status ``idea``).

Candidate priority:
  1. exchange reviews — affiliate exchanges without a dedicated review
  2. comparison pairings among the priority exchanges not yet covered
  3. country/region listicles (the site's proven series)
  4. evergreen how-to / explainer topics (CURATED list below)

Nothing is generated here — this only plans. The daily article_pipeline picks
up ``idea`` items and does the writing.
"""

import argparse
from typing import Any

from ops import admin_api, config, dedupe, store
from ops.dates import shift_days, today_iso

# Never plan content around these — defunct (see the BitMart/AscendEX
# shutdown guide on the site).
EXCLUDED_EXCHANGES = {"bitmart", "ascendex"}

# Exchanges we actively compare — order is roughly commercial priority.
PRIORITY_EXCHANGES = [
    "Bybit", "WEEX", "MEXC", "BingX", "Bitunix", "BYDFi", "OKX",
    "KuCoin", "Bitget", "Gate.io", "Kraken", "Coinbase", "Phemex",
]

COUNTRY_SERIES = [
    ("Germany", "best crypto exchange germany"),
    ("India", "best crypto exchange india"),
    ("Brazil", "best crypto exchange brazil"),
    ("Nigeria", "best crypto exchange nigeria"),
    ("the Philippines", "best crypto exchange philippines"),
    ("Singapore", "best crypto exchange singapore"),
    ("Turkey", "best crypto exchange turkey"),
    ("the UAE", "best crypto exchange uae"),
]

# (title, keyword, articleType) — informational balance for the money pages.
EVERGREEN: list[tuple[str, str, str]] = [
    ("How to Read a Crypto Order Book (Depth, Spread & Walls, Simply)", "how to read order book", "how_to"),
    ("Liquidation Cascades Explained: Why Price Moves Faster Than You Think", "liquidation cascade explained", "explainer"),
    ("How to Transfer Crypto Between Exchanges Without Losing It (Network, Memo & Fee Checks)", "how to transfer crypto between exchanges", "how_to"),
    ("What Is Slippage? Why Your Market Order Fills Worse Than Expected", "what is slippage crypto", "explainer"),
    ("Maker vs Taker Fees Explained: The Difference That Costs You Thousands", "maker vs taker fees", "explainer"),
    ("How to Set Up Two-Factor Authentication on Any Exchange (And the Mistake to Avoid)", "how to set up 2fa crypto exchange", "how_to"),
    ("What Is a Funding Rate Arbitrage? The Basis Trade, Without the Jargon", "funding rate arbitrage", "explainer"),
    ("How to Check an Exchange's Proof of Reserves (And What It Doesn't Tell You)", "proof of reserves explained", "how_to"),
    ("Isolated vs Cross Margin: Which One Keeps You Alive?", "isolated vs cross margin", "explainer"),
    ("How to Avoid Dust Balances When Moving Between Exchanges", "crypto dust balances", "how_to"),
]

SLOTS_PER_WEEK = 4  # one every 2 days


def _review_candidate(name: str) -> tuple[str, str, str]:
    return (
        f"{name} Review 2026: Fees, Safety & Who It's Actually For",
        f"{name.lower()} review",
        "exchange_review",
    )


def _comparison_candidate(a: str, b: str) -> tuple[str, str, str]:
    return (
        f"{a} vs {b} 2026: Fees, Features & Which Wins",
        f"{a.lower()} vs {b.lower()}",
        "comparison",
    )


def build_candidates(affiliate_names: list[str]) -> list[tuple[str, str, str]]:
    candidates: list[tuple[str, str, str]] = []
    for name in affiliate_names:
        if name.lower() in EXCLUDED_EXCHANGES:
            continue
        candidates.append(_review_candidate(name))
    for i, a in enumerate(PRIORITY_EXCHANGES):
        if a.lower() in EXCLUDED_EXCHANGES:
            continue
        for b in PRIORITY_EXCHANGES[i + 1:]:
            if b.lower() in EXCLUDED_EXCHANGES:
                continue
            candidates.append(_comparison_candidate(a, b))
    for region, keyword in COUNTRY_SERIES:
        candidates.append(
            (f"Best Crypto Exchanges for {region} Residents in 2026", keyword, "listicle")
        )
    candidates.extend(EVERGREEN)
    return candidates


def next_slots(items: list[dict[str, Any]], count: int) -> list[str]:
    """Next ``count`` every-2-days dates after the latest scheduled item."""
    dates = [i["date"] for i in items if i.get("date")]
    anchor = max(dates) if dates else today_iso()
    anchor = max(anchor, today_iso())
    return [shift_days(anchor, 2 * n) for n in range(1, count + 1)]


def main() -> int:
    parser = argparse.ArgumentParser(description="Weekly content-calendar planner for Trading365")
    parser.add_argument("--dry-run", action="store_true", help="fixture data, no network, no writes")
    args = parser.parse_args()
    config.set_dry_run(args.dry_run)

    api = admin_api.AdminAPI()
    if not config.DRY_RUN:
        api.login()
    articles = api.list_articles()
    affiliate_names = [l["name"] for l in api.get_affiliate_links() if l.get("name")]
    items = store.load("content", store.seed_content)

    corpus = dedupe.corpus_from_articles(articles) + dedupe.corpus_from_calendar(items)
    print(f"planner: {len(articles)} live articles, {len(items)} calendar items in corpus")

    planned: list[dict[str, Any]] = []
    for candidate in build_candidates(affiliate_names):
        if len(planned) >= SLOTS_PER_WEEK:
            break
        title, keyword, article_type = candidate
        match = dedupe.coverage_match(keyword, corpus)
        if match:
            print(f"  skip  '{keyword}' — {match}")
            continue
        slot = next_slots(items + planned, 1)[0]
        planned.append(
            {
                "id": store.uid(),
                "date": slot,
                "title": title,
                "keyword": keyword,
                "articleType": article_type,
                "status": "idea",
                "postedX": False,
                "quoraDraft": False,
            }
        )
        corpus.append((title, keyword.replace(" ", "-")))
        print(f"  plan  {slot}  [{article_type}] {title}")

    if not planned:
        print("planner: no new ideas needed — corpus covers everything in the pools")
        return 0

    if config.DRY_RUN:
        print(f"[dry-run] would append {len(planned)} items to the content calendar")
    else:
        store.save("content", items + planned)
        print(f"planner: added {len(planned)} items to the calendar")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
