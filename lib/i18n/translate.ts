import Anthropic from "@anthropic-ai/sdk"
import type { LocaleCode } from "./config"
import { LOCALE_FULL_NAMES } from "./config"

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set")
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

// Terms that must NEVER be translated
const PRESERVE_TERMS = [
  // Exchange names
  "MEXC", "BYDFi", "BingX", "Bybit", "OKX", "Bitget", "KuCoin", "Gate.io",
  "WEEX", "BloFin", "Bitunix", "CoinEx", "Toobit", "XT.com", "KCEX",
  "Binance", "Kraken", "Coinbase",
  // Crypto terms
  "USDT", "BTC", "ETH", "Bitcoin", "Ethereum", "DeFi", "NFT", "KYC",
  "Trading365", "trading365.org",
]

export async function translateText(
  text: string,
  targetLocale: LocaleCode,
  context: "title" | "excerpt" | "content" | "faq" = "content"
): Promise<string> {
  const language = LOCALE_FULL_NAMES[targetLocale]
  const preserveList = PRESERVE_TERMS.join(", ")

  const systemPrompt = `You are a professional financial content translator specialising in cryptocurrency and trading content. Translate accurately and naturally into ${language}.

CRITICAL RULES:
1. Never translate these terms — keep them exactly as-is: ${preserveList}
2. Keep all percentages, numbers, fees, and financial figures unchanged
3. Keep all URLs unchanged
4. Keep all markdown formatting (##, **, *, [], etc.) intact
5. Keep exchange ratings like "9.2/10" unchanged
6. Translate naturally for a ${language}-speaking trading audience
7. Do not add any commentary — return ONLY the translated text
8. For ${context === "content" ? "article body" : context} translation, maintain the same structure and tone`

  const message = await getClient().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: "user", content: text }],
  })

  const result = message.content[0]
  if (result.type !== "text") throw new Error("Unexpected response type from Claude")
  return result.text.trim()
}

export interface TranslatedArticle {
  title: string
  excerpt: string
  content: string
  metaTitle: string
  metaDescription: string
}

export async function translateArticle(
  article: { title: string; excerpt: string; content: string; metaTitle?: string; metaDescription?: string },
  targetLocale: LocaleCode
): Promise<TranslatedArticle> {
  // Translate fields in parallel where possible
  const [title, excerpt, metaTitle, metaDescription] = await Promise.all([
    translateText(article.title, targetLocale, "title"),
    translateText(article.excerpt, targetLocale, "excerpt"),
    translateText(article.metaTitle || article.title, targetLocale, "title"),
    translateText(article.metaDescription || article.excerpt, targetLocale, "excerpt"),
  ])

  // Content is long — translate separately to avoid timeout
  const content = await translateText(article.content, targetLocale, "content")

  return { title, excerpt, content, metaTitle, metaDescription }
}
