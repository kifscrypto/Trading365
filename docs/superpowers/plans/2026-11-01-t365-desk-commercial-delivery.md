# T365 Desk Commercial Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated `$299` T365 Desk product page, separate one-time checkout, signed licence delivery, installer download, and authenticated recovery without affecting scanner subscriptions.

**Architecture:** `lib/desk.ts` owns product configuration and `lib/desktop-license.ts` owns Ed25519 signing. A product-specific checkout and webhook branch issue licences; authenticated Account and recovery APIs expose only owner data, while a configured HTTPS download route serves the public trial installer.

**Tech Stack:** Next.js, TypeScript, Neon/Postgres, NOWPayments, Node.js Ed25519, React, GitHub Releases, Railway.

**Spec:** `docs/superpowers/specs/2026-11-01-t365-desk-commercial-delivery-design.md`

## Global Constraints

- Never expose the private signing key or require online activation in the desktop.
- Desktop purchase grants no site days, referral reward, Telegram invite, or scanner expiry.
- Existing scanner webhook behaviour and `PLANS` remain unchanged.
- Checkout is unavailable unless NOWPayments and desktop signing are configured; downloads require an HTTPS URL.
- No permanent test files or live charges; use ephemeral keys and mocked order data.

## Review Focus

- Duplicate paid webhook: licence issuance remains idempotent; exercise in Task 1.
- Missing signing configuration after payment: fail loudly rather than mark an unlicensed order paid; exercise in Task 1.
- Owner versus other-account recovery: reveal only owner licences; exercise in Task 2.
- Legacy scanner row with NULL product: retain original entitlement behaviour; exercise in Task 1.
- Unconfigured download: return 503, never a fake installer link; exercise in Task 2.

---

### Task 1: Product configuration, signing, checkout, and webhook

**Files:**
- Create: `lib/desk.ts`, `lib/desktop-license.ts`, `app/api/desk/checkout/route.ts`
- Modify: `lib/premium.ts`, `app/api/pay/webhook/route.ts`, `lib/email.ts`

**Interfaces:**
- Produces: `DESK_PRODUCT`, `deskEnabled()`, `newDeskOrderId()`, `signDesktopLicense(orderId,now)`, and subscriber `product`/`license_key`/`license_updates_until` fields.
- Produces: `POST /api/desk/checkout` and the desktop paid-webhook branch.

- [ ] **Step 1: Implement product config and Ed25519 signing**

Use the exact desktop canonicalization and key format. Derive licence ID from order ID and updates from purchase time plus 365 days. Read the private key only from `DESKTOP_LICENSE_PRIVATE_KEY`.

- [ ] **Step 2: Add schema and authenticated checkout**

Add idempotent product/licence columns, create a pending `$299` desktop order, and return a hosted invoice only with payment and signing configured.

- [ ] **Step 3: Add the isolated paid-webhook branch**

Sign/store the licence without site days, referral, Telegram, or scanner expiry. Keep NULL/scanner rows on the original path. Send non-fatal licence email and preserve retry behaviour when signing fails.

- [ ] **Step 4: Verify signing and product separation**

Use ephemeral keys and mocked rows for signature parity, duplicate handling, missing-key failure, and scanner/desktop entitlement separation. Run targeted TypeScript checks. Expected: no private material is returned and scanner logic is unchanged.

### Task 2: Recovery, download, and Account ownership

**Files:**
- Create: `app/api/desk/license/route.ts`, `app/api/desk/download/route.ts`, `components/desk-purchases.tsx`
- Modify: `app/account/page.tsx`, `lib/desk.ts`

**Interfaces:**
- Produces: `GET /api/desk/license?order=...`, `GET /api/desk/download`, and `getDeskPurchases(userId)`.
- Consumes: product config and subscriber schema from Task 1.

- [ ] **Step 1: Implement authenticated recovery**

Return only a paid desktop order owned by the current account. Include licence key, update entitlement, order ID, and download path.

- [ ] **Step 2: Implement the public trial download**

Redirect only to a configured HTTPS `DESK_DOWNLOAD_URL`; return 503 otherwise. Do not require payment to download the trial.

- [ ] **Step 3: Add Account desktop purchases**

List paid desktop orders with a read-only licence key, order ID, update date, download button, and purchase-success feedback. Keep existing membership UI intact.

- [ ] **Step 4: Verify access control and download configuration**

Use mocked accounts/orders to verify owner-only recovery and HTTPS-only redirects. Expected: other users cannot read a licence and missing hosting fails honestly.

### Task 3: Product page, release upload, and end-to-end checks

**Files:**
- Create: `app/desk/page.tsx`, `scripts/upload-desk-release.mjs`
- Modify: `components/site-header.tsx`
- Add binary asset: `public/images/t365-desk-overview.png`

**Interfaces:**
- Consumes: `DESK_PRODUCT`, `deskEnabled()`, checkout, and download routes.
- Produces: `/desk` marketing and an operator upload command for `DESK_DOWNLOAD_URL`.

- [ ] **Step 1: Build the dedicated product page**

Use real app imagery and the agreed ownership, price, trial, update, offline, system-requirement, and FAQ copy. Show unavailable configuration honestly and link verified scanner evidence without inventing desktop results.

- [ ] **Step 2: Add navigation and release upload**

Link T365 Desk in the header. Implement GitHub Release upload of a caller-specified installer and print only the resulting release tag.

- [ ] **Step 3: Verify commercial delivery**

Run product/page checks possible in `C:\dev\trading365`, signing parity against the desktop verifier, owner recovery, and download validation. Inspect `/desk` and Account at desktop and mobile widths. Report pre-existing project errors separately and do not run a live payment.

- [ ] **Step 4: Record deployment requirements**

Confirm the exact remaining operator values: `DESKTOP_LICENSE_PRIVATE_KEY`, matching `DESK_PUBLIC_KEY` in the desktop build, `DESK_DOWNLOAD_URL`, and code-signing certificate. Do not treat these as completed configuration.
