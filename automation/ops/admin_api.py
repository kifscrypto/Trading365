"""HTTP client for the Trading365 admin API.

Uses a ``requests.Session``; ``login()`` keeps the ``admin_auth`` cookie.
In dry-run mode every method returns realistic fixture data and performs no
network calls.
"""

import re
from typing import Any

import requests

from . import config
from .dates import shift_days, today_iso

ARTICLE_TYPES = ("exchange_review", "explainer", "coin_guide", "how_to", "comparison", "listicle")

CATEGORY_SLUGS = {
    "exchange_review": "reviews",
    "explainer": "explainers",
    "comparison": "comparisons",
}

CONTENT_TIMEOUT_S = 360  # streaming article generation can take minutes


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug or "article"


def category_slug_for(article_type: str) -> str:
    return CATEGORY_SLUGS.get(article_type, "guides")


def category_label_for(article_type: str) -> str:
    return article_type.replace("_", " ").title()


def detect_affiliate_link(keyword: str, links: list[dict[str, Any]]) -> str | None:
    """Pick the CTA affiliate URL for a keyword, mirroring the admin content
    generator's detection: exact whole-word match of the link slug, or of every
    word in the link name; longest slug wins ties."""
    words = [w for w in re.split(r"[\s\-_/]+", keyword.lower()) if w]
    best: tuple[int, str] | None = None
    for link in links:
        slug = str(link.get("slug", "")).lower()
        name_words = str(link.get("name", "")).lower().split()
        url = link.get("affiliate_url")
        if not url:
            continue
        if slug in words or (name_words and all(w in words for w in name_words)):
            if best is None or len(slug) > best[0]:
                best = (len(slug), str(url))
    return best[1] if best else None


