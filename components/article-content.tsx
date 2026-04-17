"use client"

import { slugifyHeading } from "@/lib/utils/heading"
import { ExternalLink, ShieldCheck } from "lucide-react"

// Domains that get rel="nofollow sponsored"
const AFFILIATE_DOMAINS = [
  'mexc.com','bydfi.com','bingx.com','bitunix.com','blofin.com','coinex.com',
  'toobit.com','xt.com','weex.com','kcex.com','bybit.com','okx.com','bitget',
  'kucoin.com','primexbt','gate.io','kraken.com',
]

// Domains that get a "Verified Partner" badge
const VERIFIED_PARTNER_DOMAINS = ['bybit.com','weex.com','bitunix.com']

// CTA button referral links for fee table footer
const FEE_TABLE_CTAS = [
  { label: "Get Bybit VIP",      href: "https://partner.bybit.com/b/2705" },
  { label: "Get WEEX Rebates",   href: "https://www.weex.com/events/promo/0fee?vipCode=cx5n&qrType=activity" },
  { label: "Get Bitunix Bonus",  href: "https://www.bitunix.com/register?vipCode=VP7Q" },
]

function isAffiliateUrl(url: string) {
  return AFFILIATE_DOMAINS.some(d => url.toLowerCase().includes(d))
}

function isVerifiedPartner(url: string) {
  return VERIFIED_PARTNER_DOMAINS.some(d => url.toLowerCase().includes(d))
}

function relAttr(url: string) {
  if (url.startsWith('/') || url.startsWith('#')) return undefined
  return isAffiliateUrl(url)
    ? "nofollow noopener noreferrer sponsored"
    : "noopener noreferrer"
}

function parseInlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const regex = /\*\*(.*?)\*\*|\[(.*?)\]\((.*?)\)|`(.*?)`/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))

    if (match[1]) {
      parts.push(
        <strong key={match.index} className="font-semibold text-foreground">{match[1]}</strong>
      )
    } else if (match[2] && match[3]) {
      const href = match[3]
      const isExternal = !href.startsWith('/')
      const verified = isVerifiedPartner(href)
      parts.push(
        <span key={match.index} className="inline-flex items-center gap-1">
          <a
            href={href}
            target={isExternal ? "_blank" : undefined}
            rel={relAttr(href)}
            className="text-primary underline underline-offset-2 hover:text-primary/80"
          >
            {match[2]}
          </a>
          {verified && (
            <span title="Trading365 Verified Partner" className="inline-flex items-center gap-0.5 rounded-full bg-[#eab308]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#eab308]">
              <ShieldCheck className="h-2.5 w-2.5" />
              Verified
            </span>
          )}
        </span>
      )
    } else if (match[4]) {
      parts.push(
        <code key={match.index} className="rounded bg-secondary px-1.5 py-0.5 text-xs font-mono text-foreground">
          {match[4]}
        </code>
      )
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts.length > 0 ? parts : [text]
}

