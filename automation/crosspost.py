"""Cross-posting: X (Twitter) posts and Quora answer drafts for published articles.

Used by ``article_pipeline.py`` after publishing, and runnable standalone to
process any published-but-unposted items.
"""

import argparse
import re
from typing import Any

import requests

from ops import config, store
from ops.dates import today_iso

X_TWEET_URL = "https://api.twitter.com/2/tweets"

X_CRED_KEYS = ("X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_SECRET")


def x_configured() -> bool:
    """All four OAuth1 creds present? If not, tweets are skipped (not an error)."""
    return all(config.get(k) for k in X_CRED_KEYS)


def post_to_x(text: str) -> str:
    """Post a tweet via OAuth1 user context. Returns the tweet id."""
    if config.DRY_RUN:
        print(f"[dry-run] would post to X ({len(text)} chars):\n  {text}")
        return "dry-run-tweet-id"
    from requests_oauthlib import OAuth1

    auth = OAuth1(
        config.require("X_API_KEY"),
        config.require("X_API_SECRET"),
        config.require("X_ACCESS_TOKEN"),
        config.require("X_ACCESS_SECRET"),
    )
    res = requests.post(X_TWEET_URL, auth=auth, json={"text": text}, timeout=30)
    if res.status_code not in (200, 201):
        raise RuntimeError(f"X post failed: HTTP {res.status_code} {res.text[:300]}")
    tweet_id = res.json().get("data", {}).get("id", "")
    print(f"posted to X: tweet id {tweet_id}")
    return tweet_id


def _hook_line(article_markdown: str) -> str:
    """First body sentence, capped at 100 chars."""
    for para in article_markdown.split("\n\n"):
        para = para.strip()
        if not para or para.startswith("#"):
            continue
        sentence = re.split(r"(?<=[.!?])\s", para)[0]
        sentence = re.sub(r"[#*_`\[\]]", "", sentence).strip()
        if sentence:
            return sentence[:100]
    return ""


def build_tweet(title: str, article_markdown: str, url: str) -> str:
    hook = _hook_line(article_markdown)
    parts = [title]
    if hook:
        parts.append(hook)
    parts.append(url)
    return "\n\n".join(parts)[:280]


def suggest_question(item: dict[str, Any]) -> str:
    """Heuristic Quora question for the article."""
    title = item.get("title", "").strip()
    if title.endswith("?"):
        return title
    keyword = (item.get("keyword") or "").strip()
    starters = ("is ", "are ", "can ", "how ", "what ", "why ", "does ", "do ")
    if keyword.lower().startswith(starters):
        return keyword[0].upper() + keyword[1:].rstrip("?") + "?"
    subject = keyword or title
    return f"Is {subject} worth it? An honest take"


def build_answer_draft(item: dict[str, Any], url: str) -> str:
    title = item.get("title", "")
    return (
        f"We recently published an in-depth piece on this: \"{title}\".\n\n"
        f"The short version: our verdict covers the key features, the real fee picture, and the "
        f"main caveats most reviews skip. The pros are genuine, but there are trade-offs depending "
        f"on account size and region — details matter more than headlines here.\n\n"
        f"Full breakdown with data and screenshots: {url}"
    )


def run_for_item(item: dict[str, Any], article_markdown: str) -> dict[str, Any]:
    """Post to X and queue a Quora draft for a published item. Mutates ``item``."""
    url = item.get("publishedUrl")
    if not url:
        print(f"  crosspost: '{item.get('title')}' has no publishedUrl — skipping")
        return item

    if not item.get("postedX"):
        if not config.DRY_RUN and not x_configured():
            # Not connected: skip the tweet instead of raising — a missing X
            # app must never crash the pipeline after publish (it did on
            # 2026-08-20, leaving the calendar item stuck at "idea").
            print("  crosspost: X credentials not configured — skipping tweet")
        else:
            tweet = build_tweet(item.get("title", ""), article_markdown, url)
            post_to_x(tweet)
            item["postedX"] = True
    else:
        print(f"  crosspost: '{item.get('title')}' already posted to X")

    if not item.get("quoraDraft"):
        queue = store.load("quora_queue")
        queue.append(
            {
                "id": store.uid(),
                "createdAt": today_iso(),
                "articleTitle": item.get("title", ""),
                "url": url,
                "suggestedQuestion": suggest_question(item),
                "answerDraft": build_answer_draft(item, url),
                "status": "pending",
            }
        )
        if config.DRY_RUN:
            print(f"[dry-run] would queue Quora draft for '{item.get('title')}'")
        else:
            store.save("quora_queue", queue)
            print(f"  crosspost: queued Quora draft for '{item.get('title')}'")
        item["quoraDraft"] = True
    else:
        print(f"  crosspost: '{item.get('title')}' already has a Quora draft")

    return item


def main() -> int:
    parser = argparse.ArgumentParser(description="Cross-post published articles to X / Quora queue")
    parser.add_argument("--dry-run", action="store_true", help="no network, no writes")
    args = parser.parse_args()
    config.set_dry_run(args.dry_run)

    items = store.load("content", store.seed_content)
    pending = [
        it for it in items
        if it.get("status") == "published" and (not it.get("postedX") or not it.get("quoraDraft"))
    ]
    if not pending:
        print("crosspost: nothing to do — no published-but-unposted items")
        return 0
    for item in pending:
        print(f"crosspost: processing '{item.get('title')}'")
        run_for_item(item, "")
    if config.DRY_RUN:
        print(f"[dry-run] would save content collection ({len(pending)} item(s) updated)")
    else:
        store.save("content", items)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
