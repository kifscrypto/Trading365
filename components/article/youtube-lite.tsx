'use client'

import { useState } from 'react'

/**
 * Lite YouTube embed (facade). Renders only a thumbnail + play button on load —
 * the real iframe is injected on click, so page load stays free of YouTube's
 * heavy player and LCP/CWV are protected. Thumbnail uses maxresdefault with an
 * hqdefault fallback (maxres 404s on some videos). Fixed 16:9 box = no CLS.
 */
export function YouTubeLite({ videoId, title }: { videoId: string; title: string }) {
  const [playing, setPlaying] = useState(false)
  const [thumb, setThumb] = useState(`https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`)

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-black">
      {playing ? (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group absolute inset-0 h-full w-full cursor-pointer"
          aria-label={`Play video: ${title}`}
        >
          <img
            src={thumb}
            onError={() => setThumb(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`)}
            alt=""
            width={1280}
            height={720}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-opacity group-hover:opacity-90"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <span className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-red-600 shadow-lg transition-transform group-hover:scale-110">
            <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7 fill-white" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </button>
      )}
    </div>
  )
}
