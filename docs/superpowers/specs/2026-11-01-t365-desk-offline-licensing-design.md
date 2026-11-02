# T365 Desk Offline Licensing Design

## Outcome

Add a real offline licensing system to T365 Desk. Customers receive a signed perpetual product licence after purchase, activate it without contacting Trading365, and keep using current and future major versions if the website closes or their support entitlement expires.

Release version: 1.1.0.

## Licence offer

- A seven-day full-feature trial begins on the first run of version 1.1.0.
- A purchased licence activates all current and future major-version features permanently.
- The licence also carries `updatesUntil`. This is displayed as a support entitlement and never controls execution of an already-installed version or access to a future major version.
- After trial expiry, cached content, Settings, backup, and licence activation remain available. Live refresh, new scans/entries/monitoring, watchlist changes, alert changes, and calendar imports stop until activation.
- No device fingerprint, recurring activation request, subscription check, or remote revocation is added.

## Licence format and cryptography

Use Ed25519 signatures. The site owns the private key; the desktop embeds only the public key.

A licence key is `T365D1.<payload-base64url>.<signature-base64url>`. The payload is canonical JSON containing:

- `licenseId`: unique identifier derived from the paid order.
- `orderId`: the site order identifier.
- `product`: exactly `t365-desk`.
- `majorVersion`: the major version issued at purchase, initially `1`; future positive versions are accepted.
- `issuedAt`: ISO timestamp.
- `updatesUntil`: ISO support-entitlement timestamp, normally one year after purchase.

Canonicalization recursively sorts object keys. Payload and signature use base64url without padding. Verification enforces the exact prefix, product, positive major version, valid timestamps, signature, and a reasonable maximum key length.

`desktop/src/main/license.ts` contains an empty public-key placeholder for development. A production build must replace it with the matching public key. Activation with an unconfigured build returns an explicit configuration error; it never accepts an unsigned key. Code signing remains a separate certificate-dependent step and is not misrepresented by this licensing work.

## Desktop state and activation

Extend local state with:

- `licenseRecord`: the verified payload or null.
- `trialStartedAt`: the first-run ISO timestamp.
- Derived `license`: status, licence ID, update entitlement, and trial information.

Statuses are `unconfigured`, `trial`, `active`, `expired`, and `invalid`. Unconfigured means no public key exists in this build, not that the customer did anything wrong. Expired applies only to the trial, never to a valid perpetual licence.

Activation is available in Settings through a single-key input and native button. Successful activation stores the verified record locally and immediately unlocks the app. Invalid input leaves existing state unchanged. Settings shows the actual status, update entitlement, and clear offline behaviour; no fake active licence is shown.

## Enforcement

The main process, not only the renderer, enforces access. The store exposes `canUseLiveFeatures()` and `licenseState()` using current time. The service checks it before refresh, entry jobs, monitoring, watchlist changes, alert changes, and calendar imports. Scheduler expiry therefore works without a restart or network request.

Read-only access to cached data, Settings, and backup export remains available after trial expiry. The renderer presents an activation prompt and disables live-only actions where appropriate, but backend checks remain authoritative.

## Verification

Use an ephemeral Ed25519 key pair for smoke tests:

- A signed valid payload activates and verifies offline.
- Changed payload/signature, wrong product/version, malformed key, and unconfigured public key are rejected.
- The seven-day boundary locks live methods without deleting cached state.
- A valid perpetual licence remains active after `updatesUntil`.
- Trial and activation state survive Store reload.
- Existing state without licensing fields migrates to a first-run trial.
- All five existing views still render; activation and expiry paths are exercised in Electron.
- Package and launch version 1.1.0, then verify activation with a test key signed by the matching test private key.
