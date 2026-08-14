"""KIFS Gmail watcher — scheduled every 30–60 min.

Polls the KIFS Gmail inbox for unread messages, classifies sponsorship
candidates, files them into the ``inbox`` collection and creates Gmail
DRAFTS (never sends) from the templates collection. Also creates follow-up
drafts for due outreach contacts and bumps their stage.

First live run opens a browser consent flow; the token is cached at
``data/gmail_token.json``.
"""

import argparse
import base64
import re
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

from ops import config, store
from ops.dates import shift_days, today_iso

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
]

SPONSOR_RE = re.compile(r"\b(review|sponsor|collab|partnership|promotion|media kit)\b", re.I)
NEXT_STAGE = {"contacted": "followup1", "followup1": "followup2"}
FOLLOWUP_TEMPLATE = "outreach-followup"

TOKEN_PATH = config.DATA_DIR / "gmail_token.json"
CLIENT_SECRET_PATH = Path(
    config.get("KIFS_GMAIL_CLIENT_SECRET") or str(config.AUTOMATION_DIR / "client_secret.json")
)


def _import_google():
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        from googleapiclient.discovery import build
    except ImportError:
        raise SystemExit(
            "Gmail support needs extra packages — run:\n"
            "  pip install google-api-python-client google-auth-oauthlib"
        )
    return Request, Credentials, InstalledAppFlow, build


def _gmail_service():
    Request, Credentials, InstalledAppFlow, build = _import_google()
    creds = None
    if TOKEN_PATH.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    if not creds or not creds.valid:
        if not CLIENT_SECRET_PATH.exists():
            raise RuntimeError(
                f"Gmail OAuth client secret not found at {CLIENT_SECRET_PATH} — "
                f"download it from Google Cloud Console (see README)"
            )
        flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET_PATH), SCOPES)
        creds = flow.run_local_server(port=0)
    TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_PATH.write_text(creds.to_json(), encoding="utf-8")
    return build("gmail", "v1", credentials=creds)


# --- classification / templating ----------------------------------------------


def is_sponsorship_candidate(subject: str, body: str) -> bool:
    return bool(SPONSOR_RE.search(f"{subject}\n{body}"))


def guess_company(from_header: str) -> str:
    """Display name, else the domain's second-level part."""
    match = re.match(r"^\s*(.+?)\s*<[^>]+>\s*$", from_header)
    if match:
        name = match.group(1).strip().strip('"')
        if name:
            return name
    domain_match = re.search(r"@([A-Za-z0-9.-]+)", from_header)
    if domain_match:
        return domain_match.group(1).split(".")[-2].title()
    return from_header.strip() or "there"


def guess_contact_name(from_header: str) -> str:
    match = re.match(r'^\s*"?([A-Za-z]+)', from_header)
    return match.group(1) if match else "there"


def render_template(body: str, *, subject: str, company: str, contact_name: str) -> str:
    return (
        body.replace("{{subject}}", subject)
        .replace("{{company}}", company)
        .replace("{{contactName}}", contact_name)
    )


def create_draft(service: Any, to: str, subject: str, body: str) -> str:
    """Create a Gmail draft (NEVER sends). Returns the draft id."""
    if config.DRY_RUN:
        print(f"[dry-run] would create Gmail draft → to={to} subject={subject!r}")
        return "dry-run-draft-id"
    message = MIMEText(body)
    message["to"] = to
    message["subject"] = subject
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode("ascii")
    draft = service.users().drafts().create(userId="me", body={"message": {"raw": raw}}).execute()
    print(f"  created Gmail draft {draft['id']} → {to}")
    return draft["id"]


# --- live inbox polling ---------------------------------------------------------


def _header(headers: list[dict[str, str]], name: str) -> str:
    for h in headers:
        if h.get("name", "").lower() == name.lower():
            return h.get("value", "")
    return ""


def poll_unread(service: Any) -> list[dict[str, str]]:
    result = (
        service.users()
        .messages()
        .list(userId="me", q="is:unread", labelIds=["INBOX"], maxResults=25)
        .execute()
    )
    emails = []
    for stub in result.get("messages", []):
        msg = (
            service.users()
            .messages()
            .get(userId="me", id=stub["id"], format="metadata",
                 metadataHeaders=["From", "Subject", "Date"])
            .execute()
        )
        headers = msg.get("payload", {}).get("headers", [])
        emails.append(
            {
                "messageId": stub["id"],
                "from": _header(headers, "From"),
                "subject": _header(headers, "Subject"),
                "date": _header(headers, "Date"),
                "snippet": msg.get("snippet", ""),
            }
        )
    return emails


