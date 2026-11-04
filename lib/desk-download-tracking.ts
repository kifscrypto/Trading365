import { getRequestCountry } from './analytics-request.ts'

const BOT_UA =
  /bot|crawl|spider|slurp|facebookexternalhit|semrush|ahrefs|headless|puppeteer|playwright|phantom|selenium|python|curl|wget|http-client|go-http|axios|node-fetch|java\/|okhttp|bytespider|gptbot|claudebot|ccbot|dataforseo|petalbot|yandex|bingpreview/i

export function getDeskDownloadDetails(headers: Headers) {
  const userAgent = headers.get('user-agent') || ''
  return {
    country: getRequestCountry(headers),
    isBot: !userAgent || BOT_UA.test(userAgent),
    userAgent: userAgent.slice(0, 300) || null,
  }
}
