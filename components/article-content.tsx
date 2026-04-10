"use client"

import { slugifyHeading } from "@/lib/utils/heading"

function parseInlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  // Handle bold **text**, links [text](url), and inline code `code`
  const regex = /\*\*(.*?)\*\*|\[(.*?)\]\((.*?)\)|`(.*?)`/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    if (match[1]) {
      // Bold
      parts.push(
        <strong key={match.index} className="font-semibold text-foreground">
          {match[1]}
        </strong>
      )
    } else if (match[2] && match[3]) {
      // Link
      parts.push(
        <a
          key={match.index}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 hover:text-primary/80"
        >
          {match[2]}
        </a>
      )
    } else if (match[4]) {
      // Inline code
      parts.push(
        <code key={match.index} className="rounded bg-secondary px-1.5 py-0.5 text-xs font-mono text-foreground">
          {match[4]}
        </code>
      )
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  return parts.length > 0 ? parts : [text]
}

function renderTable(tableText: string) {
  const lines = tableText.split("\n").filter((l) => l.trim())
  if (lines.length < 2) return null

  const parseRow = (row: string) =>
    row
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean)

  const headers = parseRow(lines[0])
  const dataRows = lines.slice(2).map(parseRow) // skip separator line

  return (
    <div className="mb-6 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/50">
            {headers.map((h, i) => (
              <th key={i} className="px-4 py-3 text-left font-semibold text-foreground">
                {parseInlineMarkdown(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataRows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-card" : "bg-secondary/20"}>
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 text-muted-foreground">
                  {parseInlineMarkdown(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function addHeadingIds(html: string): string {
  return html
    .replace(/<h([23])([^>]*)>([\s\S]*?)<\/h\1>/gi, (_, level, attrs, inner) => {
      const plain = inner.replace(/<[^>]+>/g, '').trim()
      const id = slugifyHeading(plain)
      return `<h${level} id="${id}"${attrs}>${inner}</h${level}>`
    })
    .replace(/<table/gi, '<div class="table-scroll"><table')
    .replace(/<\/table>/gi, '</table></div>')
}

export function ArticleContent({ content }: { content: string }) {
  // TipTap HTML output — detect by presence of any HTML tag
  if (/<[a-zA-Z]/.test(content)) {
    return (
      <div
        className="article-prose"
        dangerouslySetInnerHTML={{ __html: addHeadingIds(content) }}
      />
    )
  }

  // Legacy Markdown fallback for existing articles
  // Split by double newlines but keep table blocks together
  const blocks: string[] = []
  const rawBlocks = content.split(/\n\s*\n/)

  let tableBuffer: string[] = []
  let inTable = false

  for (const block of rawBlocks) {
    const trimmed = block.trim()
    if (trimmed.startsWith("|") || (inTable && trimmed.includes("|"))) {
      inTable = true
      tableBuffer.push(trimmed)
    } else {
      if (inTable && tableBuffer.length > 0) {
        blocks.push(tableBuffer.join("\n"))
        tableBuffer = []
        inTable = false
      }
      blocks.push(trimmed)
    }
  }
  if (tableBuffer.length > 0) {
    blocks.push(tableBuffer.join("\n"))
  }

  return (
    <div>
      {blocks.map((block, i) => {
        if (!block) return null

        // Table
        if (block.startsWith("|")) {
          return <div key={i}>{renderTable(block)}</div>
        }

        // Blockquote (CTA callout)
        if (block.startsWith("> ")) {
          const text = block.replace(/^>\s?/gm, "")
          return (
            <div
              key={i}
              className="my-6 rounded-lg border border-primary/30 bg-primary/5 px-5 py-4"
            >
              <p className="text-sm leading-relaxed text-foreground">
                {parseInlineMarkdown(text)}
              </p>
            </div>
          )
        }

        // H2 — only the first line is the heading; remaining lines render as sub-blocks
        if (block.startsWith("## ")) {
          const lines = block.split("\n")
          const headingText = lines[0].replace("## ", "")
          const rest = lines.slice(1).join("\n").trim()
          return (
            <div key={i}>
              <h2
                id={slugifyHeading(headingText)}
                className="mb-4 mt-10 text-xl font-bold text-foreground first:mt-0 scroll-mt-24"
              >
                {parseInlineMarkdown(headingText)}
              </h2>
              {rest && (
                <ArticleContent content={rest} />
              )}
            </div>
          )
        }

        // H3 — only the first line is the heading; remaining lines render as sub-blocks
        if (block.startsWith("### ")) {
          const lines = block.split("\n")
          const headingText = lines[0].replace("### ", "")
          const rest = lines.slice(1).join("\n").trim()
          return (
            <div key={i}>
              <h3 className="mb-3 mt-6 text-lg font-semibold text-foreground">
                {parseInlineMarkdown(headingText)}
              </h3>
              {rest && (
                <ArticleContent content={rest} />
              )}
            </div>
          )
        }

        // Unordered list
        if (block.startsWith("- ")) {
          const items = block.split("\n").filter((l) => l.startsWith("- "))
          return (
            <ul key={i} className="mb-4 flex flex-col gap-2 pl-5">
              {items.map((item, j) => (
                <li key={j} className="text-sm leading-relaxed text-muted-foreground list-disc">
                  {parseInlineMarkdown(item.replace("- ", ""))}
                </li>
              ))}
            </ul>
          )
        }

        // Ordered list
        if (block.match(/^\d+\./)) {
          const items = block.split("\n").filter((l) => l.match(/^\d+\./))
          return (
            <ol key={i} className="mb-4 flex flex-col gap-2 pl-5">
              {items.map((item, j) => (
                <li key={j} className="text-sm leading-relaxed text-muted-foreground list-decimal">
                  {parseInlineMarkdown(item.replace(/^\d+\.\s*/, ""))}
                </li>
              ))}
            </ol>
          )
        }

        // Paragraph
        return (
          <p key={i} className="mb-4 text-sm leading-relaxed text-muted-foreground">
            {parseInlineMarkdown(block)}
          </p>
        )
      })}
    </div>
  )
}
