"""Google Search Console client — port of the repo's ``lib/gsc.ts``.

Service-account flow: RS256 JWT signed with ``cryptography``, exchanged for an
access token, then ``searchAnalytics/query`` against trading365.org.
"""

import base64
import json
import time
from typing import Any
from urllib.parse import quote

import requests

from . import config
from .dates import shift_days, today_iso

SITE_URL = "https://trading365.org/"
TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"
QUERY_URL = (
    "https://searchconsole.googleapis.com/webmasters/v3/sites/"
    f"{quote(SITE_URL, safe='')}/searchAnalytics/query"
)


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def get_access_token() -> str:
    """Mint an OAuth access token from the GSC service-account JWT."""
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    client_email = config.require("GSC_CLIENT_EMAIL")
    private_key_pem = config.require("GSC_PRIVATE_KEY").replace("\\n", "\n")

    now = int(time.time())
    header = _b64url(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    payload = _b64url(
        json.dumps(
            {
                "iss": client_email,
                "scope": SCOPE,
                "aud": TOKEN_URL,
                "exp": now + 3600,
                "iat": now,
            }
        ).encode()
    )
    signing_input = f"{header}.{payload}"
    key = serialization.load_pem_private_key(private_key_pem.encode(), password=None)
    signature = key.sign(signing_input.encode(), padding.PKCS1v15(), hashes.SHA256())
    jwt = f"{signing_input}.{_b64url(signature)}"

    res = requests.post(
        TOKEN_URL,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": jwt,
        },
        timeout=30,
    )
    data = res.json()
    if not res.ok:
        raise RuntimeError(f"GSC token error: {data.get('error_description') or res.text[:200]}")
    return data["access_token"]


def _normalize_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "keys": r.get("keys", []),
            "clicks": r.get("clicks", 0),
            "impressions": r.get("impressions", 0),
            "ctr": round(r.get("ctr", 0.0) * 1000) / 10,
            "position": round(r.get("position", 0.0) * 10) / 10,
        }
        for r in rows
    ]


def query_search_analytics(
    start_date: str,
    end_date: str,
    dimensions: tuple[str, ...] = ("query",),
    row_limit: int = 1000,
    page_filter: str | None = None,
) -> list[dict[str, Any]]:
    """Query GSC search analytics, returning normalized rows."""
    if config.DRY_RUN:
        return _fixture_rows(dimensions)
    body: dict[str, Any] = {
        "startDate": start_date,
        "endDate": end_date,
        "dimensions": list(dimensions),
        "rowLimit": row_limit,
    }
    if page_filter:
        body["dimensionFilterGroups"] = [
            {"filters": [{"dimension": "page", "operator": "equals", "expression": page_filter}]}
        ]
    res = requests.post(
        QUERY_URL,
        headers={
            "Authorization": f"Bearer {get_access_token()}",
            "Content-Type": "application/json",
        },
        json=body,
        timeout=60,
    )
    res.raise_for_status()
    return _normalize_rows(res.json().get("rows", []))


def _fixture_rows(dimensions: tuple[str, ...]) -> list[dict[str, Any]]:
    today = today_iso()
    first = dimensions[0] if dimensions else "query"
    if first == "date":
        values = [
            (shift_days(today, -i), c, imp)
            for i, (c, imp) in zip(
                range(7, -1, -1),
                [(52, 1300), (48, 1210), (55, 1402), (47, 1180), (60, 1505), (51, 1260), (50, 1250), (31, 900)],
            )
        ]
    elif first == "page":
        values = [
            ("https://trading365.org/reviews/bybit-review-2026", 41, 980),
            ("https://trading365.org/explainers/what-is-leverage-trading", 28, 760),
            ("https://trading365.org/guides/how-to-read-crypto-charts", 17, 540),
        ]
    else:  # query
        values = [
            ("bybit review", 38, 890),
            ("bybit fees", 22, 610),
            ("what is leverage trading", 19, 700),
            ("binance vs bybit", 12, 430),
            ("best crypto exchange 2026", 9, 520),
        ]
    return _normalize_rows(
        [
            {
                "keys": [k],
                "clicks": c,
                "impressions": i,
                "ctr": c / i,
                "position": p,
            }
            for (k, c, i), p in zip(values, [4.2, 5.1, 6.8, 8.3, 11.0, 3.9, 7.4, 9.6])
        ]
    )
