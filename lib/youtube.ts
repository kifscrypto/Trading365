/**
 * YouTube URL helpers shared by admin validation, the article render, and the
 * VideoObject schema. We only accept the two canonical public formats:
 *   - https://www.youtube.com/watch?v=VIDEOID
 *   - https://youtu.be/VIDEOID
 * Anything else (playlists, channels, junk) returns null so the caller can reject
 * or store nothing.
 */

/** Extract the 11-char video id from a watch?v= or youtu.be/ URL, else null. */
export function extractYouTubeId(input: string | null | undefined): string | null {
  if (!input) return null
  const url = input.trim()
  if (!url) return null

  // youtu.be/<id>
  let m = url.match(/^https?:\/\/(?:www\.)?youtu\.be\/([A-Za-z0-9_-]{11})(?:[?&#/].*)?$/i)
  if (m) return m[1]

  // youtube.com/watch?v=<id> (id may sit anywhere in the query string)
  m = url.match(/^https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(?:[^#]*&)?v=([A-Za-z0-9_-]{11})(?:[&#].*)?$/i)
  if (m) return m[1]

  return null
}

/** Canonical watch URL for a valid input, else null. */
export function canonicalYouTubeUrl(input: string | null | undefined): string | null {
  const id = extractYouTubeId(input)
  return id ? `https://www.youtube.com/watch?v=${id}` : null
}

/** maxres thumbnail (falls back to hqdefault client-side on error). */
export function youTubeThumbnail(id: string): string {
  return `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`
}

/** Privacy-friendly embed URL (no cookies until playback). */
export function youTubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}`
}
