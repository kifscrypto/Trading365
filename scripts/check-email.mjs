/**
 * Verify the email layer without sending anything.
 *
 *   node --env-file=.env.local scripts/check-email.mjs
 *   node --env-file=.env.local scripts/check-email.mjs you@example.com   # also send a real test
 *
 * Pass an address and it sends ONE real message through sendEmail(), so the
 * provider, the from-domain and the API key are all exercised end to end. Without
 * an address it only renders: that path is safe to run anywhere, any time, and it
 * is the one that catches a broken template before a member ever sees it.
 *
 * lib/email.ts has no path aliases, which is what makes this runnable by node.
 */
import {
  accessGrantedEmail, emailConfigured, emailMode, esc, passwordResetEmail, renderEmail,
  sendEmail, toText, welcomeEmail,
} from '../lib/email.ts'

let pass = 0
let fail = 0
function check(label, cond) {
  if (cond) { pass++; console.log(`  PASS  ${label}`) }
  else { fail++; console.log(`  FAIL  ${label}`) }
}

console.log('== configuration ==')
console.log(`  RESEND_API_KEY   ${emailConfigured() ? 'set' : 'NOT SET — email is a no-op'}`)
console.log(`  EMAIL_MODE       ${emailMode()}`)
console.log(`  EMAIL_FROM       ${process.env.EMAIL_FROM ?? 'Trading365 <hello@trading365.org> (default)'}`)
console.log(`  EMAIL_REPLY_TO   ${process.env.EMAIL_REPLY_TO ?? '(unset)'}`)

const TEMPLATES = [
  ['welcome', welcomeEmail({ email: 'member@example.com', referralCode: 'ABC123', delayHours: 6 })],
  ['welcome (no referral code)', welcomeEmail({ email: 'member@example.com', referralCode: null, delayHours: 6 })],
  ['password reset', passwordResetEmail({ email: 'member@example.com', resetUrl: 'https://trading365.org/reset-password?token=abc', expiresMinutes: 60 })],
  ['grant 30d', accessGrantedEmail({ email: 'member@example.com', days: 30, source: 'manual' })],
  ['grant lifetime', accessGrantedEmail({ email: 'member@example.com', days: null, source: 'manual' })],
  ['purchase', accessGrantedEmail({ email: 'member@example.com', days: 90, source: 'nowpayments' })],
  ['welcome with offer', welcomeEmail({ email: 'member@example.com', referralCode: 'ABC123', delayHours: 6, offerDays: 14 })],
  ['welcome with zero offer (treated as off)', welcomeEmail({ email: 'member@example.com', delayHours: 6, offerDays: 0 })],
]

console.log('\n== templates render ==')
for (const [name, msg] of TEMPLATES) {
  const ok = msg.html.length > 500
    && msg.html.includes('<!DOCTYPE html>')
    && msg.html.includes('</html>')
    && msg.html.includes(msg.subject.length > 0 ? '<title>' : '<title>')
    && msg.html.includes('trading365.org')
    && msg.to === 'member@example.com'
  check(`${name} — well-formed (${msg.html.length} bytes)`, ok)
}

console.log('\n== plain-text alternative ==')
for (const [name, msg] of TEMPLATES) {
  const t = toText(msg.html)
  check(`${name} — text is non-empty and tag-free`, t.length > 80 && !/[<>]/.test(t))
}
// A URL must survive the flattening or a reset link is unclickable in a
// text-only client, which is the one place it matters most.
const resetText = toText(TEMPLATES[2][1].html)
check('reset URL survives in the text part', resetText.includes('https://trading365.org/reset-password?token=abc'))
check('referral URL survives in the text part', toText(TEMPLATES[0][1].html).includes('signup?ref=ABC123'))

console.log('\n== escaping ==')
check('esc neutralises a tag', esc('<img src=x onerror=alert(1)>') === '&lt;img src=x onerror=alert(1)&gt;')
check('esc neutralises quotes', esc('" onmouseover="x') === '&quot; onmouseover=&quot;x')
// The address is the only attacker-controlled string that reaches a template.
const hostile = welcomeEmail({ email: '<script>alert(1)</script>@evil.com', referralCode: 'X', delayHours: 6 })
check('hostile email is escaped in the html part', !hostile.html.includes('<script>'))
check('hostile email is escaped in the subject path', hostile.subject.indexOf('<script>') === -1)
// The text part is sent as Content-Type: text/plain, so there is no HTML parsing
// step and a literal <script> in it is inert. toText un-escaping is therefore
// CORRECT rather than a hole: a member whose address contains an entity-looking
// sequence should see it verbatim. (An earlier version of this script asserted
// "no <script> in the text part" and failed — the assertion was wrong, not the
// code. Worth leaving the reasoning here so it is not "fixed" back.)
check(
  'text part reproduces the address verbatim (inert — sent as text/plain)',
  toText(hostile.html).includes('<script>alert(1)</script>@evil.com'),
)
// A raw < in the html would mean an unescaped interpolation slipped through.
const renderProbe = renderEmail({ heading: '<b>h</b>', paragraphs: ['<i>p</i>'] })
check('renderEmail escapes its heading', renderProbe.includes('&lt;b&gt;h&lt;/b&gt;'))

console.log('\n== signup offer folds into the welcome ==')
const withOffer = TEMPLATES.find(([n]) => n === 'welcome with offer')[1]
const noOffer = TEMPLATES.find(([n]) => n === 'welcome')[1]
const zeroOffer = TEMPLATES.find(([n]) => n === 'welcome with zero offer (treated as off)')[1]
check('offer email states the days', withOffer.html.includes('14 days'))
check('offer email subject advertises it', withOffer.subject.includes('14 days'))
check('offer email does NOT claim the free-tier delay applies', !withOffer.html.includes('You are on the free tier'))
check('plain welcome does state the free-tier delay', noOffer.html.includes('You are on the free tier'))
check('zero offer falls back to the plain welcome', !zeroOffer.html.includes('member access for the next'))
check('zero offer never renders "0 days"', !zeroOffer.html.includes('0 days'))
check('both variants still carry the referral link', withOffer.html.includes('signup?ref=ABC123') && noOffer.html.includes('signup?ref=ABC123'))

console.log('\n== summary ==')
console.log(`  ${pass} passed, ${fail} failed`)

const recipient = process.argv[2]
if (recipient) {
  console.log(`\n== live send to ${recipient} ==`)
  if (!emailConfigured()) {
    console.log('  SKIPPED — no RESEND_API_KEY, so there is nothing to send with.')
  } else if (emailMode() === 'dry') {
    console.log('  SKIPPED — EMAIL_MODE=dry suppresses sending. Unset it to test for real.')
  } else {
    const result = await sendEmail({
      to: recipient,
      subject: 'Trading365 email test',
      html: renderEmail({
        heading: 'Email is working',
        paragraphs: [
          `If you are reading this, <strong>RESEND_API_KEY</strong> is valid, the from-domain is verified, and the site can reach members.`,
          `Nothing else has been sent to anyone — this is a single test message.`,
        ],
        cta: { text: 'Open Trading365', url: 'https://trading365.org' },
        footnote: 'This is a test message from scripts/check-email.mjs.',
      }),
    })
    console.log(`  status: ${result.status}${result.id ? ` (id ${result.id})` : ''}${result.error ? ` — ${result.error}` : ''}`)
    if (!result.ok) { fail++; console.log('  the live send failed — see the log above') }
  }
}

process.exit(fail === 0 ? 0 : 1)
