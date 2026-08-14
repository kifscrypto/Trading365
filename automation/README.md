# Trading365 Ops Automation

Phase-2 automation scripts for the personal ops dashboard. They run on Windows
via Task Scheduler, driving the Trading365 admin API over HTTP, pulling Google
Search Console data, drafting Gmail replies, and assembling a morning briefing
JSON. **Every script supports `--dry-run`** using bundled fixture data — the
whole suite runs with NO credentials and NO network in that mode.

State lives in `automation/data/` (git-ignored): one JSON file per collection
(`content`, `tasks`, `inbox`, `outreach`, `templates`, `cycles`,
`quora_queue`), traffic snapshots under `data/traffic/`, briefings under
`data/briefings/`. Collections are auto-seeded with starter data on first use.

## Quickstart

```bash
cd automation
pip install -r requirements.txt
cp .env.example .env   # fill in credentials (only needed for live runs)
```

Then verify everything works without touching anything real:

```bash
python traffic_digest.py --dry-run
python article_pipeline.py --dry-run
python article_pipeline.py --dry-run --review
python crosspost.py --dry-run
python kifs_gmail.py --dry-run
python report_builder.py --dry-run
python serve.py          # serves http://127.0.0.1:4173 — Ctrl+C to stop
```

## Scripts

| Script | Schedule | What it does |
|---|---|---|
| `traffic_digest.py` | 06:30 daily | GSC (yesterday + last 8 days) + on-site analytics → merged snapshot with anomaly flags (>30% drop vs same weekday last week warns; spikes are informational). Saves `data/traffic/traffic-YYYY-MM-DD.json`. |
| `article_pipeline.py` | 07:00 daily | Takes today's content-calendar `idea` (keyword required), runs outline → streaming content → meta tags via the admin API, publishes the article, marks the item published, cross-posts to X + queues a Quora draft. Guards: duplicate-keyword blocking, already-published refusal. `--review` saves the article unpublished for manual review in the admin. |
| `crosspost.py` | on demand | Standalone pass over published-but-unposted items (X post + Quora draft queue). Also called by the pipeline after publishing. |
| `kifs_gmail.py` | every 30–60 min | Polls the KIFS Gmail inbox, classifies sponsorship emails (review/sponsor/collab/partnership/promotion/media kit), files them in `inbox` and creates Gmail **drafts** (never sends). Also creates follow-up drafts for due outreach contacts and bumps their stage (+4 days). |
| `report_builder.py` | 07:30 daily / logon | Assembles `data/briefings/briefing-YYYY-MM-DD.json` (traffic, today's article, tasks, inbox, follow-ups, voting-cycle phases) and prints a plain-text morning briefing. |
| `serve.py` | on demand | Tiny local API (stdlib only) on :4173 the dashboard reads: `GET /api/<collection>`, `PUT /api/<collection>`, `GET /api/briefing/latest`, `GET /api/traffic/latest`. |

Day boundaries use **local-time** `YYYY-MM-DD` strings throughout
(`ops/dates.py`) — never UTC conversion.

## Windows Task Scheduler setup

Concrete `schtasks` commands (run from an elevated or normal prompt; adjust the
path if the repo moves):

```bat
schtasks /create /tn "T365 Traffic Digest"  /tr "\"C:\Users\Lee\AppData\Local\Programs\Python\Python314\python.exe\" \"C:\Users\Lee\OneDrive\JOEY (Asylum)\MAX clone with games\meme-asylum\Trading365\automation\traffic_digest.py\"" /sc daily /st 06:30 /f
schtasks /create /tn "T365 Article Pipeline" /tr "\"C:\Users\Lee\AppData\Local\Programs\Python\Python314\python.exe\" \"C:\Users\Lee\OneDrive\JOEY (Asylum)\MAX clone with games\meme-asylum\Trading365\automation\article_pipeline.py\"" /sc daily /st 07:00 /f
schtasks /create /tn "T365 Report Builder"  /tr "\"C:\Users\Lee\AppData\Local\Programs\Python\Python314\python.exe\" \"C:\Users\Lee\OneDrive\JOEY (Asylum)\MAX clone with games\meme-asylum\Trading365\automation\report_builder.py\"" /sc daily /st 07:30 /f
schtasks /create /tn "T365 KIFS Gmail"      /tr "\"C:\Users\Lee\AppData\Local\Programs\Python\Python314\python.exe\" \"C:\Users\Lee\OneDrive\JOEY (Asylum)\MAX clone with games\meme-asylum\Trading365\automation\kifs_gmail.py\"" /sc hourly /f
```

Notes:

- Use `where python` to find your real interpreter path and substitute it.
- Scripts resolve all paths relative to their own location, so no working
  directory needs to be configured on the tasks.
- Check results in Task Scheduler's "Last Run Result" column, or add
  `>> "%USERPROFILE%\t365-ops.log" 2>&1` inside a `cmd /c "..."` wrapper for logs.

## Credential checklist

- **ADMIN_PASSWORD** — the admin password configured in Vercel env for the
  Trading365 app (same one the `/api/admin/login` route checks).
- **GSC service account** — create one in Google Cloud Console, enable the
  Search Console API, add the service-account email as a user on the
  trading365.org Search Console property, then set `GSC_CLIENT_EMAIL` and
  `GSC_PRIVATE_KEY` (keep the `\n` escapes, quoted, as in `.env.example`).
- **X API** — OAuth1 user-context keys from the X developer portal:
  `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`.
- **Gmail OAuth (KIFS)** — OAuth *desktop* client from Google Cloud Console
  with the Gmail API enabled; download the JSON as
  `automation/client_secret.json`. Also
  `pip install google-api-python-client google-auth-oauthlib`. First live run
  opens a browser consent flow; the token is cached at `data/gmail_token.json`.

## Safety notes

- Gmail scripts create **drafts only — they never send**.
- X posts are real posts in live mode; use `--dry-run` to preview the text.
- The article pipeline **publishes live by default** per design; pass
  `--review` for a review-first flow (article saved unpublished, publish
  manually in the admin).
- `--dry-run` never touches the network and never writes to `data/`.
