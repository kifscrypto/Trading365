"""One-off: insert the pre-written StakerX.ai scam alert as an UNPUBLISHED draft.

Reads the article JSON, posts it to ``/api/admin/articles`` with
``published: false``, then verifies via ``list_articles()`` that the draft
exists with the right slug/category. The owner reviews and publishes it
manually in the admin UI — this script never publishes.

Usage:  python insert_scam_alert_draft.py            (live insert + verify)
        python insert_scam_alert_draft.py --dry-run  (print the payload, no network)
"""

import argparse
import json
import math
import re
import sys
from pathlib import Path
from typing import Any

from ops import admin_api, config
from ops.dates import today_iso

ARTICLE_JSON = Path(r"C:/Users/Lee/AppData/Local/Temp/t365-stakerx-article.json")
SLUG = "stakerx-ai-review-red-flags"


def first_prose_excerpt(body: str, limit: int = 160) -> str:
    """First prose sentence of the body, plain text, ~160 chars."""
    paragraphs = [p.strip() for p in body.split("\n\n") if p.strip()]
    prose = next((p for p in paragraphs if not p.startswith(("#", "|", "-", ">"))), "")
    prose = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", prose)  # [text](url) → text
    prose = re.sub(r"[#*_`]", "", prose).strip()
    sentence = re.split(r"(?<=[.!?])\s", prose)[0]
    if len(sentence) <= limit:
        return sentence
    return sentence[:limit].rsplit(" ", 1)[0].strip()


def insert_quick_facts(body: str, quick_facts_md: str) -> str:
    """Insert the Quick Facts block exactly like the admin UI does: after the
    opening verdict/answer section, before the second heading."""
    block = f"## Quick Facts\n\n{quick_facts_md.strip()}\n\n"
    first = re.search(r"^#{1,3} .+$", body, re.M)
    if first:
        nxt = re.search(r"\n#{1,3} .+$", body[first.end() :], re.M)
        if nxt:
            at = first.end() + nxt.start() + 1
            return body[:at] + block + body[at:]
        return body.rstrip() + "\n\n" + block.rstrip() + "\n"
    return block + body


def build_payload(data: dict[str, Any]) -> dict[str, Any]:
    body = data["body"]
    if data.get("quick_facts_md", "").strip():
        body = insert_quick_facts(body, data["quick_facts_md"])
    words = len(body.split())
    return {
        "slug": SLUG,
        "title": data["title"],
        "excerpt": first_prose_excerpt(data["body"]),
        "content": body,
        "category": data["category"],
        "category_slug": data["category_slug"],
        "date": today_iso(),
        "read_time": f"{max(1, math.ceil(words / 200))} min read",
        "author": "Trading365",
        "rating": 0,
        "thumbnail": "",
        "tags": [data["keyword"]],
        "faqs": data.get("faqs", []),
        "pros": [],
        "cons": [],
        "meta_title": data.get("meta_title", data["title"]),
        "meta_description": data.get("meta_description", ""),
        "meta_keywords": data.get("meta_keywords", data["keyword"]),
        "published": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Insert the StakerX.ai scam alert as an unpublished draft")
    parser.add_argument("--dry-run", action="store_true", help="print the payload, no network, no writes")
    parser.add_argument("--json", default=str(ARTICLE_JSON), help="path to the article JSON")
    args = parser.parse_args()
    config.set_dry_run(args.dry_run)

    data = json.loads(Path(args.json).read_text(encoding="utf-8"))
    payload = build_payload(data)

    if config.DRY_RUN:
        print(f"[dry-run] would POST /api/admin/articles (published=false)")
        print(f"  slug:          {payload['slug']}")
        print(f"  category:      {payload['category']} / {payload['category_slug']}")
        print(f"  title:         {payload['title']}")
        print(f"  excerpt:       {payload['excerpt']}")
        print(f"  read_time:     {payload['read_time']} ({len(payload['content'].split())} words)")
        print(f"  faqs:          {len(payload['faqs'])}")
        print(f"  quick facts inserted: {'## Quick Facts' in payload['content']}")
        return 0

    api = admin_api.AdminAPI()
    api.login()
    article = api.publish_article(payload)
    print(f"inserted draft: id={article.get('id')} slug={article.get('slug')} published={article.get('published')}")

    articles = api.list_articles()
    match = next((a for a in articles if a.get("slug") == SLUG), None)
    if match is None:
        print("VERIFY FAILED: draft not found in list_articles()", file=sys.stderr)
        return 1
    ok = match.get("published") in (False, 0) and match.get("category_slug") == payload["category_slug"]
    print(
        f"verify: slug={match.get('slug')} category_slug={match.get('category_slug')} "
        f"published={match.get('published')} → {'OK' if ok else 'MISMATCH'}"
    )
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
