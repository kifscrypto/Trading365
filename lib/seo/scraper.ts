export interface SerpResult {
  position: number
  title: string
  url: string
  domain: string
  snippet: string
}

export async function scrapeSerp(keyword: string): Promise<SerpResult[]> {
  try {
    const query = encodeURIComponent(keyword)
    const response = await fetch(
      `https://www.google.com/search?q=${query}&num=10&hl=en&gl=us`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xhtml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
        },
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!response.ok) return []
    const html = await response.text()
    return parseGoogleResults(html)
  } catch {
    return []
  }
}

function clean(str: string): string {
  return str
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseGoogleResults(html: string): SerpResult[] {
  const results: SerpResult[] = []
  const h3s = [...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)]
  const cites = [...html.matchAll(/<cite[^>]*>([\s\S]*?)<\/cite>/gi)]
  const snippetRe = /class="[^"]*(?:VwiC3b|s3v9rd|lEBKkf|IsZvec|st)[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div)>/gi
  const snippets = [...html.matchAll(snippetRe)]

  for (let i = 0; i < Math.min(h3s.length, 10); i++) {
    const title = clean(h3s[i]?.[1] || '')
    if (!title || title.length < 5) continue
    const rawUrl = clean(cites[i]?.[1] || '')
    const url = rawUrl.split(' › ')[0]
    const domain = url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0]
    const snippet = clean(snippets[i]?.[1] || '').slice(0, 250)
    results.push({ position: results.length + 1, title, url, domain, snippet })
  }

  return results
}
