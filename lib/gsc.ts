import { createSign } from 'crypto'

const SITE_URL = 'https://trading365.org/'

function base64url(data: string | Buffer): string {
  const b64 = Buffer.isBuffer(data)
    ? data.toString('base64')
    : Buffer.from(data).toString('base64')
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function getAccessToken(): Promise<string> {
  const clientEmail = process.env.GSC_CLIENT_EMAIL
  const privateKey = process.env.GSC_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!clientEmail || !privateKey) throw new Error('GSC credentials not configured')

  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }))

  const signingInput = `${header}.${payload}`
  const sign = createSign('RSA-SHA256')
  sign.update(signingInput)
  const signature = base64url(sign.sign(privateKey))
  const jwt = `${signingInput}.${signature}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
    cache: 'no-store',
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description ?? 'GSC token error')
  return data.access_token
}

export interface GSCKeyword {
  query: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface GSCData {
  pageUrl: string
  dateRange: string
  totalClicks: number
  totalImpressions: number
  avgCtr: number
  avgPosition: number
  keywords: GSCKeyword[]
}

export async function getPageGSCData(pageUrl: string): Promise<GSCData | null> {
  try {
    const accessToken = await getAccessToken()

    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 28)
    const fmt = (d: Date) => d.toISOString().split('T')[0]

    const res = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: fmt(startDate),
          endDate: fmt(endDate),
          dimensions: ['query'],
          dimensionFilterGroups: [{
            filters: [{
              dimension: 'page',
              operator: 'equals',
              expression: pageUrl,
            }],
          }],
          rowLimit: 10,
        }),
        cache: 'no-store',
      }
    )

    if (!res.ok) return null
    const data = await res.json()
    const rows: any[] = data.rows ?? []
    if (!rows.length) return null

    const keywords: GSCKeyword[] = rows.map(r => ({
      query: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: Math.round(r.ctr * 1000) / 10,
      position: Math.round(r.position * 10) / 10,
    }))

    const totalClicks = keywords.reduce((s, k) => s + k.clicks, 0)
    const totalImpressions = keywords.reduce((s, k) => s + k.impressions, 0)
    const avgCtr = totalImpressions > 0 ? Math.round(totalClicks / totalImpressions * 1000) / 10 : 0
    const avgPosition = Math.round(keywords.reduce((s, k) => s + k.position, 0) / keywords.length * 10) / 10

    return {
      pageUrl,
      dateRange: `${fmt(startDate)} to ${fmt(endDate)}`,
      totalClicks,
      totalImpressions,
      avgCtr,
      avgPosition,
      keywords,
    }
  } catch {
    return null
  }
}

export function formatGSCForPrompt(gsc: GSCData): string {
  return [
    `REAL PERFORMANCE DATA (Google Search Console — last 28 days)`,
    `Page: ${gsc.pageUrl}`,
    `Total: ${gsc.totalImpressions.toLocaleString()} impressions | ${gsc.totalClicks.toLocaleString()} clicks | ${gsc.avgCtr}% CTR | avg position ${gsc.avgPosition}`,
    ``,
    `Top keywords:`,
    ...gsc.keywords.map((k, i) =>
      `${i + 1}. "${k.query}" — pos ${k.position}, ${k.impressions.toLocaleString()} impr, ${k.clicks} clicks, ${k.ctr}% CTR`
    ),
  ].join('\n')
}
