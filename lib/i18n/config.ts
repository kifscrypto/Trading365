export const LOCALES = [
  { code: "es", name: "Español", flag: "🇪🇸", fullName: "Spanish" },
  { code: "pt", name: "Português", flag: "🇧🇷", fullName: "Portuguese" },
  { code: "de", name: "Deutsch", flag: "🇩🇪", fullName: "German" },
  { code: "fr", name: "Français", flag: "🇫🇷", fullName: "French" },
  { code: "ja", name: "日本語", flag: "🇯🇵", fullName: "Japanese" },
  { code: "ko", name: "한국어", flag: "🇰🇷", fullName: "Korean" },
  { code: "ru", name: "Русский", flag: "🇷🇺", fullName: "Russian" },
  { code: "zh-CN", name: "简体中文", flag: "🇨🇳", fullName: "Simplified Chinese" },
  { code: "zh-TW", name: "繁體中文", flag: "🇹🇼", fullName: "Traditional Chinese" },
] as const

export type LocaleCode = typeof LOCALES[number]["code"]

export const LOCALE_CODES = LOCALES.map((l) => l.code)

// Locales whose translation coverage is complete enough to expose to search
// engines: their pages are indexable and advertised via hreflang. Other locales
// stay noindex (and are omitted from hreflang) until they're finished, so we
// never advertise a half-translated section. Add a code here once its coverage
// is complete. Traffic + coverage data drove starting with the two Chinese
// variants (see the i18n memory).
export const INDEXED_LOCALES: readonly string[] = ["zh-CN", "zh-TW", "ko", "ja"]

export function isIndexedLocale(code: string): boolean {
  return INDEXED_LOCALES.includes(code)
}

export function getLocale(code: string) {
  return LOCALES.find((l) => l.code === code)
}

export function isValidLocale(code: string): code is LocaleCode {
  return LOCALE_CODES.includes(code as LocaleCode)
}

// Language names for Claude translation prompts
export const LOCALE_FULL_NAMES: Record<LocaleCode, string> = {
  "es": "Spanish",
  "pt": "Brazilian Portuguese",
  "de": "German",
  "fr": "French",
  "ja": "Japanese",
  "ko": "Korean",
  "ru": "Russian",
  "zh-CN": "Simplified Chinese (Mandarin)",
  "zh-TW": "Traditional Chinese (Mandarin)",
}
