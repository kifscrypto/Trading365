import geoip from 'geoip-lite'

export function getClientIp(headers: Headers): string | null {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || headers.get('x-real-ip')
    || null
}

export function getRequestCountry(headers: Headers): string | null {
  const edgeCountry = headers.get('x-vercel-ip-country') || headers.get('cf-ipcountry')
  if (edgeCountry && /^[a-z]{2}$/i.test(edgeCountry) && edgeCountry.toUpperCase() !== 'XX') {
    return edgeCountry.toUpperCase()
  }
  const ip = getClientIp(headers)
  if (!ip) return null
  try {
    return geoip.lookup(ip)?.country || null
  } catch {
    return null
  }
}
