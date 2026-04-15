'use client'

import { useState } from 'react'
import { Share2, Check, Link } from 'lucide-react'

export function ShareButton({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)

  async function handleShare() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, url })
        return
      } catch {
        // User cancelled or API unavailable — fall through to dropdown
      }
    }
    setOpen((o) => !o)
  }

  function copyLink() {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => {
      setCopied(false)
      setOpen(false)
    }, 2000)
  }

  const tweetUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`
  const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`

  return (
    <div className="relative">
      <button
        onClick={handleShare}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Share this article"
      >
        <Share2 className="h-3.5 w-3.5" />
        Share
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-7 z-20 flex flex-col gap-0.5 rounded-lg border border-border bg-card p-1.5 shadow-lg min-w-[160px]">
            <a
              href={tweetUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-xs text-foreground hover:bg-secondary transition-colors"
            >
              {/* X logo */}
              <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.63 5.905-5.63Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              Share on X
            </a>
            <a
              href={fbUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-xs text-foreground hover:bg-secondary transition-colors"
            >
              {/* Facebook logo */}
              <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              Share on Facebook
            </a>
            <button
              onClick={copyLink}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-xs text-foreground hover:bg-secondary transition-colors text-left w-full"
            >
              {copied
                ? <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />
                : <Link className="h-3.5 w-3.5 shrink-0" />
              }
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