function renderTable(tableText: string, key: number) {
  const lines = tableText.split("\n").filter((l) => l.trim())
  if (lines.length < 2) return null

  const parseRow = (row: string) =>
    row.split("|").map((c) => c.trim()).filter(Boolean)

  const headers = parseRow(lines[0])
  const dataRows = lines.slice(2).map(parseRow)

  const isFeeTable = headers.some(h => /fee|maker|taker|cost|rate|exchange/i.test(h))

  return (
    <div key={key} className="mb-6 overflow-x-auto rounded-lg border border-border">
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
        {isFeeTable && (
          <tfoot>
            <tr>
              <td colSpan={headers.length} className="border-t border-[#eab308]/30 bg-[#1a1a1a] px-4 py-3">
                <div className="flex flex-wrap gap-2 justify-center">
                  {FEE_TABLE_CTAS.map(cta => (
                    <a
                      key={cta.label}
                      href={cta.href}
                      target="_blank"
                      rel="nofollow noopener noreferrer sponsored"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#eab308] px-4 py-2 text-xs font-bold text-black hover:opacity-90 transition-opacity whitespace-nowrap"
                    >
                      {cta.label}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ))}
                </div>
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

function FeeWarningCallout({ ctaLink }: { ctaLink: string }) {
  return (
    <div className="my-6 rounded-lg border border-[#eab308] bg-[#1a1a1a] px-5 py-4 flex items-start gap-3">
      <span className="text-[#eab308] text-base mt-0.5 shrink-0">⚠</span>
      <div className="flex-1">
        <p className="text-sm font-bold text-white mb-1">Stop the Fee Drain</p>
        <p className="text-sm text-zinc-300 mb-3">
          High-volume traders are losing ~$2,000/mo on taker fees. Zero-fee structures exist — most traders just don't know how to access them.
        </p>
        <a
          href={ctaLink}
          target="_blank"
          rel="nofollow noopener noreferrer sponsored"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#eab308] px-4 py-2 text-sm font-bold text-black hover:opacity-90 transition-opacity"
        >
          Start Saving Now
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
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

interface ArticleContentProps {
  content: string
  ctaLink?: string
}

export function ArticleContent({ content, ctaLink }: ArticleContentProps) {
  if (/<(p|div|h[1-6]|ul|ol|li|table|thead|tbody|tr|th|td|strong|em|br|blockquote|a|span|pre|code|hr|img)\b/i.test(content)) {
    return (
      <div
        className="article-prose"
        dangerouslySetInnerHTML={{ __html: addHeadingIds(content) }}
      />
    )
  }

  // Legacy Markdown path — assemble blocks, then render with word-count CTA injection
  const rawBlocks = content.split(/\n\s*\n/)
  const blocks: string[] = []
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
  if (tableBuffer.length > 0) blocks.push(tableBuffer.join("\n"))

  const CTA_INTERVAL = 600
  const CTA_MAX = 2
  const elements: React.ReactNode[] = []
  let wordCount = 0
  let ctaCount = 0

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (!block) continue

    // Table
    if (block.startsWith("|")) {
      elements.push(renderTable(block, i))
      continue
    }

    // Blockquote
    if (block.startsWith("> ")) {
      const text = block.replace(/^>\s?/gm, "")
      elements.push(
        <div key={i} className="my-6 rounded-lg border border-primary/30 bg-primary/5 px-5 py-4">
          <p className="text-sm leading-relaxed text-foreground">{parseInlineMarkdown(text)}</p>
        </div>
      )
      wordCount += text.split(/\s+/).filter(Boolean).length
    } else if (block.startsWith("## ")) {
      const lines = block.split("\n")
      const headingText = lines[0].replace("## ", "")
      const rest = lines.slice(1).join("\n").trim()
      elements.push(
        <div key={i}>
          <h2 id={slugifyHeading(headingText)} className="mb-4 mt-10 text-xl font-bold text-foreground first:mt-0 scroll-mt-24">
            {parseInlineMarkdown(headingText)}
          </h2>
          {rest && <ArticleContent content={rest} />}
        </div>
      )
    } else if (block.startsWith("### ")) {
      const lines = block.split("\n")
      const headingText = lines[0].replace("### ", "")
      const rest = lines.slice(1).join("\n").trim()
      elements.push(
        <div key={i}>
          <h3 className="mb-3 mt-6 text-lg font-semibold text-foreground">
            {parseInlineMarkdown(headingText)}
          </h3>
          {rest && <ArticleContent content={rest} />}
        </div>
      )
    } else if (block.startsWith("- ")) {
      const items = block.split("\n").filter((l) => l.startsWith("- "))
      elements.push(
        <ul key={i} className="mb-4 flex flex-col gap-2 pl-5">
          {items.map((item, j) => (
            <li key={j} className="text-sm leading-relaxed text-muted-foreground list-disc">
              {parseInlineMarkdown(item.replace("- ", ""))}
            </li>
          ))}
        </ul>
      )
      wordCount += block.split(/\s+/).filter(Boolean).length
    } else if (block.match(/^\d+\./)) {
      const items = block.split("\n").filter((l) => l.match(/^\d+\./))
      elements.push(
        <ol key={i} className="mb-4 flex flex-col gap-2 pl-5">
          {items.map((item, j) => (
            <li key={j} className="text-sm leading-relaxed text-muted-foreground list-decimal">
              {parseInlineMarkdown(item.replace(/^\d+\.\s*/, ""))}
            </li>
          ))}
        </ol>
      )
      wordCount += block.split(/\s+/).filter(Boolean).length
    } else {
      elements.push(
        <p key={i} className="mb-4 text-sm leading-relaxed text-muted-foreground">
          {parseInlineMarkdown(block)}
        </p>
      )
      wordCount += block.split(/\s+/).filter(Boolean).length
    }

    // Inject fee-drain callout every 600 words, max 2 times
    if (ctaLink && ctaCount < CTA_MAX && wordCount >= CTA_INTERVAL * (ctaCount + 1)) {
      elements.push(<FeeWarningCallout key={`cta-drain-${ctaCount}`} ctaLink={ctaLink} />)
      ctaCount++
    }
  }

  return <div>{elements}</div>
}
