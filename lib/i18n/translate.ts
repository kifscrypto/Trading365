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

function buildSystemPrompt(
  language: string,
  context: "title" | "excerpt" | "content" | "faq",
  preserveList: string
): string {
  const sharedRules = `1. Never translate these terms — keep them exactly as-is: ${preserveList}
2. Keep all percentages, numbers, fees, and financial figures unchanged
3. Keep all URLs unchanged
4. Keep exchange ratings like "9.2/10" unchanged
5. Translate naturally for a ${language}-speaking trading audience`

  if (context === "title" || context === "excerpt") {
    return `You are a professional financial content translator. Translate the following into ${language}.

CRITICAL RULES:
${sharedRules}
6. Return ONLY the translated plain text — absolutely NO HTML tags, NO markdown symbols, NO heading markers
   - Do NOT add #, ##, ###, *, **, -, <h1>, <h2>, <p>, or any other formatting
   - Do NOT wrap the output in quotes
   - Do NOT add any explanatory text or commentary
   - Return just the translated sentence/phrase as plain text`
  }

  return `You are a professional financial content translator specialising in cryptocurrency and trading content. Translate accurately and naturally into ${language}.

CRITICAL RULES:
${sharedRules}
6. PRESERVE THE EXACT FORMAT of the original — detect whether the input is HTML or Markdown and keep it in that same format:
   - If the input uses HTML tags (<p>, <h2>, <ul>, <table>, etc.): preserve ALL HTML tags exactly and only translate the visible text inside them
   - If the input uses Markdown (##, **, -, |table|, etc.): preserve ALL Markdown formatting and only translate the text
   - Do NOT convert HTML to Markdown or Markdown to HTML
   - Do NOT add a title, heading, or # prefix at the start that is not in the original
   - Tables, lists, bold, links — keep the same syntax as the original
7. Do not add any commentary — return ONLY the translated content in the exact same format as the input`
}

// Strip accidental markdown heading prefixes Claude sometimes adds to short-field translations
function stripMarkdownPrefix(text: string): string {
  return text.replace(/^#+\s+/, "").trim()
}

export async function translateText(
  text: string,
  targetLocale: LocaleCode,
  context: "title" | "excerpt" | "content" | "faq" = "content"
): Promise<string> {
  const language = LOCALE_FULL_NAMES[targetLocale]
  const preserveList = PRESERVE_TERMS.join(", ")
  const systemPrompt = buildSystemPrompt(language, context, preserveList)

  const message = await getClient().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: "user", content: text }],
  })

  const result = message.content[0]
  if (result.type !== "text") throw new Error("Unexpected response type from Claude")

  const raw = result.text.trim()

  // For title/excerpt always strip any accidental heading markers
  if (context === "title" || context === "excerpt") {
    return stripMarkdownPrefix(raw)
  }

  return raw
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
  // Translate short fields in parallel
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
