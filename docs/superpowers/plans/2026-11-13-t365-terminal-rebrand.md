# T365 Terminal Rebrand + Landing Page Rebuild — Build Brief

Audience: an implementing engineer (Deepseek) with NO prior context. Read everything before editing.
Environment: Windows, PowerShell 5.1 (no `&&`; use `;` or `if ($?)`). Repo root `C:\dev\trading365`.
Do NOT commit or push unless the owner tells you to.

## 1. Decision

Product "T365 Desk" is renamed **T365 Terminal** (long form: "Trading365 Terminal").
Positioning: the all-in-one crypto terminal you OWN. Rent vs own. Tagline: **"The crypto terminal you own."**

Naming rule: always write "T365 Terminal" or "Trading365 Terminal", never bare "Terminal"
(Microsoft's "Windows Terminal" would swallow search and confuse buyers).

## 2. Starting state

The "Every tool. One desk. Yours forever." interim copy and the new OG card (`app/desk/opengraph-image.tsx`, `lib/og/desk-card.tsx`, `scripts/og-preview.mjs` Desk fixture) are committed on `main`. Build on top of them.
Untracked `T365-Desk-Setup-1.1.2.exe` at repo root is a build artifact: never stage it.

## 3. DO NOT CHANGE (breaks installed customers)

Installed 1.1.x apps and issued licences depend on these. Leave them exactly as-is:
- `desktop/package.json` field `"name": "t365-desk"` (it may determine Electron's userData path; changing it can orphan users' local data and licence).
- `appId: org.trading365.desk` in `desktop/electron-builder.yml`.
- Licence product id `'t365-desk'`, key prefix `T365D1`, public key, `desktop/src/main/license.ts` logic.
- Database `product = 't365-desk'` values and `DESK_PRODUCT.product` / `.key`.
- API routes `app/api/desk/*` (checkout, download, version, license). Installed apps call `/api/desk/version` and `/api/desk/download` by URL.
- The local data file name `t365-desk-state.json` in `desktop/src/main/main.ts`.
- `lib/data/authors.ts` / `lib/data/articles.ts` "Trading365 Editorial Desk": unrelated, a newsroom desk.
- Everything under `docs/superpowers/specs` and `docs/superpowers/plans/*` except this file: historical.

Only USER-FACING strings and the public page route change.

## 4. Tasks, in order

### Task A — Desktop app strings (`desktop/`)
Find every user-facing "Desk": `Get-ChildItem -Recurse desktop\src | Select-String -Pattern 'desk' ` (case-insensitive). Change user-visible text only:
- `src/renderer/index.html`: `<title>`, brand lockup `aria-label`, the brand-product label `DESK` -> `TERMINAL`, `.version` line `T365 DESK · LOCAL V1` -> `T365 TERMINAL · LOCAL V1`, noscript text, the concept card "Your desk. Yours to keep." -> "Your terminal. Yours to keep."
- `src/renderer/app.js`: all `T365 Desk` strings (paywall, update banner, toasts, `document.title`) and the Settings hero "Your desk. Yours to keep." -> "Your terminal. Yours to keep."
- `src/main/main.ts`: notification title, backup dialog title, `BrowserWindow` title, error box title. (NOT the data file name.)
- `src/main/service.ts`: the two messages.
- `src/main/providers.ts`, `news.ts`: User-Agent `T365-Desk/1.0` -> `T365-Terminal/1.0`.
- `electron-builder.yml`: `productName: T365 Terminal`, `shortcutName: T365 Terminal`, add `artifactName: T365-Terminal-Setup-${version}.${ext}` under `nsis:`.
- `package.json`: bump `"version"` to `1.2.0`, `description` text only. Keep `"name"`.
Check: `cd desktop; pnpm typecheck; node --check src\renderer\app.js`.

### Task B — Website route rename `/desk` -> `/terminal`
- `git mv app/desk app/terminal` (includes `page.tsx` and `opengraph-image.tsx`).
- `next.config.mjs` `redirects()`: add `{ source: '/desk', destination: '/terminal', permanent: true }` near the top (after the www redirect). Do NOT redirect `/api/desk/*`.
- Update canonical/URL constants in `app/terminal/page.tsx` (`DESK_URL` -> `https://trading365.org/terminal`).
- `components/site-header.tsx` (line ~26): `{ href: "/terminal", label: "T365 Terminal" }`.
- `components/home/hero.tsx`: link `href="/terminal"`, eyebrow `T365 TERMINAL · ONE-TIME PURCHASE`, `aria-label`.
- `app/sitemap.ts`, `app/robots.ts`, `middleware.ts`, `lib/` and `components/`: `Select-String -Pattern '"/desk|/desk"|/desk\b'` and fix page links. Leave `/api/desk/...` alone.
- `lib/desk.ts`: `label: 'T365 Terminal'`, invoice `order_description`. Keep every id/key. `downloadPath` stays `/api/desk/download`.
- `app/api/desk/checkout/route.ts`: error strings only. `app/api/desk/version/route.ts`: comment only.
- `components/desk-checkout-button.tsx` -> "Buy T365 Terminal once". `components/desk-purchases.tsx` and `lib/email.ts` (~lines 387-394): all strings.
- `app/api/desk/checkout/route.ts` success/cancel URLs live in `lib/desk.ts` (`/account?...`): unchanged.
- `app/admin/analytics/page.tsx` line ~308 heading: "T365 Terminal Downloads".
- File names like `desk-checkout-button.tsx`, `lib/desk.ts` stay (internal).

### Task C — Landing page rebuild (`app/terminal/page.tsx`)
Rewrite using the copy deck in section 5. Required structure, top to bottom:
1. Hero: eyebrow, H1, subhead, primary CTA (buy), secondary CTA (download trial), price line, hero image.
2. Proof strip: link to the public verified record `/signals`. If you can read live stats via the existing helpers in `lib/signals/public.ts` (see how `app/page.tsx` / the home hero fetch archive stats), show them (e.g. total signals published). Do not hardcode or invent numbers. If unavailable, render a text-only strip.
3. "Rent vs own" comparison block (copy deck).
4. "All your tools, in one place": six outcome-led feature cards (copy deck).
5. Ownership guarantees list.
6. Before-you-download table, FAQ, final CTA.
Trust fixes (mandatory):
- Remove the "Installer signing — Code signing is a separate distribution step" row. Replace with: "Windows SmartScreen — Windows may show a one-time 'unrecognised app' prompt on first run. Choose More info > Run anyway." (Owner decision pending on code signing; this is the honest interim.)
- Remove internal wording: "when email delivery is configured" (say "A licence email is also sent to your account address."); the disabled checkout label "Checkout being configured" -> "Checkout opens soon"; and the amber "Checkout is unavailable until payment and licence signing are configured..." paragraph (log nothing user-facing; just keep the disabled button).
- Do not use the `$499` strikethrough on this page.
- Never claim or imply returns/profit. Keep the "not financial advice" footer line.
- Keep the JSON-LD (`SoftwareApplication` + `FAQPage`), updating name/description/FAQ text.
Title/description: use section 5.

### Task D — OG share card
- `lib/og/desk-card.tsx`: update default copy per section 5. Replace `T365 DESK · WINDOWS` with `T365 TERMINAL · WINDOWS`.
- Replace the invented BTC mock chart: NOT part of this task. Keep the existing mock workstation panel in the OG card as is. Do not add any screenshot to the OG card.
- Make the headline larger and cut the chips to 4 so it reads at Telegram thumbnail size (~400px wide).
- Update `alt` in the `opengraph-image.tsx`.
- Satori rules: every element with children needs `display: 'flex'`; one text child per element; `img` needs explicit width/height and a data URI; nothing may throw.
- Verify: `node scripts/og-preview.mjs desk`, then open `.og-preview\desk.png` and check legibility. Add a `terminal` alias if you rename the fixture.

### Task E — Release plumbing
- `scripts/upload-desk-release.mjs`: upload TWO stable names per release: `T365-Terminal-Setup.exe` (new) and `T365-Desk-Setup.exe` (legacy alias so old links and the current `DESK_INSTALLER_URL` keep working). Versioned file keeps its own name.
- `lib/desk.ts`: change `DESK_PRODUCT.version` to `'1.2.0'`. Change `DESK_INSTALLER_URL` to the `T365-Terminal-Setup.exe` URL ONLY after the 1.2.0 release has been uploaded (see section 6). Set `DESK_LATEST_NOTES` guidance: "T365 Desk is now T365 Terminal."
- Do NOT run `gh release` commands yourself. Hand the exact commands to the owner.

## 5. Copy deck (use verbatim unless noted)

Title tag: `T365 Terminal — The Crypto Terminal You Own | Trading365`
Meta description: `Scanner, charts, news, alerts and market context in one Windows app. Pay $299 once. No subscription, no account. Try it free for 7 days.`

Hero eyebrow: `T365 TERMINAL · WINDOWS · PAY ONCE`
H1: `Stop renting your trading tools.` (accent second line: `Own the terminal.`)
Subhead: `Scanner, live charts, news, alerts and market context in one Windows app. One payment. Nothing to renew. No account to lose.`
Price line: `$299 once · every future major version · 365 days of support · 7-day full-feature trial`
CTAs: `Buy T365 Terminal once` / `Download free trial`

Proof strip: `Built on the scanner behind our public, unedited signal record.` + link `See every signal, wins and losses →` (/signals)

Rent vs own block, heading `Rent your tools, or own your terminal.`
| Subscription tools | T365 Terminal |
| A bill every month | One payment, once |
| Price can rise any time | Your price is locked |
| Needs an account to log in | No account required |
| Your data lives on their servers | Your data stays on your PC |
| Stop paying and it stops working | Keep using it, forever |
Arithmetic line (no competitor claims): `A $25/month tool costs $300 in a year. T365 Terminal is $299, once.`

Section heading: `Every tool you need, in one place.`
Subtext: `No tab juggling. The scanner, the chart, the news and the context sit together, so every decision is made with the full picture.`
Six cards (outcome first):
1. `Find the setups` — The T365 scanner scores longs and shorts, gates them on the BTC regime, and shows entry, stop and five targets.
2. `See the chart` — Real candles with funding, open interest, BTC dominance and Fear & Greed beside them.
3. `Stay informed` — CoinDesk and Cointelegraph headlines tagged to the assets you watch, one click from the original article.
4. `Never miss a move` — Native Windows alerts on your watchlist and signals, plus your own .ics calendar.
5. `Keep your data` — Watchlists, signals and settings live in one local file with one-click JSON backup.
6. `Own it outright` — Offline-signed licence. No account, no activation server, no recurring check.

Ownership list: keep the existing five bullets, remove "Existing T365 web subscriptions remain separate" (move to FAQ).
FAQ: keep the four existing, rename to Terminal, ADD:
- `How is this different from the free web scanner?` — The web scanner is hosted, delayed for free users, and runs on our servers. T365 Terminal runs on your PC, adds charts, news, alerts and your own watchlist in one app, and is a one-time purchase. Be honest: it only scans while the app is running.
- `Is it for Mac or Linux?` — Windows x64 only today.
Honesty rule: do NOT write "forever" without qualification near data claims. FAQ already says live data needs public providers. Prefer "yours for good", "nothing to renew".

OG card: headline `Every tool. One terminal. Yours.` · subhead `Scanner, charts, news and alerts in one Windows app. Pay once. Nothing to renew.` · chips `SCANNER · CHARTS · NEWS · ALERTS` · price band `$299 once` · note `Own it · every future version · 7-day free trial` · url `trading365.org/terminal`.
Homepage desk card H2: `Stop renting your trading tools.`

## 6. Release order (critical — do not reorder)
1. Build 1.2.0: `cd desktop; pnpm dist`. Output `desktop\release\T365-Terminal-Setup-1.2.0.exe`.
2. UPGRADE TEST on a machine with 1.1.2 installed: install 1.2.0 over it. Pass criteria: ONE install and ONE set of shortcuts (no duplicate "T365 Desk" entry), licence still active, watchlist and signals preserved, `app.getPath('userData')` unchanged. If it fails, stop and report; do not publish.
3. Owner runs the upload script (both stable names + versioned) and `gh release edit <tag> --latest`.
4. Verify `https://github.com/kifscrypto/Trading365/releases/latest/download/T365-Terminal-Setup.exe` returns 200.
5. Only then merge and deploy the website changes (route rename, version `1.2.0`, `DESK_INSTALLER_URL`).
Installed 1.1.x users then see the in-app update banner pointing at the new installer.

## 7. Needs the owner (do not fabricate)
- IMAGES ARE FINAL. The owner has decided to keep `public/images/t365-desk-overview.png` as the landing hero. Do NOT replace, rename, edit, crop, redraw or generate any app screenshot, and do not change the `src` of the hero `<Image>` (only update its `alt` text to say "T365 Terminal"). Web `/signals` receipt cards are the web scanner, not the desktop UI; never use them as an app screenshot.
- Trademark and domain check for "T365 Terminal".
- Code-signing decision (replaces the SmartScreen row).
- Whether the `$499` anchor on the homepage is a real prior price; if not, remove it.
- Competitor price claims, if wanted, must be verified before publishing.

## 8. Verification checklist
- `cd desktop; pnpm typecheck; pnpm build; node --check src\renderer\app.js`
- Repo root: `npx tsc --noEmit 2>&1 | Select-String -Pattern 'desk|terminal|og/|home/hero|site-header|email'` must print nothing. (The repo has many unrelated pre-existing errors; only filter for files you touched. `eslint` is not installed; skip lint.)
- `node scripts/og-preview.mjs desk` renders and is legible when scaled to ~400px wide.
- `Select-String` case-insensitively for `T365 Desk` across `app`, `components`, `lib`, `desktop\src`: the only remaining hits should be intentional (historical docs, legacy asset alias, internal ids).
- Hit `/desk` -> 301 -> `/terminal`; `/api/desk/version` still returns JSON.
