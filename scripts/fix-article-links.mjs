import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../.env.local')

const env = readFileSync(envPath, 'utf8')
const dbUrl = env.split('\n').find(l => l.startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()
if (!dbUrl) { console.error('DATABASE_URL not found in .env.local'); process.exit(1) }

const sql = neon(dbUrl)

// Exact URL replacements — order matters (more specific first)
const REPLACEMENTS = [
  // Bitunix — wrong vipCode (all case variants)
  ['https://www.bitunix.com/register?vipCode=Trading365', 'https://www.bitunix.com/register?vipCode=VP7Q'],
  ['https://www.bitunix.com/register?vipCode=TRADING365', 'https://www.bitunix.com/register?vipCode=VP7Q'],

  // BingX — wrong partner link (all variants)
  ['https://bingx.com/invite/LIMIT365',    'https://bingx.com/en/partner/KIFSCrypto'],
  ['https://bingx.com/invite/trading365',  'https://bingx.com/en/partner/KIFSCrypto'],
  ['https://bingx.com/en-us/register/',    'https://bingx.com/en/partner/KIFSCrypto'],

  // Bybit — wrong ref code (all URL formats)
  ['https://www.bybit.com/invite?ref=TRADNG365',    'https://partner.bybit.com/b/2705'],
  ['https://www.bybit.com/invite?ref=trading365',   'https://partner.bybit.com/b/2705'],
  ['https://www.bybit.com/en/invite/?ref=TRADING365','https://partner.bybit.com/b/2705'],
  ['https://bybit.com)',                             'https://partner.bybit.com/b/2705)'],

  // Binance — wrong ref code / bare / CPA link
  ['https://accounts.binance.com/register?ref=TRADING365',               'https://www.binance.com/register?ref=19783178'],
  ['https://accounts.binance.com/register?ref=trading365',               'https://www.binance.com/register?ref=19783178'],
  ['https://www.binance.com/en/activity/referral-entry/CPA?ref=CPA_00M6XWVKFN', 'https://www.binance.com/register?ref=19783178'],
  ['https://www.binance.com/en/register',                                'https://www.binance.com/register?ref=19783178'],

  // MEXC — wrong ref code / bare
  ['https://www.mexc.com/register?inviteCode=trading365', 'https://www.mexc.com/?shareCode=mexc-KIFSCrypto'],
  ['https://www.mexc.com/register)',                       'https://www.mexc.com/?shareCode=mexc-KIFSCrypto)'],

  // WEEX — wrong links
  ['https://refer.weex.com/register?vipCode=cx5n', 'https://www.weex.com/events/promo/0fee?vipCode=cx5n&qrType=activity'],
  ['https://www.weex.com/register',                'https://www.weex.com/events/promo/0fee?vipCode=cx5n&qrType=activity'],

  // OKX — no referral (bare domain only — don't touch fee pages)
  ['https://www.okx.com)',  'https://okx.com/join/42956024)'],  // markdown link ending
  ['https://www.okx.com "', 'https://okx.com/join/42956024 "'], // title attribute

  // Novava — wrong domain/case
  ['https://novava.com/en_US/partner/front/kifs',     'https://www.novava.com/en_US/partner/front/KIFS'],
  ['https://www.novava.com/register?inviteCode=EAEWQA', 'https://www.novava.com/en_US/partner/front/KIFS'],

  // Kraken — old invite links + bare domain
  ['https://invite.kraken.com/JDNW/68do137o', 'https://proinvite.kraken.com/9f1e/7ygw0iiw'],
  ['https://www.kraken.com/sign-up',           'https://proinvite.kraken.com/9f1e/7ygw0iiw'],
  ['https://kraken.com)',                       'https://proinvite.kraken.com/9f1e/7ygw0iiw)'],

  // Bitget — wrong link
  ['https://www.bitget.com/register', 'https://bonus.bitget.site/2ZE3ZR'],

  // Gate — wrong domain/code → correct affiliate
  ['https://www.gate.io/signup/BKWJXBER/type_b', 'https://www.gate.com/share/vfcsa1an'],
  ['https://www.gate.io/signup',                  'https://www.gate.com/share/vfcsa1an'],
  ['https://www.gate.io)',                         'https://www.gate.com/share/vfcsa1an)'],

  // Bitrue — wrong invite code
  ['https://www.bitrue.com/activity/task/task-landing?inviteCode=ZQFEPEVS&cn=900000', 'https://www.bitrue.com/referral/landing?cn=600000&inviteCode=VAVAQA'],
]

// OKX bare domain needs careful handling — only replace when it's a CTA (not a fee/docs page)
const OKX_BARE = /\(https:\/\/www\.okx\.com\)/g
const OKX_CORRECT = '(https://okx.com/join/42956024)'

// Kraken bare domain CTA links (not fee schedule)
const KRAKEN_BARE = /\(https:\/\/www\.kraken\.com\)(?!\/features)/g
const KRAKEN_CORRECT = '(https://proinvite.kraken.com/9f1e/7ygw0iiw)'

async function main() {
  const articles = await sql`SELECT id, slug, title, content FROM articles ORDER BY slug`

  console.log(`\nProcessing ${articles.length} articles...\n`)

  let totalFixed = 0
  let articlesFixed = 0

  for (const article of articles) {
    if (!article.content) continue

    let content = article.content
    let changes = 0

    // Apply exact string replacements
    for (const [from, to] of REPLACEMENTS) {
      const before = content
      content = content.split(from).join(to)
      if (content !== before) {
        const count = (before.split(from).length - 1)
        console.log(`  [${article.slug}] ${count}x  ${from}\n           → ${to}`)
        changes += count
      }
    }

    // Apply regex replacements for bare domains
    const beforeOkx = content
    content = content.replace(OKX_BARE, OKX_CORRECT)
    if (content !== beforeOkx) {
      const count = (beforeOkx.match(OKX_BARE) || []).length
      console.log(`  [${article.slug}] ${count}x  https://www.okx.com (bare CTA)\n           → https://okx.com/join/42956024`)
      changes += count
    }

    const beforeKraken = content
    content = content.replace(KRAKEN_BARE, KRAKEN_CORRECT)
    if (content !== beforeKraken) {
      const count = (beforeKraken.match(KRAKEN_BARE) || []).length
      console.log(`  [${article.slug}] ${count}x  https://www.kraken.com (bare CTA)\n           → https://proinvite.kraken.com/9f1e/7ygw0iiw`)
      changes += count
    }

    if (changes > 0) {
      await sql`UPDATE articles SET content = ${content}, updated_at = NOW() WHERE id = ${article.id}`
      articlesFixed++
      totalFixed += changes
    }
  }

  console.log(`\n--- DONE ---`)
  console.log(`Articles updated : ${articlesFixed}`)
  console.log(`Total links fixed: ${totalFixed}`)
}

main().catch(e => { console.error(e); process.exit(1) })