class AdminAPI:
    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = (base_url or config.BASE_URL).rstrip("/")
        self.session = requests.Session()

    # -- auth ---------------------------------------------------------------

    def login(self) -> None:
        if config.DRY_RUN:
            print("[dry-run] login → skipping POST /api/admin/login")
            return
        password = config.require("ADMIN_PASSWORD")
        res = self.session.post(
            f"{self.base_url}/api/admin/login", json={"password": password}, timeout=30
        )
        if res.status_code != 200 or "admin_auth" not in self.session.cookies:
            raise RuntimeError(f"admin login failed: HTTP {res.status_code} {res.text[:200]}")
        print("login → authenticated (admin_auth cookie set)")

    # -- analytics ------------------------------------------------------------

    def get_analytics(self) -> dict[str, Any]:
        if config.DRY_RUN:
            return _fixture_analytics()
        res = self.session.get(f"{self.base_url}/api/admin/analytics", timeout=30)
        res.raise_for_status()
        return res.json()

    # -- seo pipeline -----------------------------------------------------------

    def seo_outline(
        self,
        keyword: str,
        intent: str,
        weaknesses: list[str] | None = None,
        article_type: str = "explainer",
    ) -> str:
        if config.DRY_RUN:
            return _fixture_outline(keyword, article_type)
        res = self.session.post(
            f"{self.base_url}/api/admin/seo/outline",
            json={
                "keyword": keyword,
                "intent": intent,
                "weaknesses": weaknesses or [],
                "articleType": article_type,
            },
            timeout=120,
        )
        res.raise_for_status()
        return res.json()["outline"]

    def seo_content(
        self,
        keyword: str,
        outline: str,
        intent: str,
        article_type: str,
        affiliate_link: str | None = None,
        affiliate_links: list[dict[str, Any]] | None = None,
    ) -> tuple[str, str]:
        """Generate the article body.

        The endpoint streams a ``text/plain`` body (up to ~5 min). The first
        line is ``TITLE: <title>``; it is split off and the remainder returned
        as markdown.
        """
        if config.DRY_RUN:
            text = _fixture_content(keyword)
        else:
            res = self.session.post(
                f"{self.base_url}/api/admin/seo/content",
                json={
                    "keyword": keyword,
                    "outline": outline,
                    "intent": intent,
                    "articleType": article_type,
                    "affiliateLink": affiliate_link,
                    "affiliateLinks": affiliate_links or [],
                },
                stream=True,
                timeout=CONTENT_TIMEOUT_S,
            )
            res.raise_for_status()
            chunks: list[bytes] = []
            for chunk in res.iter_content(chunk_size=65536):
                chunks.append(chunk)
            text = b"".join(chunks).decode("utf-8", errors="replace")
        first, _, rest = text.partition("\n")
        if first.startswith("TITLE:"):
            return first[len("TITLE:") :].strip(), rest.strip()
        return keyword.title(), text.strip()

    def seo_meta_tags(
        self, content: str, keyword: str, title: str, article_type: str | None = None
    ) -> dict[str, Any]:
        if config.DRY_RUN:
            return _fixture_meta_tags(keyword, title)
        # articleType lets the route pick review vs educational quick-facts
        # prompts; omitting it keeps the route's default (review) behavior.
        payload: dict[str, Any] = {"content": content, "keyword": keyword, "title": title}
        if article_type:
            payload["articleType"] = article_type
        res = self.session.post(
            f"{self.base_url}/api/admin/seo/meta-tags",
            json=payload,
            timeout=120,
        )
        res.raise_for_status()
        return res.json()

    # -- affiliates / publishing ------------------------------------------------

    def get_affiliate_links(self) -> list[dict[str, Any]]:
        if config.DRY_RUN:
            return [
                {
                    "slug": "bybit",
                    "name": "Bybit",
                    "affiliate_url": "https://www.bybit.com/invite?ref=T365",
                    "general_url": "https://www.bybit.com",
                },
                {
                    "slug": "binance",
                    "name": "Binance",
                    "affiliate_url": "https://accounts.binance.com/register?ref=T365",
                    "general_url": "https://www.binance.com",
                },
            ]
        res = self.session.get(f"{self.base_url}/api/admin/affiliate-links", timeout=30)
        res.raise_for_status()
        return res.json()

    def publish_article(self, payload: dict[str, Any]) -> dict[str, Any]:
        if config.DRY_RUN:
            print(
                f"[dry-run] publish → POST /api/admin/articles "
                f"({payload['category_slug']}/{payload['slug']}, published={payload['published']})"
            )
            return {**payload, "id": "dry-run-article-id"}
        res = self.session.post(
            f"{self.base_url}/api/admin/articles", json=payload, timeout=60
        )
        if res.status_code != 201:
            raise RuntimeError(f"publish failed: HTTP {res.status_code} {res.text[:300]}")
        return res.json()

    def list_articles(self) -> list[dict[str, Any]]:
        """All articles (id, slug, title, category_slug, published, …) — the
        duplicate-detection corpus for the pipeline and planner."""
        if config.DRY_RUN:
            return _fixture_articles()
        res = self.session.get(f"{self.base_url}/api/admin/articles", timeout=30)
        res.raise_for_status()
        return res.json()


def build_article_payload(
    keyword: str,
    title: str,
    body_markdown: str,
    meta: dict[str, Any],
    article_type: str,
    published: bool = True,
) -> dict[str, Any]:
    """Assemble the POST /api/admin/articles body per the admin contract."""
    category_slug = category_slug_for(article_type)
    # Excerpt: first real PROSE block — generated bodies lead with a
    # "## Verdict" heading, so naive first-block extraction yields "Verdict".
    paragraphs = [p.strip() for p in body_markdown.split("\n\n") if p.strip()]
    first_paragraph = next(
        (p for p in paragraphs if not p.startswith(("#", "|", "-", ">"))),
        "",
    )
    prose = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", first_paragraph)  # [text](url) → text
    excerpt = re.sub(r"[#*_`]", "", prose)[:160].strip()
    word_count = len(body_markdown.split())
    return {
        "slug": slugify(keyword),
        "title": title,
        "excerpt": excerpt,
        "content": body_markdown,
        "category": category_label_for(article_type),
        "category_slug": category_slug,
        "date": today_iso(),
        "read_time": f"{max(3, round(word_count / 200))} min read",
        "author": "Trading365",
        "rating": 0,
        "thumbnail": "",
        "tags": [keyword],
        "faqs": meta.get("faqs", []),
        "pros": meta.get("pros", []),
        "cons": meta.get("cons", []),
        "meta_title": meta.get("meta_title", title),
        "meta_description": meta.get("meta_description", excerpt),
        "meta_keywords": meta.get("meta_keywords", keyword),
        "published": published,
    }


