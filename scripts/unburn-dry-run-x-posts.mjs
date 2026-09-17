/**
 * Un-burn the receipts that dry runs of the X queue marked as posted.
 *
 * drainReceiptQueue() recorded a post whenever postTweet() reported ok — and in
 * dry mode postTweet() reports ok WITHOUT calling X. So every dry cron run wrote
 * an x_posts row with tweet_id = 'dry-run' and set signal_receipts.posted_to_x =
 * TRUE, which is exactly the flag candidatePool() filters on to find work. Those
 * receipts could never be announced for real, and the day the credentials were
 * added the queue would have looked empty — a "credential problem" that was
 * really a bug. lib/x-queue.ts no longer writes anything in dry mode; this
 * repairs what the old behaviour already wrote.
 *
 * Only records that PROVABLY never reached X are touched: an x_posts row whose
 * tweet_id is the literal 'dry-run'. Real posts carry a numeric id and are never
 * modified. Backs the affected rows up to scripts/_x-dry-burn-backup-<stamp>.json
 * before writing. Dry run by default; pass --apply to write.
 *
 *   node --env-file=.env.local scripts/unburn-dry-run-x-posts.mjs           # dry run + backup
 *   node --env-file=.env.local scripts/unburn-dry-run-x-posts.mjs --apply   # repair
 */
import { neon } from '@neondatabase/serverless'
import { writeFileSync } from 'node:fs'

const DRY_RUN = !process.argv.includes('--apply')
const sql = neon(process.env.DATABASE_URL)

// Every fake record, with the receipt it froze (NULL for digest rows, whose ref
// is a date rather than a public_id).
const rows = await sql`
  SELECT p.id AS post_id, p.kind, p.ref, p.tweet_id, p.created_at AS posted_at,
         r.public_id, r.posted_to_x, r.status, r.origin, r.closed_at, r.move_pct
  FROM x_posts p
  LEFT JOIN signal_receipts r ON p.kind = 'receipt' AND r.public_id = p.ref
  WHERE p.tweet_id = 'dry-run'
  ORDER BY p.created_at
`

const receiptRefs = rows.filter((r) => r.public_id && r.posted_to_x === true).map((r) => r.public_id)
const postIds = rows.map((r) => r.post_id)

// Deterministic stamp (no Date.now()), same convention as the whipsaw cleanup.
const stamp = new Date().toISOString().slice(0, 10)
const backupPath = `scripts/_x-dry-burn-backup-${stamp}.json`
writeFileSync(backupPath, JSON.stringify({ rows, receiptRefs, postIds }, null, 2))

console.log(`backup written: ${backupPath}`)
console.log(`dry-run x_posts rows: ${postIds.length}`)
for (const r of rows) {
  const what = r.kind === 'digest'
    ? `digest for ${r.ref}`
    : `${r.ref} (${r.status ?? 'receipt missing'}, ${r.origin ?? '?'}, move ${r.move_pct ?? '—'})`
  console.log(`  #${r.post_id} ${r.kind}  ${what}  frozen=${r.posted_to_x === true}`)
}
console.log(`receipts to un-freeze (posted_to_x -> FALSE): ${receiptRefs.length}`)

// What this actually recovers: only receipts still inside the 24h posting window
// are worth anything, since candidatePool() ignores anything older.
const eligible = receiptRefs.length
  ? await sql`SELECT COUNT(*)::int AS n FROM signal_receipts
              WHERE public_id = ANY(${receiptRefs}) AND origin = 'live' AND status <> 'fired'
                AND closed_at IS NOT NULL AND closed_at > NOW() - INTERVAL '24 hours'`
  : [{ n: 0 }]
console.log(`  of which are still inside the 24h window (announceable): ${eligible[0].n}`)

if (DRY_RUN) {
  console.log('\nDRY RUN — re-run with --apply to repair.')
  process.exit(0)
}

if (postIds.length) await sql`DELETE FROM x_posts WHERE id = ANY(${postIds})`
if (receiptRefs.length) {
  await sql`UPDATE signal_receipts SET posted_to_x = FALSE WHERE public_id = ANY(${receiptRefs})`
}
console.log(`\nREPAIRED: deleted ${postIds.length} fake x_posts rows, un-froze ${receiptRefs.length} receipts.`)
console.log('Today\'s posting allowance is restored too — postsToday() counts those rows.')