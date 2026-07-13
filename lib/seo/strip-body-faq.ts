// FAQs live in the structured `faqs` field — the page renders them as a collapsible
// block and emits FAQPage JSON-LD schema from them. The generator (and LLM edits)
// sometimes ALSO write a "## FAQ" section into the body, which then renders a second
// time on the page (duplicate content + schema/visible mismatch). This removes a body
// FAQ heading and its section. Only call it when the structured `faqs` field is
// populated — otherwise the body FAQ is the only one and must be kept.
export function stripBodyFaqSection(content: string): { content: string; stripped: boolean } {
  if (!content) return { content, stripped: false }
  const re = /(^|\n)(#{2,3})[ \t]*(FAQ|FAQs|Frequently Asked Questions)\b[^\n]*/i
  const m = content.match(re)
  if (!m || m.index === undefined) return { content, stripped: false }

  const level = m[2].length
  const hStart = m.index + (m[1] ? m[1].length : 0)          // position of the FAQ heading's first '#'
  const afterPos = m.index + m[0].length
  const rest = content.slice(afterPos)
  // section ends at the next heading of the same-or-higher level (or end of doc)
  const nm = rest.match(new RegExp('\\n#{1,' + level + '}[ \\t]+\\S'))
  const end = nm && nm.index !== undefined ? afterPos + nm.index + 1 : content.length

  const before = content.slice(0, hStart).replace(/\s+$/, '')
  const after = content.slice(end).replace(/^\s+/, '')
  const out = (before + (after ? '\n\n' + after : '')).trimEnd() + '\n'
  return { content: out, stripped: true }
}
