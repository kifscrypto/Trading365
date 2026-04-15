const INDEXNOW_KEY = 'ede31ba024ffc531c17306ee950afca9'
const HOST = 'trading365.org'
const BASE_URL = `https://${HOST}`

export function pingIndexNow(urls: string[]): void {
  if (!urls.length) return

  // Fire-and-forget — don't block the response
  fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: HOST,
      key: INDEXNOW_KEY,
      keyLocation: `${BASE_URL}/${INDEXNOW_KEY}.txt`,
      urlList: urls,
    }),
  }).catch(() => {
    // Silently ignore — IndexNow is best-effort
  })
}

export function articleUrl(categorySlug: string, slug: string): string {
  return `${BASE_URL}/${categorySlug}/${slug}`
}
