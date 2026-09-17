/**
 * Kimi code-review gate.
 *
 * Sends the current change set (modified + staged + UNTRACKED files, so newly
 * added files are reviewed too) to Moonshot's Kimi API and prints a structured
 * verdict. Built to be the "Kimi check" step before pushing to main.
 *
 *   node --env-file=.env.local scripts/kimi-review.mjs                 # review working tree
 *   node --env-file=.env.local scripts/kimi-review.mjs --dry-run        # build the prompt, no API call
 *   node --env-file=.env.local scripts/kimi-review.mjs --fail-on-blocking   # exit 2 if Kimi flags blockers
 *   node --env-file=.env.local scripts/kimi-review.mjs --base origin/main   # review against a ref
 *   node --env-file=.env.local scripts/kimi-review.mjs --thinking       # allow k2.x thinking mode
 *
 * Env: MOONSHOT_API_KEY (required unless --dry-run), KIMI_MODEL (default kimi-k2.5).
 *
 * Exit codes: 0 ok · 1 setup/API failure · 2 blocking issues (only with --fail-on-blocking).
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const KIMI_API_URL = 'https://api.moonshot.ai/v1/chat/completions'
const TOTAL_CAP = 180_000   // chars of change set sent to the model
const PER_FILE_CAP = 30_000 // chars per file
const MAX_FILE_BYTES = 300_000
const SKIP_EXT = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|eot|pdf|zip|mp4|mov|pyc)$/i

const argv = process.argv.slice(2)
const has = (flag) => argv.includes(flag)
const argOf = (flag, fallback = null) => {
  const i = argv.indexOf(flag)
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback
}

const DRY_RUN = has('--dry-run')
const FAIL_ON_BLOCKING = has('--fail-on-blocking')
const BASE = argOf('--base')
// Written to the OS temp dir so review artefacts never show up as untracked files.
const OUT = argOf('--out', join(tmpdir(), `kimi-review-${new Date().toISOString().replace(/[:.]/g, '-')}.md`))
const MODEL = process.env.KIMI_MODEL || 'kimi-k2.5'

/** Run git and return stdout, or '' when the command fails. */
function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch {
    return ''
  }
}

// ── The rules this project has to be held to ────────────────────────────────
const RULES = `You are reviewing a change set for Trading365 (trading365.org), a Next.js 16 App Router
+ React 19 + Tailwind v4 + Neon Postgres site on Vercel. It is a crypto exchange-review
content site with two automated altcoin signal scanners (long and short).

Judge the change set against these project rules, which are non-negotiable:

1. CONVENTIONS: match the existing code style — raw neon() tagged templates (no ORM),
   'use client' only where interaction needs it, shadcn/ui components, comments that
   explain WHY rather than restating the code.
2. NO NEW DEPENDENCIES without explicit approval. Flag any added import that is not
   already in package.json.
3. NEVER BREAK THE SCANNER: the Telegram alert path, the scanner crons and the
   monitor crons must keep working. Any new code called from those paths must swallow
   its own errors and must never delay or drop a Telegram send.
4. SIGNAL RECEIPTS ARE WRITE-ONCE: entry price, targets, fired_at, side, symbol,
   public_id and origin must never be updated after creation; only the outcome
   (status, closed_at, move_pct, mfe_pct) may change, and only by adding information.
   Historical results are never deleted or rewritten.
5. SEO INVARIANTS: closed receipts are always publicly readable and indexable;
   unresolved signals have no public URL; filter/pagination variants are
   noindex,follow; no hreflang on signal pages; app/sitemap.ts, middleware.ts and the
   editorial internal-link graph must not be modified; no Review/AggregateRating
   schema; robots.txt must never be widened to allow /api/.
6. CLAIMS MUST BE PROVABLE: no hardcoded performance numbers (hit rates, counts),
   no promised returns, "not financial advice" wording present on public signal pages.
7. SECURITY: no secrets in code, parameterised SQL only (never string-built SQL with
   user input), cookies httpOnly/secure/sameSite, auth comparisons timing-safe,
   passwords never stored or logged in plaintext.
8. HONESTY: nothing may overstate the track record or claim pre-commitment for
   behaviour that did not happen.

Report only what you can justify from the diff. If you cannot see enough context to
judge something, say so explicitly rather than guessing.

Answer in these sections, using markdown:
## Verdict
One of: SHIP IT / SHIP WITH NITS / FIX FIRST, plus one sentence of justification.
## Blocking
Numbered list. Real defects only (correctness, data loss, security, rules 3-5).
Write "None." if there are none.
## Non-blocking
Numbered list with a suggested fix each. Write "None." if there are none.
## Rule compliance
Go through rules 1-8 briefly and state pass / concern for each.
## Missing verification
What a human should test before this ships.`

