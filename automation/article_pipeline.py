"""Article pipeline — scheduled 07:00 daily.

Finds the oldest due content-calendar item with status ``idea`` that the site
does not already cover, catches up missed days, runs it through the admin SEO
pipeline (outline → streaming content → meta tags), and saves the article as an
UNPUBLISHED DRAFT for manual review in the admin (calendar item marked
``drafted``, cross-posting skipped). Already-covered items are skipped, not
fatal — one duplicate at the head of the queue must never stall the pipeline.
An explicit ``--date`` still selects only that exact calendar day.

Drafts are the default — a human publishes from the admin after review. Pass
``--live`` to publish immediately and cross-post (X + Quora draft).
"""

import argparse
from typing import Any

import crosspost
from ops import admin_api, config, dedupe, store
from ops.dates import today_iso

COMMERCIAL_TYPES = ("exchange_review", "comparison", "listicle")


def _normalized(keyword: str) -> str:
    return " ".join(keyword.lower().split())


def _intent_for(article_type: str) -> str:
    return "commercial" if article_type in COMMERCIAL_TYPES else "informational"


def due_items(items: list[dict[str, Any]], date: str | None = None) -> list[dict[str, Any]]:
    """Every due calendar item, oldest first (or the single --date item)."""
    if date is not None:
        return [
            item
            for item in items
            if item.get("date") == date and item.get("status") == "idea" and item.get("keyword")
        ]
    day = today_iso()
    due = [
        item
        for item in items
        if item.get("date") and item["date"] <= day
        and item.get("status") == "idea" and item.get("keyword")
    ]
    return sorted(due, key=lambda item: item["date"])


def find_due_item(items: list[dict[str, Any]], date: str | None = None) -> dict[str, Any] | None:
    """Return an exact-date item for manual runs, otherwise the oldest due idea."""
    candidates = due_items(items, date)
    return candidates[0] if candidates else None


def guard(
    item: dict[str, Any],
    items: list[dict[str, Any]],
    articles: list[dict[str, Any]],
) -> str | None:
    """Return a refusal reason, or None if the pipeline may proceed.

    Checks the calendar collection AND every live article on the site — the
    site corpus is what stops us re-generating a topic that already ranks.
    """
    if item.get("status") == "published":
        return f"item '{item.get('title')}' is already published"
    target = _normalized(item["keyword"])
    for other in items:
        if other["id"] == item["id"] or not other.get("keyword"):
            continue
        if _normalized(other["keyword"]) == target and other.get("status") in ("drafted", "published"):
            return (
                f"duplicate keyword '{item['keyword']}' — already covered by "
                f"'{other.get('title')}' ({other.get('status')})"
            )
    corpus = dedupe.corpus_from_articles(articles)
    match = dedupe.coverage_match(item["keyword"], corpus)
    if match:
        return f"site already covers '{item['keyword']}' — {match}"
    # Also check the planned title, not just the keyword.
    if item.get("title"):
        match = dedupe.coverage_match(item["title"], corpus)
        if match:
            return f"site already covers '{item['title']}' — {match}"
    return None


def run_pipeline(item: dict[str, Any], review: bool) -> dict[str, Any]:
    article_type = item.get("articleType") or "explainer"
    keyword = item["keyword"]
    intent = _intent_for(article_type)
    api = admin_api.AdminAPI()

    api.login()

    print(f"  1/4 outline   ({keyword}, {intent}, {article_type})")
    outline = api.seo_outline(keyword, intent, article_type=article_type)

    affiliate_links = api.get_affiliate_links()
    affiliate_link = admin_api.detect_affiliate_link(keyword, affiliate_links)
    if affiliate_link:
        print(f"  affiliate   CTA link detected ({affiliate_link})")

    print("  2/4 content   (streaming, may take a few minutes)")
    title = body = ""
    for attempt in (1, 2):
        try:
            title, body = api.seo_content(
                keyword,
                outline,
                intent,
                article_type,
                affiliate_link=affiliate_link,
                affiliate_links=affiliate_links,
            )
            break
        except Exception as exc:
            if attempt == 2:
                raise
            print(f"  content generation failed ({exc}) — retrying once")
    print(f"  title: {title}")

    print("  3/4 meta tags")
    meta = api.seo_meta_tags(body, keyword, title, article_type=article_type)

    published = not review
    payload = admin_api.build_article_payload(keyword, title, body, meta, article_type, published)
    print(f"  4/4 publish   ({payload['category_slug']}/{payload['slug']}, published={published})")
    if review:
        print("  review mode (default): saved as unpublished draft — publish manually in the admin")
    article = api.publish_article(payload)

    if review:
        # Draft only: "drafted" keeps the item out of find_due_item ("idea")
        # and out of crosspost's published-but-unposted sweep ("published").
        item["status"] = "drafted"
    else:
        item["status"] = "published"
        item["publishedUrl"] = f"https://trading365.org/{article['category_slug']}/{article['slug']}"
    return {"title": title, "body": body, "article": article}


def main() -> int:
    parser = argparse.ArgumentParser(description="Daily article pipeline for Trading365")
    parser.add_argument("--dry-run", action="store_true", help="fixture data, no network, no writes")
    parser.add_argument("--live", action="store_true",
                        help="publish immediately + cross-post (default: unpublished draft)")
    parser.add_argument("--review", action="store_true",
                        help="deprecated no-op — review mode is the default")
    parser.add_argument("--date", help="run a specific calendar day (YYYY-MM-DD) instead of today")
    args = parser.parse_args()
    config.set_dry_run(args.dry_run)

    items = store.load("content", store.seed_content)
    candidates = due_items(items, args.date)
    if not candidates:
        print(f"article pipeline: nothing scheduled for {args.date or today_iso()} — exiting")
        return 0

    # Duplicate scan runs against the LIVE article list, not just the calendar.
    api = admin_api.AdminAPI()
    if not config.DRY_RUN:
        api.login()
    articles = api.list_articles()
    print(f"duplicate scan: {len(articles)} live articles + {len(items)} calendar items")

    # Walk the due queue oldest-first and take the first item that is not already
    # covered by the site. A single duplicate at the head of the queue used to
    # abort the whole run (exit 0), so nothing ever fired again until the calendar
    # was edited by hand. Now a refused item is skipped, not fatal.
    item = None
    for candidate in candidates:
        refusal = guard(candidate, items, articles)
        if refusal:
            print(f"  skip {candidate.get('date')} '{candidate.get('title')}': {refusal}")
            continue
        item = candidate
        break

    if item is None:
        print("article pipeline: every due item is already covered — nothing to do")
        return 0

    print(f"article pipeline: '{item.get('title')}' [{item.get('articleType') or 'explainer'}]")
    result = run_pipeline(item, review=not args.live)

    # Save the calendar BEFORE crossposting: once publish_article() returns, the
    # article is live. A crosspost crash with an unsaved calendar leaves the item
    # stuck at "idea" and the run invisible (this produced a duplicate article on
    # 2026-08-20 when the topic had already been published manually).
    if config.DRY_RUN:
        print(f"[dry-run] would save content collection (item marked {item['status']})")
    else:
        store.save("content", items)
        if item.get("publishedUrl"):
            print(f"published → {item['publishedUrl']}")

    if args.live:
        try:
            crosspost.run_for_item(item, result["body"])
            if not config.DRY_RUN:
                store.save("content", items)  # persist postedX / quoraDraft flags
        except Exception as exc:
            print(f"crosspost failed — article is live, calendar is saved; "
                  f"re-run crosspost.py later ({exc})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
