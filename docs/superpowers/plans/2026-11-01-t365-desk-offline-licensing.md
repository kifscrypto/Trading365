# T365 Desk Offline Licensing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a seven-day trial and Ed25519-signed offline perpetual licensing to T365 Desk 1.1.0, with main-process enforcement and a real Settings activation flow.

**Architecture:** A pure licence module canonicalizes and verifies signed payloads against an embedded public key. Store migration and derived licence state drive main-process feature gates; preload and Settings expose activation without any network dependency.

**Tech Stack:** Electron, TypeScript, Node.js Ed25519 crypto, local JSON, vanilla JavaScript renderer, Electron Builder.

**Spec:** `docs/superpowers/specs/2026-11-01-t365-desk-offline-licensing-design.md`

## Global Constraints

- Never accept unsigned input, use a private key in the desktop app, or require activation-network access.
- A valid perpetual licence remains active after `updatesUntil`; only the trial expires.
- Trial expiry preserves cached content, Settings, activation, and backup export.
- Existing local state migrates without data loss; production activation with an unconfigured public key fails explicitly.
- No permanent test files; use ephemeral-key inline smoke assertions and packaged Electron verification.

## Review Focus

- Tampered payload or wrong key: reject without changing existing state; exercise in Task 1.
- Existing pre-licence JSON: migrate to a trial without deleting market/news data; exercise in Task 1.
- Trial expiry while the app is running: block live service methods without restart; exercise in Task 2.
- Perpetual licence past update entitlement: remain active; exercise in Tasks 1 and 3.
- Invalid activation renderer action: show an actionable error and do not clear a valid licence; exercise in Task 3.

---

### Task 1: Signed licence verification and state migration

**Files:**
- Create: `desktop/src/main/license.ts`
- Modify: `desktop/src/shared/types.ts`, `desktop/src/main/store.ts`

**Interfaces:**
- Produces: `LicensePayload`, `LicenseState`, `verifyLicenseKey(key,publicKeyPem)`, `licenseState(state,now)`, and `Store.canUseLiveFeatures()`.
- Produces: `LicenseStatus = 'unconfigured'|'trial'|'active'|'expired'|'invalid'` and local `licenseRecord`/`trialStartedAt` fields.

- [ ] **Step 1: Implement canonical Ed25519 verification**

Implement the `T365D1` format, recursive canonical JSON, base64url handling, exact product/version checks, timestamp validation, and key-length limits. Keep the desktop public-key placeholder empty and reject unconfigured activation explicitly.

- [ ] **Step 2: Migrate and derive local licensing state**

Initialize `trialStartedAt` on first load, retain existing data, persist verified `licenseRecord`, and derive trial/active/expired status from current time. Return a cloned derived state without remote calls.

- [ ] **Step 3: Verify cryptography and migration**

Use an ephemeral key pair in inline assertions for valid, tampered, malformed, wrong-product, unconfigured, trial-boundary, expired-update, migration, and reload cases. Run `pnpm typecheck`. Expected: all assertions pass and no cached data is lost.

### Task 2: Main-process gates and activation IPC

**Files:**
- Modify: `desktop/src/main/service.ts`, `desktop/src/main/main.ts`, `desktop/src/main/preload.ts`, `desktop/src/shared/types.ts`

**Interfaces:**
- Consumes: Store licensing APIs from Task 1.
- Produces: `AppService.activateLicense(key)` and `window.t365.activateLicense(key)` returning derived `AppState`; live-only methods reject expired trials.

- [ ] **Step 1: Add the activation service path**

Verify through the licence module, persist only a valid record, and return current state. Invalid input must not overwrite existing activation.

- [ ] **Step 2: Enforce trial state in service methods**

Gate refresh, entry, monitoring, watchlist changes, alert changes, and calendar imports. Leave cached reads, Settings, activation, and backup export available. Expiry must apply on each call, not just startup.

- [ ] **Step 3: Expose narrow activation IPC**

Add `license:activate` with renderer state publication; expose no signing or private-key capability.

- [ ] **Step 4: Verify gates**

Use inline service assertions for expired-trial refresh/toggles/calendar rejection and perpetual access after update expiry. Expected: cached state is unchanged and every allowed method still works.

### Task 3: Settings activation UX and packaged verification

**Files:**
- Modify: `desktop/src/renderer/index.html`, `desktop/src/renderer/app.js`, `desktop/src/renderer/styles.css`, `desktop/package.json`, `desktop/electron-builder.yml`

**Interfaces:**
- Consumes: `window.t365.activateLicense` and derived `AppState.license`.
- Produces: version 1.1.0 and a separate `release-1.1.0` output directory.

- [ ] **Step 1: Implement actual licence status and activation controls**

Show trial/active/expired/unconfigured status, licence ID, update entitlement, a single-key input, and activation button. Disable live-only controls after expiry while preserving Settings, backup, and cached views.

- [ ] **Step 2: Verify the renderer flow**

Launch Electron with an isolated profile and test-signed public key. Activate valid and invalid keys, confirm state survives reload, and exercise the expired-trial UI without horizontal overflow at 1440×900 or 1280×800.

- [ ] **Step 3: Package and verify version 1.1.0**

Run syntax/type checks and `electron-builder` into `release-1.1.0`. Launch the unpacked app and repeat valid activation plus a cached read-only check. Confirm installer path, size, hash, and unsigned status. Do not claim code signing.
