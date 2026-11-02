# T365 Desk v1 Design

## Outcome

Build a local-first Windows desktop application based on the approved T365 Desk visual prototype. The application must scan crypto perpetual markets on the user's computer, present market context and news, store user data locally, and be packageable as a Windows executable without depending on the Trading365 website, hosted database, hosted cron jobs, or user account system.

The v1 product contains Overview, Signals, News, Calendar, and Settings. It does not contain exchange execution, wallets, portfolio tracking, AI features, stocks, or a subscription backend. Results review and a dedicated alert-inbox screen are deferred.

## Architecture

Use Electron with a TypeScript main process and a dependency-free HTML/CSS/JavaScript renderer. Electron is selected because the existing scanner is TypeScript and Rust is unavailable; Tauri would require a new backend implementation or a sidecar.

The main process owns all network access, scanning, scheduling, notifications, file imports, and persistent state. The renderer owns navigation, filters, selection, and presentation. A context-isolated preload exposes a narrow Promise-based API; renderer Node integration and remote navigation remain disabled.

Build the main and preload processes with TypeScript. Serve the renderer from local static files. Use Electron Builder for an unpacked Windows verification build and an NSIS installer. The initial executable is unsigned; no claim of code signing or automatic updates is made.

## Local data and ownership

Store one versioned JSON document in Electron's `app.getPath('userData')` directory. It contains settings, watchlist symbols, alert preferences, fired signals, cached market assets, news, imported calendar events, and source-health timestamps. A single main-process service serializes writes using a temporary file and rename.

The application opens without activation or a T365 account. Settings describes the actual local version and data location; it does not display a fictitious activated licence. Backup export writes a JSON copy to a user-selected location. Calendar import and backup export use native file dialogs.

If the website or T365 backend is unavailable, installed functionality is unaffected. Live features still require the relevant external data providers and the application to be running. Cached content displays its last successful timestamp and never masquerades as current.

## Market data and scanner

Use direct public APIs from OKX and Hyperliquid. Scan a bounded liquid perpetual universe, ranked by exchange volume/open interest, with the same exclusion rules and indicator definitions as the production scanner. Include BTC and ETH for context even though they are not altcoin entry candidates.

Port the existing EMA, RSI, MACD, short scoring, long pullback scoring, BTC regime gate, 1H entry triggers, stop clamping, and five-target ladder into desktop-owned modules without importing Next.js or database code.

Run watchlist scans every 30 minutes, entry checks every 15 minutes, and open-signal monitoring every 5 minutes while the app runs. Perform an initial scan at launch and allow a manual refresh. Prevent overlapping jobs. Deduplicate fired signals by symbol and open position. Use UTC timestamps throughout.

A candidate is not a fired signal. The UI must distinguish watched candidates from entries that passed all gates. Fired records include exchange, direction, entry, stop, targets, score factors, entry triggers, fire time, current status, and chart candles. Monitoring records target/stop outcomes locally even though a dedicated results screen is deferred.

Provider failures skip affected assets and surface degraded source health. A failed refresh does not erase last-good data. An entirely empty first launch shows an honest empty/error state rather than demo signals.

## Market overview and charts

Show BTC/ETH prices, BTC dominance, Fear & Greed where available, BTC regime, source freshness, active signals, a selected asset chart, and related news. Use direct exchange data for prices and candles, CoinGecko for global market data, and Alternative.me for Fear & Greed. Secondary metrics may be unavailable without blocking the scanner.

Use inline SVG charts rendered from actual cached candles. Include accessible chart descriptions and textual entry/stop/target values. Watchlist selection can show an asset without inventing a fired entry.

## News

Fetch RSS directly from CoinDesk and Cointelegraph in the main process. Parse title, link, publication date, source, and permitted description text; deduplicate by canonical link and normalized title, sort newest first, and limit retained items. Render all feed content as text, never HTML.

Support text search, topic filtering, and related-asset matching in the renderer. Open original articles through `shell.openExternal` only for validated HTTP(S) article URLs. Feed failure retains cached stories with their original publication times and a stale-source warning. News is contextual and never changes the scanner score.

## Calendar

Support importing standard iCalendar `.ics` files through a native dialog. Parse VEVENT UID, summary, description, DTSTART, DTEND, and all-day dates, including UTC and date-only forms. Store events locally and display them chronologically with source filename and import time. Re-importing the same file replaces that source's events rather than duplicating them.

Do not ship fabricated events or claim a live economic/token-unlock feed. The empty state explains how to import a calendar from a provider the user trusts.

## Alerts and backup

Users can toggle native notifications for a fired signal and watchlist symbols. New fires and target/stop events create Electron `Notification` instances only when enabled. Alert preferences persist locally. No Telegram, email, or background operating-system service is promised.

Backup export includes the versioned local document without credentials. There are no exchange API keys in v1. Restore is deferred; the settings screen must not imply otherwise.

## Renderer and accessibility

Use the approved dark T365 workstation design. Implement all five destinations, synchronized selection, watchlist controls, alert controls, news search/category filters, loading/empty/degraded states, visible keyboard focus, native controls, reduced motion, and responsive desktop layouts at 1440×900 and 1280×800.

Use a strict Content Security Policy, sandboxed renderer, context isolation, no Node integration, no remote images or scripts, and no navigation to external content inside Electron. Display a persistent data-freshness indicator and do not label live data as a demo.

## Verification

Verify in layers:

- TypeScript compilation succeeds.
- Scanner indicator/scoring smoke cases match known calculations.
- Live public-provider calls return usable data, with failures handled honestly.
- The Electron app launches and all five views work with real or clearly empty data.
- Selection, filters, alerts, watchlist persistence, calendar import, backup export, and external-link validation work end to end.
- The app still opens with network access unavailable and displays cached/stale status.
- Electron Builder produces a Windows executable and the packaged app launches.
- No production Next.js files or hosted services are changed.
