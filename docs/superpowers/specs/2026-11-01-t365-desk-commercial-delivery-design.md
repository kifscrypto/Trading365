# T365 Desk Commercial Delivery Design

## Outcome

Add a dedicated T365 Desk product page, one-time checkout, installer delivery, signed licence issuance, and account-based licence recovery. The desktop purchase must remain completely separate from web-scanner subscriptions.

Offer: `$299` once for a perpetual T365 Desk licence, including all future major versions and 365 days of support. A seven-day trial is available in the app. Marketing must not imply stock support, guaranteed returns, code signing, or a hosted installer that has not been configured.

## Product and checkout

Create `lib/desk.ts` as the single source for product key `desktop-v1`, amount `299`, major version `1`, update days `365`, and download path `/api/desk/download`.

Add `POST /api/desk/checkout`. Require a signed-in account and a configured NOWPayments API key plus desktop private signing key. Create a pending subscriber order with `product='t365-desk'`, plan `desktop-v1`, amount `299`, and a unique `t365-desk-v1-...` order ID. Return the hosted invoice URL. Do not use or modify the scanner `PLANS` object.

Add columns to the existing subscribers table through idempotent setup:

- `product TEXT NOT NULL DEFAULT 'scanner'`
- `license_key TEXT`
- `license_updates_until TIMESTAMPTZ`

Existing rows therefore remain scanner orders by default.

## Paid webhook separation

Select `product` in the payment webhook. Branch desktop orders before scanner grants:

- Generate the signed offline licence using the paid order ID and 365-day update entitlement.
- Mark the order paid and store payment ID, paid timestamp, licence key, and update entitlement.
- Do not grant site membership, paid days, referral rewards, Telegram access, or scanner expiry.
- Send a non-fatal licence-delivery email when email is configured. The licence remains recoverable in Account if email fails.

Existing scanner behaviour stays unchanged for rows whose product is `scanner` or NULL. Unknown product values fail explicitly rather than being misclassified.

## Signing and recovery

Create `lib/desktop-license.ts` with the same canonical JSON and Ed25519 format as the desktop. The private key comes only from `DESKTOP_LICENSE_PRIVATE_KEY`. No private key or signing route is exposed publicly. Public licence issuance happens only inside the verified paid webhook or an authenticated owner-recovery read.

`GET /api/desk/license?order=<orderId>` requires a signed-in owner and a paid desktop order. Return the licence key, order ID, update entitlement, and download path. Other users receive 404/403 as appropriate without revealing order details.

The Account page lists paid desktop orders with download button, licence key in a read-only input, update entitlement, and order ID. It also shows a purchase-success message when checkout returns successfully.

## Installer delivery

`GET /api/desk/download` redirects to `DESK_DOWNLOAD_URL`. Anyone may download the trial installer; payment is only required to activate after the trial. If the URL is not configured, return an honest 503 instead of a broken placeholder. The URL must be HTTPS.

For deployment, add `scripts/upload-desk-release.mjs` using the GitHub CLI. It uploads or replaces the specified installer in a GitHub Release and prints the resulting release. The operator then sets `DESK_DOWNLOAD_URL`. The script must not embed or print credentials.

## Marketing page and navigation

Add `/desk` with real application imagery, ownership positioning, feature list, price, seven-day trial, update terms, system requirements, honest internet/offline expectations, and FAQs. Include a checkout button only when signing and licence issuance are configured; otherwise show a clear configuration/unavailable state.

Add a T365 Desk link to the site header without removing existing products. Link the verified scanner record as supporting evidence, but do not claim desktop results that have not been produced. The product is Windows desktop software, not the web scanner repackaged as a subscription.

## Verification

Use ephemeral Ed25519 keys and a mocked order/store for smoke checks:

- Site and desktop signatures agree byte-for-byte on the same payload.
- Desktop checkout requires authentication/configuration and creates the right product/amount.
- Desktop paid handling stores a recoverable licence but never grants site/Telegram access.
- Existing scanner handling is unchanged.
- Recovery returns a licence only to the owning account.
- Download rejects missing/non-HTTPS configuration and redirects valid configuration.
- Product page and Account render trial/purchase/recovery states without exposing private material.
- Run the project checks possible in `C:\dev\trading365`; report any pre-existing errors separately.
