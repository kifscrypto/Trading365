/**
 * Transactional email via Resend.
 *
 * WHY THIS MODULE IS NEW
 * Before it, the site had NO way to send email at all — no provider, no SMTP, no
 * transport of any kind. Signing up sent nothing. Granting a member 30 days from
 * /admin/members granted the access and told nobody, so the only way to learn you
 * had been given a month was to sign in and notice the badge had changed. And
 * because a reset needs a delivery channel, there was no password reset either:
 * a member who forgot their password — including one who had paid — was locked
 * out permanently, recoverable only by hand-written SQL.
 *
 * Three separate problems, one missing dependency. This is that dependency.
 *
 * WHY RAW fetch AND NOT AN SDK
 * Every other integration here talks to its provider with fetch: lib/beehiiv.ts,
 * lib/telegram.ts, lib/discord.ts, lib/x.ts. An SDK would be the first one, and
 * it would be a dependency to audit for a single POST. Resend's API is one
 * endpoint with a bearer token, so this stays consistent and dependency-free.
 *
 * CONTRACT — copied deliberately from lib/discord.ts
 *   - Unconfigured is a no-op, not an error. A deploy without RESEND_API_KEY
 *     behaves exactly as the site did before this module existed.
 *   - sendEmail() NEVER THROWS. Callers are a signup route, a reset route and a
 *     payment webhook. None of them may fail because an email bounced. A failed
 *     send is a logged result, never an exception.
 *
 * ENV
 *   RESEND_API_KEY      unset = email disabled entirely (the no-op path)
 *   EMAIL_FROM          default 'Trading365 <contact@trading365.org>'; the domain
 *                       must be verified in Resend or every send is rejected
 *   EMAIL_REPLY_TO      optional; unset omits the header
 *   EMAIL_MODE          'dry' suppresses sending and logs instead — for testing
 *                       a template without mailing real people. Anything else,
 *                       including unset, sends when a key is present.
 *
 * Note the asymmetry with X_POSTING_MODE, which defaults to 'dry'. That is
 * deliberate: a bad tweet is public and irreversible, so X fails closed. Email
 * goes to people who already have an account here, and adding an API key is
 * already an explicit decision to send. Failing closed would mean the key is set,
 * emailConfigured() reports true, and resets still silently do nothing — the
 * exact class of confident-and-wrong state this codebase keeps trying to remove.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
export const SITE_URL = 'https://trading365.org'

/** Brand gold, matching lib/beehiiv.ts so both email kinds look like one sender. */
const GOLD = '#d97706'
const INK = '#09090b'
const MUTED = '#71717a'
const DIM = '#a1a1aa'
const LINE = '#e4e4e7'

/**
 * The default sender. `contact@` because that is the address the site already
 * publishes on /about, /scanner and /scanner/longs — so a member who hits reply
 * reaches a mailbox that exists and is watched, with no configuration at all.
 *
 * This started as `hello@`, which was invented here and is not a real mailbox:
 * every reply would have bounced, silently, to an address nobody had ever
 * created. If you would rather send from a dedicated address, set EMAIL_FROM to
 * something on the verified domain and point EMAIL_REPLY_TO at contact@.
 */
const FROM = () => process.env.EMAIL_FROM ?? 'Trading365 <contact@trading365.org>'

/** True when a key is present. Unset means the whole module is a no-op. */
export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY
}

export function emailMode(): 'live' | 'dry' {
  return process.env.EMAIL_MODE === 'dry' ? 'dry' : 'live'
}

export interface EmailMessage {
  to: string
  subject: string
  html: string
  /** Plain-text alternative. Generated from the html when omitted. */
  text?: string
}

export type SendStatus = 'sent' | 'dry-run' | 'not-configured' | 'error'

export interface SendResult {
  ok: boolean
  status: SendStatus
  /** Resend's message id when it accepted the send. */
  id?: string
  /** Provider's message when it refused. Never shown to an end user. */
  error?: string
}

/**
 * Escape for HTML text nodes and attribute values.
 *
 * Every interpolation below carries data a user supplied — an email address, a
 * plan label. Emails are HTML documents with no CSP to fall back on, so escaping
 * at the boundary is the only thing standing between a crafted value and a link
 * or image injected into a message we send on the user's behalf.
 */
