import { neon } from '@neondatabase/serverless'

const sql = neon('postgresql://neondb_owner:npg_yD6AjICnehQ8@ep-green-bonus-amhtv7wl-pooler.c-5.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require')

// Exchange name → referral link map
const EXCHANGES = [
  { name: 'MEXC',     url: 'https://www.mexc.com/?shareCode=mexc-KIFSCrypto' },
  { name: 'BYDFi',   url: 'https://partner.bydfi.com/register?vipCode=KifsCrypto' },
  { name: 'BingX',   url: 'https://bingx.com/en/partner/KIFSCrypto' },
  { name: 'Bitunix', url: 'https://www.bitunix.com/register?vipCode=VP7Q' },
  { name: 'BloFin',  url: 'https://partner.blofin.com/d/KIFSCrypto' },
  { name: 'CoinEx',  url: 'https://www.coinex.com/register?rc=ycq7e&channel=Referral' },
  { name: 'Toobit',  url: 'https://www.toobit.com/t/JOM3yF' },
  { name: 'XT.com',  url: 'https://www.xt.com/en/accounts/register?ref=L1P7UH' },
  { name: 'WEEX',    url: 'https://www.weex.com/events/promo/0fee?vipCode=cx5n&qrType=activity' },
  { name: 'KCEX',    url: 'https://www.kcex.com/register?inviteCode=KC0WHLDH-TRADING365' },
  { name: 'Bybit',   url: 'https://partner.bybit.com/b/2705' },
  { name: 'OKX',     url: 'https://www.okx.com' },
  { name: 'Bitget',  url: 'https://bonus.bitget.site/2ZE3ZR' },
  { name: 'KuCoin',  url: 'https://www.kucoin.com' },
  { name: 'PrimeXBT',url: 'https://go.primexbt.direct/visit/?bta=41298&brand=primexbt' },
  { name: 'Gate.io', url: 'https://www.gate.io' },
  { name: 'Kraken',  url: 'https://proinvite.kraken.com/9f1e/7ygw0iiw' },
]

const articles = await sql`SELECT id, slug, title, content FROM articles WHERE published = true`

let totalArticles = 0
let totalReplacements = 0

for (const article of articles) {
  let content = article.content ?? ''
  let changed = false

  // Process line by line — only modify table rows (lines starting with |)
  const lines = content.split('\n')
  const newLines = lines.map(line => {
    if (!line.trim().startsWith('|')) return line

    let newLine = line
    for (const { name, url } of EXCHANGES) {
      // Match the exchange name as a standalone cell value — not already inside a link
      // Handles: | MEXC | or | **MEXC** | or | MEXC (something) |
      // Does NOT touch cells that already have [text](url)
      const cellRe = new RegExp(
        `(\\|\\s*)(?!\\[)(\\*{0,2})${name.replace('.', '\\.')}(\\*{0,2})(\\s*\\|)`,
        'g'
      )
      if (cellRe.test(newLine)) {
        newLine = newLine.replace(
          new RegExp(
            `(\\|\\s*)(?!\\[)(\\*{0,2})${name.replace('.', '\\.')}(\\*{0,2})(\\s*\\|)`,
            'g'
          ),
          (_, pre, b1, b2, post) => `${pre}[${b1}${name}${b2}](${url})${post}`
        )
        changed = true
      }
    }
    return newLine
  })

  if (changed) {
    const newContent = newLines.join('\n')
    await sql`UPDATE articles SET content = ${newContent}, updated_at = NOW() WHERE id = ${article.id}`
    const count = lines.filter((l, i) => l !== newLines[i]).length
    console.log(`✓ ${article.title} — ${count} row(s) fixed`)
    totalArticles++
    totalReplacements += count
  }
}

console.log(`\nDone. ${totalArticles} articles updated, ${totalReplacements} table rows fixed.`)