// ── Collect the change set ──────────────────────────────────────────────────
function collect() {
  const parts = []
  const omitted = []
  let used = 0

  // Tracked changes: staged + unstaged, against the given ref (HEAD by default).
  const label = BASE ? `vs ${BASE}` : 'working tree vs HEAD'
  const tracked = git(['diff', BASE ?? 'HEAD'])
  if (tracked.trim()) {
    const chunk = tracked.length > TOTAL_CAP ? `${tracked.slice(0, TOTAL_CAP)}\n… [truncated]` : tracked
    parts.push(`### Modified files (${label})\n\n\`\`\`diff\n${chunk}\n\`\`\``)
    used += chunk.length
  }

  // Untracked files matter most when building a feature — send their contents,
  // not just their names, or the reviewer sees an empty change set.
  const untracked = git(['ls-files', '--others', '--exclude-standard'])
    .split('\n').map((s) => s.trim()).filter(Boolean)
  for (const f of untracked) {
    if (SKIP_EXT.test(f)) { omitted.push(`${f} (binary)`); continue }
    let size = 0
    try { size = statSync(f).size } catch { omitted.push(`${f} (unreadable)`); continue }
    if (size > MAX_FILE_BYTES) { omitted.push(`${f} (${Math.round(size / 1024)}KB, too large)`); continue }
    if (used > TOTAL_CAP) { omitted.push(`${f} (over total cap)`); continue }
    let body = readFileSync(f, 'utf8')
    if (body.length > PER_FILE_CAP) body = `${body.slice(0, PER_FILE_CAP)}\n… [truncated]`
    const chunk = `### New file: ${f}\n\n\`\`\`\n${body}\n\`\`\``
    parts.push(chunk)
    used += chunk.length
  }

  return { text: parts.join('\n\n'), omitted, used, untracked }
}

const cs = collect()
const status = git(['status', '--porcelain']).trim()

if (!cs.text.trim()) {
  console.log('Nothing to review — the working tree matches HEAD and there are no untracked files.')
  process.exit(0)
}

const prompt = [
  'Review this change set.',
  '',
  '### git status --porcelain',
  '```',
  status || '(clean)',
  '```',
  ...(cs.omitted.length
    ? ['', '### NOT included above (they exist, but do not speculate about their contents)', '```', cs.omitted.join('\n'), '```']
    : []),
  '',
  cs.text,
].join('\n')

if (DRY_RUN) {
  writeFileSync(OUT, `# Kimi review prompt (dry run)\n\nModel would be: ${MODEL}\n\n---\n\n${prompt}\n`)
  console.log('Dry run — no API call made.')
  console.log(`  change set : ${cs.used.toLocaleString()} chars, ${cs.untracked.length} new file(s)`)
  console.log(`  prompt     : ${OUT}`)
  if (cs.omitted.length) console.log(`  omitted    : ${cs.omitted.join(', ')}`)
  process.exit(0)
}

// ── Moonshot call (mirrors lib/kimi.ts) ─────────────────────────────────────
const apiKey = process.env.MOONSHOT_API_KEY
if (!apiKey) {
  console.error('MOONSHOT_API_KEY is not set.')
  console.error('  Add it to .env.local, then: node --env-file=.env.local scripts/kimi-review.mjs')
  console.error('  Or use --dry-run to produce the prompt and paste it into Kimi manually.')
  process.exit(1)
}

const body = {
  model: MODEL,
  messages: [{ role: 'system', content: RULES }, { role: 'user', content: prompt }],
  max_tokens: 4000,
}
// kimi-k2.x enables thinking mode by default, which burns the budget on hidden
// reasoning (see lib/kimi.ts). Disabled unless --thinking is passed.
const payload = MODEL.startsWith('kimi-k2') && !has('--thinking')
  ? { ...body, thinking: { type: 'disabled' } }
  : body

console.log(`Reviewing ${cs.used.toLocaleString()} chars with ${MODEL}…`)
const res = await fetch(KIMI_API_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
  body: JSON.stringify(payload),
})
if (!res.ok) {
  console.error(`Kimi API error ${res.status}: ${await res.text()}`)
  process.exit(1)
}
const data = await res.json()
const review = data.choices?.[0]?.message?.content ?? ''
if (!review.trim()) {
  console.error('Kimi returned an empty review.')
  process.exit(1)
}

// ── Report ─────────────────────────────────────────────────────────────────
const doc = [
  `# Kimi review — ${new Date().toISOString()}`,
  `Model: ${MODEL}`,
  '',
  '## Files under review',
  '```',
  status || '(clean)',
  '```',
  ...(cs.omitted.length ? ['', '## Not included', '```', cs.omitted.join('\n'), '```'] : []),
  '',
  review,
].join('\n')

writeFileSync(OUT, doc)
console.log(`\n${review}\n`)
console.log(`Saved to ${OUT}`)

const blockingSection = (/##\s*Blocking\s*\n([\s\S]*?)(?=\n##\s|$)/i.exec(review)?.[1] ?? '').trim()
const hasBlocking = /^\s*\d+\.\s+\S/m.test(blockingSection)

if (hasBlocking) {
  console.log('\n⚠ Kimi reported blocking issues.')
  if (FAIL_ON_BLOCKING) process.exit(2)
}