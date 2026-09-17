/**
 * X credentials doctor.
 *
 * Checks the four credentials in dependency order and reports exactly which
 * layer is broken, so credential problems do not get misread as code problems:
 *
 *   1. consumer pair    — exchanged for an app-only token via Basic auth. This
 *                         is X validating the key/secret in isolation: no OAuth1
 *                         signing, no nonce, nothing this repo wrote. If this
 *                         fails, neither the app nor the user token can work.
 *   2. user context     — OAuth1 GET /2/users/me, proving the signature is
 *                         accepted and naming the account that would post.
 *   3. write permission — POST /2/tweets with a DELIBERATELY EMPTY body. A 400
 *                         means authorised-but-invalid (write access present); a
 *                         403 means the app is still read-only. Nothing is ever
 *                         posted, so this is safe to run against production.
 *
 *   node --env-file=.env.local scripts/x-check.mjs
 *   node --env-file=.env.local scripts/x-check.mjs --token-only
 *
 * Secrets are never printed — only lengths and X's own error codes.
 */
import { buildOAuthHeader, xConfigured } from '../lib/x.ts'

const creds = {
  API_KEY: process.env.X_API_KEY ?? '',
  API_SECRET: process.env.X_API_SECRET ?? '',
  ACCESS_TOKEN: process.env.X_ACCESS_TOKEN ?? '',
  ACCESS_SECRET: process.env.X_ACCESS_SECRET ?? '',
}

// Published shapes, used to spot truncation AND wrong-credential-type pastes.
// X OAuth 2.0 client IDs are base64 and typically end in "MTpjaQ", which is the
// single most likely mistake here: they sit in the same portal page and look
// nothing like the API Key they must not be pasted into.
const SHAPES = {
  API_KEY: /^[A-Za-z0-9]{25}$/,
  API_SECRET: /^[A-Za-z0-9]{50}$/,
  ACCESS_TOKEN: /^\d{5,20}-[A-Za-z0-9]{30,45}$/,
  ACCESS_SECRET: /^[A-Za-z0-9]{40,50}$/,
}

function shapeWarning(name, value) {
  if (SHAPES[name]?.test(value)) return null
  if (value.endsWith('MTpjaQ')) return 'this is an OAuth 2.0 Client ID, not an OAuth 1.0a API Key'
  if (name === 'API_SECRET' && value.length === 49) return 'expected 50 characters — likely truncated on copy'
  if (name === 'API_SECRET' && value.endsWith('MTpjaQ')) return 'this is an OAuth 2.0 Client Secret, not an API Key Secret'
  if (name === 'ACCESS_TOKEN' && !value.includes('-')) return 'expected <user id>-<secret> — this does not look like an access token'
  return `unexpected shape (length ${value.length})`
}

console.log('== credentials present ==')
let failed = false

if (!xConfigured()) {
  for (const [k, v] of Object.entries(creds)) console.log(`  ${k.padEnd(14)} ${v ? 'set' : 'MISSING'}`)
  console.error('\nSet all four in .env.local (locally) and in the Vercel project (production).')
  process.exitCode = 1
} else {
  for (const [k, v] of Object.entries(creds)) {
    const warn = shapeWarning(k, v)
    console.log(`  ${k.padEnd(14)} length ${String(v.length).padStart(3)}${warn ? `  <- ${warn}` : ''}`)
  }

  // ── 1. Consumer pair ──────────────────────────────────────────────────────
  console.log('\n== 1. consumer key/secret (Basic auth, no signing involved) ==')
  const basic = Buffer.from(`${creds.API_KEY}:${creds.API_SECRET}`).toString('base64')
  let consumerOk = false
  try {
    const res = await fetch('https://api.twitter.com/oauth2/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: 'grant_type=client_credentials',
    })
    const body = await res.text()
    if (res.ok) {
      consumerOk = true
      console.log('  OK — pair accepted')
    } else {
      console.log(`  FAILED — HTTP ${res.status}`)
      console.log(`  ${body.slice(0, 300)}`)
    }
  } catch (err) {
    console.log('  ERROR —', String(err).slice(0, 200))
  }

  if (!consumerOk) {
    failed = true
    console.error('\nVerdict: the API Key / Secret Key pair is being REJECTED by X.')
    console.error('  Re-copy both from the app\'s "Keys and tokens" page using the copy buttons')
    console.error('  (manual selection truncates). Regenerating them is fine too, but an access')
    console.error('  token issued before a regeneration is invalidated, so regenerate that after.')
  }

  // ── 2. User context ───────────────────────────────────────────────────────
  if (!failed && !process.argv.includes('--token-only')) {
    console.log('\n== 2. user context (OAuth1 signature) ==')
    const meUrl = 'https://api.twitter.com/2/users/me'
    try {
      const res = await fetch(meUrl, { headers: { Authorization: buildOAuthHeader({ method: 'GET', url: meUrl }) } })
      const body = await res.text()
      if (res.ok) {
        const j = JSON.parse(body)
        console.log(`  OK — would post as @${j?.data?.username} (id ${j?.data?.id})`)
        if (j?.data?.username && j.data.username.toLowerCase() !== 'trading365x') {
          console.log('  Note: that is not @Trading365X — confirm it is the intended account.')
        }
      } else {
        failed = true
        console.log(`  FAILED — HTTP ${res.status}`)
        console.log(`  ${body.slice(0, 300)}`)
        console.log('  An access token issued before the app was set to Read and Write must be regenerated.')
      }
    } catch (err) {
      failed = true
      console.log('  ERROR —', String(err).slice(0, 200))
    }
  }

  // ── 3. Write permission (nothing is posted) ───────────────────────────────
  if (!failed) {
    console.log('\n== 3. write permission (empty body — posts nothing) ==')
    try {
      const res = await fetch('https://api.twitter.com/2/tweets', {
        method: 'POST',
        headers: { Authorization: buildOAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '' }),
      })
      const body = await res.text()
      console.log(`  HTTP ${res.status}`)
      if (res.status === 400) {
        console.log('  OK — authorised, rejected only because the text was empty: write access is ENABLED')
        console.log('\nAll checks passed. Set X_POSTING_MODE=live to start posting.')
      } else if (res.status === 402) {
        // X bills API usage with prepaid credits. The keys can be perfectly valid
        // and every write still refused until the account has credits — report that
        // as a BILLING state, not a credential failure, because misreading it sends
        // you back to the portal to re-copy keys that were never wrong.
        failed = true
        console.log(`  ${body.slice(0, 300)}`)
        console.log('  BILLING — these credentials are accepted and write access is enabled; X')
        console.log('  refuses the request because the account has no API credits. Add credits or')
        console.log('  a plan under Subscriptions in the developer portal. Then this check returns')
        console.log('  400 and posting starts on the next cron tick.')
      } else if (res.status === 403) {
        failed = true
        console.log('  FAILED — the app is read-only. Set App permissions to Read and Write, then')
        console.log('  regenerate the Access Token and Secret.')
      } else {
        failed = true
        console.log(`  ${body.slice(0, 300)}`)
        console.log('  Unexpected — investigate before switching X_POSTING_MODE to live.')
      }
    } catch (err) {
      failed = true
      console.log('  ERROR —', String(err).slice(0, 200))
    }
  }
}

// Exit via exitCode rather than process.exit(): exiting while undici still holds
// sockets trips a libuv assertion on Windows and masks the real result.
process.exitCode = failed ? 1 : 0
