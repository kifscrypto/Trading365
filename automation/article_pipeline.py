"""Article pipeline — scheduled 07:00 daily.

Finds today's content-calendar item with status ``idea``, runs it through the
admin SEO pipeline (outline → streaming content → meta tags), publishes the
article, marks the item published, then cross-posts (X + Quora draft).

Publishing is live by default; pass ``--review`` to save the article as an
unpublished draft in the admin for manual review (calendar item marked
``drafted``, cross-posting skipped).
"""

import argparse
from typing import Any

import crosspost
from ops import admin_api, config, store
from ops.dates import today_iso

COMMERCIAL_TYPES = ("exchange_review", "comparison", "listicle")


def _normalized(keyword: str) -> str:
    return " ".join(keyword.lower().split())


def _intent_for(article_type: str) -> str:
    return "commercial" if article_type in COMMERCIAL_TYPES else "informational"


def find_todays_item(items: list[dict[str, Any]]) -> dict[str, Any] | None:
    today = today_iso()
    for item in items:
        if item.get("date") == today and item.get("status") == "idea" and item.get("keyword"):
            return item
    return None


def guard(item: dict[str, Any], items: list[dict[str, Any]]) -> str | None:
    """Return a refusal reason, or None if the pipeline may proceed."""
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
    meta = api.seo_meta_tags(body, keyword, title)

    published = not review
    payload = admin_api.build_article_payload(keyword, title, body, meta, article_type, published)
    print(f"  4/4 publish   ({payload['category_slug']}/{payload['slug']}, published={published})")
    if review:
        print("  --review: saved as unpublished draft — publish manually in the admin")
    article = api.publish_article(payload)

    if review:
        # Draft only: "drafted" keeps the item out of find_todays_item ("idea")
        # and out of crosspost's published-but-unposted sweep ("published").
        item["status"] = "drafted"
    else:
        item["status"] = "published"
        item["publishedUrl"] = f"https://trading365.org/{article['category_slug']}/{article['slug']}"
    return {"title": title, "body": body, "article": article}


def main() -> int:
    parser = argparse.ArgumentParser(description="Daily article pipeline for Trading365")
    parser.add_argument("--dry-run", action="store_true", help="fixture data, no network, no writes")
    parser.add_argument("--review", action="store_true", help="publish=False — manual publish in admin")
    args = parser.parse_args()
    config.set_dry_run(args.dry_run)

    items = store.load("content", store.seed_content)
    item = find_todays_item(items)
    if item is None:
        print(f"article pipeline: nothing scheduled for {today_iso()} — exiting")
        return 0

    refusal = guard(item, items)
    if refusal:
        print(f"article pipeline: REFUSED — {refusal}")
        return 0

    print(f"article pipeline: '{item.get('title')}' [{item.get('articleType') or 'explainer'}]")
    result = run_pipeline(item, args.review)

    if not args.review:
        crosspost.run_for_item(item, result["body"])

    if config.DRY_RUN:
        print(f"[dry-run] would save content collection (item marked {item['status']})")
    else:
        store.save("content", items)
        if item.get("publishedUrl"):
            print(f"published → {item['publishedUrl']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
