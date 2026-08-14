# Trading365 Ops Automation

Phase-2 automation scripts for the personal ops dashboard. They run on Windows
via Task Scheduler, driving the Trading365 admin API over HTTP, pulling Google
Search Console data, drafting Gmail replies, and assembling a morning briefing
JSON. **Every script supports `--dry-run`** using bundled fixture data — the
whole suite runs with NO credentials and NO network in that mode.

State lives in `automation/data/` (git-ignored): one JSON file per collection
(`content`, `tasks`, `inbox`, `outreach`, `templates`, `cycles`,
`quora_queue`), traffic snapshots under `data/traffic/`, briefings under
`data/briefings/`, health snapshots under `data/health/`. Collections are
auto-seeded with starter data on first use.

## Quickstart

```bash
cd automation
pip install -r requirements.txt
cp .env.example .env   # fill in credentials (only needed for live runs)
```

Then verify everything works without touching anything real:

```bash
python traffic_digest.py --dry-run
python health_check.py --dry-run
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
| `health_check.py` | 06:15 daily | Site health + security-regression monitor for trading365.org and memeasylum.com: uptime + latency, and re-probes the 2026-08-13 breach holes (forged `admin_auth` cookie must get 401, open admin/translate endpoints must get 401, `/ops` must 307 when unauthenticated). Saves `data/health/health-YYYY-MM-DD.json`. **Exit code 1 if any critical check fails** (Task Scheduler shows the run as failed); a down site is a failed check, not a crash. |
| `traffic_digest.py` | 06:30 daily | GSC (yesterday + last 8 days) + on-site analytics → merged snapshot with anomaly flags (>30% drop vs same weekday last week warns; spikes are informational). Saves `data/traffic/traffic-YYYY-MM-DD.json`. |
| `article_pipeline.py` | 07:00 daily | Takes today's content-calendar `idea` (keyword required), runs outline → streaming content → meta tags via the admin API, publishes the article, marks the item published, cross-posts to X + queues a Quora draft. Guards: duplicate-keyword blocking, already-published refusal. `--review` saves the article unpublished for manual review in the admin. |
| `crosspost.py` | on demand | Standalone pass over published-but-unposted items (X post + Quora draft queue). Also called by the pipeline after publishing. |
| `kifs_gmail.py` | every 30–60 min | Polls the KIFS Gmail inbox, classifies sponsorship emails (review/sponsor/collab/partnership/promotion/media kit), files them in `inbox` and creates Gmail **drafts** (never sends). Also creates follow-up drafts for due outreach contacts and bumps their stage (+4 days). |
| `report_builder.py` | 07:30 daily / logon | Assembles `data/briefings/briefing-YYYY-MM-DD.json` (traffic, site health, today's article, tasks, inbox, follow-ups, voting-cycle phases) and prints a plain-text morning briefing. |
| `serve.py` | on demand | Tiny local API (stdlib only) on :4173 the dashboard reads: `GET /api/<collection>`, `PUT /api/<collection>`, `GET`/`PUT /api/<prefix>-YYYY-MM-DD` (dated snapshots), `GET /api/briefing/latest`, `GET /api/traffic/latest`, `GET /api/health/latest`. |

`health_check.py` exit codes: `0` = all critical checks passed (non-critical
failures still exit 0), `1` = at least one critical check failed. To test the
alerting path without a real breach, run
`HEALTH_FIXTURE_SCENARIO=breach python health_check.py --dry-run` — the
fixtures then simulate the old exploit succeeding (admin endpoints answer
200) and the run exits 1.

Day boundaries use **local-time** `YYYY-MM-DD` strings throughout
(`ops/dates.py`) — never UTC conversion.

## Shared data layer

`ops/store.py` has two backends, selected by environment:

- **`OPS_API_URL` unset (default):** local JSON files under `data/` exactly as
  before, with `serve.py` exposing them on :4173 for the dashboard.
- **`OPS_API_URL` + `OPS_API_TOKEN` set** (e.g.
  `OPS_API_URL=https://trading365.org/api/ops`): every collection load/save,
  traffic snapshot, health snapshot and briefing reads/writes the site's
  Postgres via the site's `/api/ops` routes, authenticated with
  `Authorization: Bearer $OPS_API_TOKEN`. The dashboard then reads the same
  data same-origin.

`--dry-run` never uses the HTTP backend — no network, no writes, local files
only, regardless of these variables.

## Windows Task Scheduler setup

Concrete `schtasks` commands (run from an elevated or normal prompt; adjust the
path if the repo moves):

```bat
schtasks /create /tn "T365 Health Check"    /tr "\"C:\Users\Lee\AppData\Local\Programs\Python\Python314\python.exe\" \"C:\Users\Lee\OneDrive\JOEY (Asylum)\MAX clone with games\meme-asylum\Trading365\automation\health_check.py\"" /sc daily /st 06:15 /f
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
