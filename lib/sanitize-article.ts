import sanitizeHtml from 'sanitize-html'

// Server-side allowlist sanitizer for DB article HTML before it reaches
// dangerouslySetInnerHTML in components/article-content.tsx. Pure JS
// (htmlparser2) — no DOM, safe in serverless SSR.
//
// Blocks script/iframe/form/svg/math, all on* handlers, style, and
// javascript:/data: URLs. sanitize-html strips disallowed tags but keeps
// their inner text, except script/style/textarea/option whose contents are
// dropped entirely.

// Must mirror the sniff regex in components/article-content.tsx: only content
// that would take the raw-HTML path there gets sanitized here, so markdown
// bodies are never mangled.
const HTML_SNIFF =
  /<(p|div|h[1-6]|ul|ol|li|table|thead|tbody|tr|th|td|strong|em|br|blockquote|a|span|pre|code|hr|img)\b/i

const ALLOWED_TAGS = [
  'p', 'div', 'span', 'h2', 'h3', 'h4', 'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'strong', 'em', 'b', 'i', 'u', 'br', 'hr', 'blockquote',
  'pre', 'code', 'a', 'img',
]

export function sanitizeArticleHtml(content: string): string {
  if (!HTML_SNIFF.test(content)) return content
  return sanitizeHtml(content, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      '*': ['href', 'src', 'alt', 'title', 'id', 'class', 'target', 'rel'],
    },
    // https/http/mailto only; relative URLs and #anchors pass by default;
    // javascript:, data:, vbscript: are stripped.
    allowedSchemes: ['https', 'http', 'mailto'],
    allowProtocolRelative: false,
  })
}