export function esc(v: string | null | undefined): string {
  return (v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Strip HTML down to something readable for the plain-text part.
 *
 * A text/plain alternative is not decoration: a message with only an HTML part
 * scores worse with spam filters, and some clients show nothing at all. Rather
 * than maintain a second template per email, this reduces the one we have —
 * links become "label (url)" so a URL survives the flattening.
 */
export function toText(html: string): string {
  return html
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|tr|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Shared layout: dark header, white card, gold accent, quiet footer.
 *
 * Built as a table with inline styles because email clients have no real CSS
 * support — Gmail strips <style> blocks and most clients ignore flexbox. This is
 * the same constraint lib/beehiiv.ts works under, and the two templates are
 * intentionally near-identical so a member cannot tell they came from different
 * parts of the site.
 *
 * `paragraphs` and `cta` are trusted HTML: every builder below escapes its own
 * interpolations with esc() before calling in. That is why this does not escape
 * them again — doing so would render a builder's own <strong> as literal text.
 */
export function renderEmail(opts: {
  heading: string
  paragraphs: string[]
  cta?: { text: string; url: string }
  footnote?: string
}): string {
  const { heading, paragraphs, cta, footnote } = opts
  const body = paragraphs
    .map((p) => `            <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#3f3f46;">${p}</p>`)
    .join('\n')

  const button = cta
    ? `            <table cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px;">
              <tr>
                <td style="background:${GOLD};border-radius:8px;">
                  <a href="${esc(cta.url)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">${esc(cta.text)}</a>
                </td>
              </tr>
            </table>
            <p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:${DIM};word-break:break-all;">${esc(cta.url)}</p>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${esc(heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#18181b;padding:22px 32px;text-align:center;">
            <img src="${SITE_URL}/images/logo-wide.png" alt="Trading365" width="160"
              style="display:block;margin:0 auto;max-width:160px;height:auto;">
          </td>
        </tr>
        <tr>
          <td style="padding:36px 36px 28px;">
            <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;line-height:1.35;color:${INK};">${esc(heading)}</h1>
            <div style="width:48px;height:2px;background:${GOLD};margin:0 0 20px;"></div>
${body}
${button}
          </td>
        </tr>
        <tr>
          <td style="padding:0 36px;"><hr style="border:none;border-top:1px solid ${LINE};margin:0;"></td>
        </tr>
        <tr>
          <td style="padding:24px 36px;background:#fafafa;text-align:center;">
            <p style="margin:0 0 4px;font-size:13px;color:${MUTED};font-weight:600;">Trading365</p>
            <p style="margin:0 0 8px;font-size:12px;color:${DIM};">${footnote ? esc(footnote) : 'Automated technical analysis, not financial advice.'}</p>
            <p style="margin:0;font-size:12px;color:${DIM};">
              <a href="${SITE_URL}" style="color:${GOLD};text-decoration:none;">trading365.org</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

/**
 * Send one message. Never throws — inspect the returned status.
 *
 * The three non-'sent' outcomes are deliberately distinct rather than collapsed
 * into `ok: false`, because callers need to tell them apart. A reset route, for
 * instance, must not tell a user "check your inbox" when the real reason nothing
 * was sent is that no provider is configured.
 */
export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  if (!emailConfigured()) {
    console.warn(`[email] not configured — dropped "${msg.subject}" to ${msg.to}`)
    return { ok: false, status: 'not-configured' }
  }

  if (emailMode() === 'dry') {
    console.log(`[email] DRY RUN — would send "${msg.subject}" to ${msg.to}`)
    return { ok: true, status: 'dry-run' }
  }

  try {
    const replyTo = process.env.EMAIL_REPLY_TO
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM(),
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text ?? toText(msg.html),
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    })

    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string }
    if (!res.ok) {
      // Logged, not thrown: a caller mid-signup must still get its account.
      console.error(`[email] send failed (${res.status}) to ${msg.to}:`, body?.message ?? body)
      return { ok: false, status: 'error', error: body?.message ?? `HTTP ${res.status}` }
    }
    return { ok: true, status: 'sent', id: body?.id }
  } catch (err) {
    console.error(`[email] send threw to ${msg.to}:`, err)
    return { ok: false, status: 'error', error: err instanceof Error ? err.message : 'network error' }
  }
}

// ── Message builders ────────────────────────────────────────────────────────
// Every template the site can send lives here, so "what can we email people?"
// is answerable by reading this one file rather than grepping call sites.

/**
 * Sent when an account is created.
 *
 * This is the first thing a new member ever receives from the site, and until
 * now they received nothing — signing up was completely silent. It carries the
 * referral link because /account promises one and a member who never opens
 * /account would otherwise never learn it exists.
 *
 * `offerDays` folds the signup offer into the SAME message rather than sending a
 * second one. Two emails landing in the same second reads as a mailing list; one
 * email that says everything does not. It also removes the question of which
 * template to send when an offer is active.
 */
export function welcomeEmail(opts: {
  email: string
  referralCode?: string | null
  delayHours: number
  /** Days of member access granted automatically at signup, if any. */
  offerDays?: number | null
}): EmailMessage {
  const { email, delayHours } = opts
  const offer = typeof opts.offerDays === 'number' && opts.offerDays > 0 ? opts.offerDays : null
  const referralUrl = opts.referralCode ? `${SITE_URL}/signup?ref=${encodeURIComponent(opts.referralCode)}` : null

  return {
    to: email,
    subject: offer
      ? `Welcome to Trading365 — ${offer} days of member access included`
      : 'Your Trading365 account is ready',
    html: renderEmail({
      heading: offer ? 'Welcome — you are on member access' : 'Welcome to Trading365',
      paragraphs: [
        `Your account for <strong>${esc(email)}</strong> is live.`,
        offer
          ? `To start you off, you have full member access for the next <strong>${offer} days</strong> — every signal appears for you the moment it fires, rather than the usual ${delayHours}-hour free-tier delay.`
          : `You are on the free tier: signals appear on the site <strong>${delayHours} hours</strong> after they fire. Members see every signal the moment it goes out, and can follow the outcome as it happens.`,
        ...(offer
          ? [`There is nothing to activate and nothing to cancel. When the ${offer} days are up your account returns to the free tier unless you choose to upgrade.`]
          : []),
        ...(referralUrl
          ? [
              `Your referral link gives you a <strong>free month</strong> for every person who signs up with it and becomes a member:`,
              `<a href="${esc(referralUrl)}" style="color:${GOLD};word-break:break-all;">${esc(referralUrl)}</a>`,
            ]
          : []),
      ],
      cta: { text: 'Open your account', url: `${SITE_URL}/account` },
      footnote: 'You are receiving this because you created an account at trading365.org.',
    }),
  }
}

/**
 * Password reset link.
 *
 * The `expiresMinutes` is stated in the body rather than implied, because the
 * only way a user can tell an expired link from a broken one is if the message
 * told them how long it had.
 */
export function passwordResetEmail(opts: { email: string; resetUrl: string; expiresMinutes: number }): EmailMessage {
  const mins = opts.expiresMinutes
  const window = mins >= 120 ? `${Math.round(mins / 60)} hours` : `${mins} minutes`
  return {
    to: opts.email,
    subject: 'Reset your Trading365 password',
    html: renderEmail({
      heading: 'Reset your password',
      paragraphs: [
        `Someone asked to reset the password for <strong>${esc(opts.email)}</strong>.`,
        `If that was you, use the button below. The link works once and expires in <strong>${esc(window)}</strong>.`,
        `If it was not you, nothing has changed and you can ignore this message — your current password still works.`,
      ],
      cta: { text: 'Choose a new password', url: opts.resetUrl },
      footnote: 'You are receiving this because a password reset was requested for this address.',
    }),
  }
}

/**
 * Access granted — a manual comp from /admin/members, a signup offer, or a
 * purchase.
 *
 * This is the message whose absence made every grant invisible. Before it, an
 * admin could grant 30 days and the member had no way to know unless they
 * happened to sign in and notice the badge had changed.
 */
export function accessGrantedEmail(opts: {
  email: string
  /** null = lifetime / open-ended. */
  days: number | null
  /** 'manual' | 'nowpayments' | 'referral' | 'signup-offer' … */
  source: string
}): EmailMessage {
  const lifetime = opts.days === null
  const paid = opts.source === 'nowpayments'
  const heading = lifetime ? 'You have lifetime access' : paid ? 'Your membership is active' : 'You have been given access'
  const howLong = lifetime ? 'with no expiry' : `for the next <strong>${opts.days} days</strong>`

  return {
    to: opts.email,
    subject: lifetime ? 'Lifetime access to Trading365' : paid ? 'Your Trading365 membership is active' : `You have ${opts.days} days of Trading365 access`,
    html: renderEmail({
      heading,
      paragraphs: [
        `Your account <strong>${esc(opts.email)}</strong> now has member access ${howLong}.`,
        `Members see every signal the moment it fires instead of waiting out the free-tier delay, and can follow each one through to its published result.`,
        ...(paid ? [] : [`This was granted by the Trading365 team. If you were not expecting it, you are welcome to keep it.`]),
      ],
      cta: { text: 'See your access', url: `${SITE_URL}/account` },
      footnote: 'You are receiving this because your Trading365 access changed.',
    }),
  }
}

// signupOfferEmail lived here as a separate template. It is now `offerDays` on
// welcomeEmail instead: a signup that granted a trial AND sent a welcome would
// have delivered two messages in the same second, which reads as a mailing list
// rather than an account being created.



