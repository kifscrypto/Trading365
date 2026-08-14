import { timingSafeEqual } from 'node:crypto'
import { verifyAdmin } from '@/lib/auth'

// Constant-time bearer check. When OPS_API_TOKEN is unset, bearer auth is
// simply unavailable — an empty token is never accepted.
function bearerMatches(request: Request): boolean {
  const expected = process.env.OPS_API_TOKEN
  if (!expected) return false
  const header = request.headers.get('authorization')
  if (!header || !header.startsWith('Bearer ')) return false
  const token = header.slice('Bearer '.length)
  if (!token) return false
  const a = Buffer.from(token, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// Ops API access: a valid admin session token (same check the admin routes
// use) OR a matching bearer token for the automation suite.
export async function isOpsAuthorized(request: Request): Promise<boolean> {
  if (await verifyAdmin(request)) return true
  return bearerMatches(request)
}