# --- Fixtures ------------------------------------------------------------------


def _fixture_analytics() -> dict[str, Any]:
    today = today_iso()
    daily = [
        {"day": shift_days(today, -i), "views": v, "sessions": v // 2}
        for i, v in zip(range(7, -1, -1), [410, 385, 402, 368, 441, 395, 388, 240])
    ]
    total_views = sum(d["views"] for d in daily)
    return {
        "totals": {"views": total_views, "visitors": int(total_views * 0.72), "sessions": int(total_views * 0.51)},
        "visitors": int(total_views * 0.72),
        "sessions": int(total_views * 0.51),
        "sessionStats": {"avgDuration": 96, "bounceRate": 0.58},
        "daily": daily,
        "topPages": [
            {"page": "/reviews/bybit-review-2026", "views": 92},
            {"page": "/explainers/what-is-leverage-trading", "views": 71},
        ],
        "topReferrers": [{"referrer": "google", "views": 210}, {"referrer": "direct", "views": 80}],
        "affiliateClicks": [{"slug": "bybit", "clicks": 34}, {"slug": "binance", "clicks": 21}],
    }


def _fixture_outline(keyword: str, article_type: str) -> str:
    return (
        f"# Outline: {keyword}\n"
        f"- H1: {keyword.title()}\n"
        f"- H2: Quick verdict\n"
        f"- H2: Key features\n"
        f"- H2: Fees and limits\n"
        f"- H2: Pros and cons\n"
        f"- H2: FAQ\n"
        f"(article_type={article_type})"
    )


def _fixture_content(keyword: str) -> str:
    title = keyword.title() if not keyword.lower().endswith("review 2026") else keyword.title()
    return (
        f"TITLE: {title}\n\n"
        f"{keyword.title()} is one of the most-searched topics among crypto traders this year, "
        f"and for good reason.\n\n"
        f"## Quick verdict\n\n"
        f"After hands-on testing, our verdict is positive with caveats around fees for small accounts.\n\n"
        f"## Key features\n\n"
        f"The platform offers spot and derivatives markets, a demo mode, and 24/7 support.\n\n"
        f"## FAQ\n\n"
        f"**Is it safe?** It ticks the standard security boxes: 2FA, cold storage, proof of reserves."
    )


def _fixture_meta_tags(keyword: str, title: str) -> dict[str, Any]:
    return {
        "meta_title": f"{title} | Trading365"[:60],
        "meta_description": f"Hands-on {keyword} — fees, features, safety and our honest verdict.",
        "meta_keywords": f"{keyword}, trading365, crypto",
        "pros": ["Low fees", "Strong security record", "Fast execution"],
        "cons": ["Limited fiat on-ramps", "Not available in all regions"],
        "quick_facts_md": "- Founded: 2018\n- Fees: from 0.1%\n- KYC: required",
        "faqs": [
            {"question": f"Is {keyword.split()[0].title()} safe?", "answer": "Yes, with standard caveats."},
            {"question": "What are the fees?", "answer": "From 0.1% per trade."},
        ],
    }


def _fixture_articles() -> list[dict[str, Any]]:
    return [
        {"id": 111, "slug": "crypto-com-review-what-actually-changed",
         "title": "Crypto.com Review 2026: What Actually Changed (Fees, CRO, Cards & Regulation)",
         "category_slug": "reviews", "published": True},
        {"id": 110, "slug": "best-crypto-exchanges-for-chinese-residents",
         "title": "Best Crypto Exchanges for Chinese Residents (2026 Guide)",
         "category_slug": "guides", "published": True},
        {"id": 106, "slug": "coinbase-vs-crypto-com-which-is-better",
         "title": "Coinbase vs Crypto.com 2026: Which Crypto Exchange Is Better?",
         "category_slug": "comparisons", "published": True},
        {"id": 95, "slug": "weex-review", "title": "WEEX Review 2026: Fees, Leverage & Safety",
         "category_slug": "reviews", "published": True},
    ]
