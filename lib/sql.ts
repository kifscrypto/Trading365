import { Pool, types } from 'pg'

// Drop-in replacement for `neon()` from @neondatabase/serverless, backed by
// node-postgres so the app can run against any vanilla Postgres (Railway).
// Supports the call shapes this codebase uses:
//   sql`SELECT ... ${v}`        — template tag
//   sql(text, params)           — ordinary-function form
//   sql.query(text, params?)    — used by scanner-health
// `types` is re-exported so `types.setTypeParser(1082, v => v)` keeps working.

type SqlFn = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<any[]>
  (text: string, params?: unknown[]): Promise<any[]>
  query: (text: string, params?: unknown[]) => Promise<any[]>
}

const pools = new Map<string, Pool>()

function getPool(url: string): Pool {
  let pool = pools.get(url)
  if (!pool) {
    const internal = url.includes('.railway.internal')
    pool = new Pool({
      connectionString: url,
      max: 5,
      ssl: internal ? false : { rejectUnauthorized: false },
    })
    pools.set(url, pool)
  }
  return pool
}

export function neon(url: string): SqlFn {
  const pool = getPool(url)
  const run = async (text: string, params: unknown[] = []) =>
    (await pool.query(text, params as never[])).rows
  const sql = ((first: TemplateStringsArray | string, ...rest: unknown[]) => {
    if (typeof first === 'string') return run(first, (rest[0] as unknown[]) ?? [])
    let text = ''
    const params: unknown[] = []
    for (let i = 0; i < first.length; i++) {
      text += first[i]
      if (i < rest.length) {
        params.push(rest[i])
        text += `$${params.length}`
      }
    }
    return run(text, params)
  }) as SqlFn
  sql.query = (text: string, params: unknown[] = []) => run(text, params)
  return sql
}

export { types }