def _fixture_emails() -> list[dict[str, str]]:
    return [
        {
            "messageId": "18f3a2c1d4e5b6a7",
            "from": "Growth Team <growth@stakinghub.io>",
            "subject": "Partnership & sponsored review proposal",
            "date": today_iso(),
            "snippet": "Hi, we'd love to discuss a sponsored review and media kit for Trading365...",
        },
        {
            "messageId": "18f3a2c1d4e5b6a8",
            "from": "no-reply@accounting.example.com",
            "subject": "Your March invoice",
            "date": today_iso(),
            "snippet": "Please find attached your invoice for March...",
        },
    ]


# --- main flows -----------------------------------------------------------------


def process_inbox(service: Any, templates: dict[str, dict[str, Any]]) -> tuple[int, int]:
    emails = _fixture_emails() if config.DRY_RUN else poll_unread(service)
    inbox = store.load("inbox", store.seed_inbox)
    known_ids = {e["id"] for e in inbox}
    new_count = drafted = 0
    changed = False

    for mail in emails:
        entry_id = f"gmail-{mail['messageId']}"
        if entry_id in known_ids:
            continue
        if not is_sponsorship_candidate(mail["subject"], mail["snippet"]):
            print(f"  skip (not sponsorship): {mail['subject']!r}")
            continue
        company = guess_company(mail["from"])
        contact = guess_contact_name(mail["from"])
        entry = {
            "id": entry_id,
            "from": mail["from"],
            "company": company,
            "subject": mail["subject"],
            "receivedAt": mail["date"] or today_iso(),
            "status": "new",
        }
        inbox.append(entry)
        known_ids.add(entry_id)
        changed = True
        new_count += 1
        print(f"  new sponsorship candidate: {mail['subject']!r} ({company})")

        template = templates.get("review-interest")
        if template:
            body = render_template(
                template["body"], subject=mail["subject"], company=company, contact_name=contact
            )
            subject = render_template(
                template["subject"], subject=mail["subject"], company=company, contact_name=contact
            )
            draft_id = create_draft(service, mail["from"], subject, body)
            entry["status"] = "drafted"
            entry["templateId"] = "review-interest"
            entry["notes"] = f"draft {draft_id}"
            drafted += 1
        else:
            print("  warning: template 'review-interest' missing from templates collection")

    if changed and not config.DRY_RUN:
        store.save("inbox", inbox)
    elif changed:
        print("[dry-run] would save inbox collection")
    return new_count, drafted


def process_followups(service: Any, templates: dict[str, dict[str, Any]]) -> int:
    contacts = store.load("outreach", store.seed_outreach)
    template = templates.get(FOLLOWUP_TEMPLATE)
    today = today_iso()
    sent = 0
    for contact in contacts:
        stage = contact.get("stage")
        if stage not in NEXT_STAGE:
            continue
        next_touch = contact.get("nextTouch")
        if not next_touch or next_touch > today:
            continue
        print(f"  follow-up due: {contact['company']} ({stage} → {NEXT_STAGE[stage]})")
        if template:
            body = render_template(
                template["body"],
                subject=f"{contact['company']} partnership",
                company=contact["company"],
                contact_name=contact.get("contactName", "there"),
            )
            draft_id = create_draft(service, contact["email"], template["subject"].replace("{{company}}", contact["company"]), body)
            contact["notes"] = (contact.get("notes") or "") + f" follow-up draft {draft_id}".strip()
        else:
            print(f"  warning: template '{FOLLOWUP_TEMPLATE}' missing — bumping stage without draft")
        contact["stage"] = NEXT_STAGE[stage]
        contact["lastTouch"] = today
        contact["nextTouch"] = shift_days(today, 4)
        sent += 1
    if sent:
        if config.DRY_RUN:
            print(f"[dry-run] would save outreach collection ({sent} contact(s) bumped)")
        else:
            store.save("outreach", contacts)
    else:
        print("  no follow-ups due")
    return sent


def main() -> int:
    parser = argparse.ArgumentParser(description="KIFS Gmail watcher — drafts only, never sends")
    parser.add_argument("--dry-run", action="store_true", help="fixture emails, no network, no writes")
    args = parser.parse_args()
    config.set_dry_run(args.dry_run)

    service = None if config.DRY_RUN else _gmail_service()
    templates = {t["id"]: t for t in store.load("templates", store.seed_templates)}

    print("kifs gmail: scanning inbox")
    new_count, drafted = process_inbox(service, templates)
    print("kifs gmail: checking outreach follow-ups")
    followups = process_followups(service, templates)

    print(f"kifs gmail done: {new_count} new candidate(s), {drafted} draft(s), {followups} follow-up(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
