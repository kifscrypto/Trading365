export function isBlockedIp(headers, blockedIps) {
  const ip = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || headers.get('x-real-ip')?.trim()
  if (!ip || !blockedIps) return false

  return blockedIps.split(',').some(blocked => blocked.trim() === ip)
}
