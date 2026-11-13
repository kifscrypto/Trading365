'use client'

import { useState } from 'react'
import { Check, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Share control for a public page. Uses the native share sheet where the
 * platform offers one (Windows/mobile), and otherwise copies the canonical URL
 * to the clipboard and confirms inline. The URL passed in should be the
 * canonical absolute URL, not window.location, so shared links never carry
 * tracking or query junk.
 */
export function ShareButton({
  title,
  text,
  url,
  className,
}: {
  title: string
  text?: string
  url: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  async function share() {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text, url })
        return
      } catch (error) {
        // The user dismissed the sheet: do nothing. Any other failure falls
        // through to the clipboard path.
        if ((error as Error)?.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked: leave the user on the page; the URL is in the address bar.
    }
  }

  return (
    <Button type="button" size="lg" variant="outline" onClick={share} className={className} aria-label="Share T365 Terminal">
      {copied ? <Check className="mr-2 h-4 w-4 text-primary" /> : <Share2 className="mr-2 h-4 w-4" />}
      {copied ? 'Link copied' : 'Share'}
    </Button>
  )
}
