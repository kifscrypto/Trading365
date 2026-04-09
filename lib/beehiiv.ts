/**
 * Beehiiv API client + HTML email template builder.
 *
 * Creates newsletter draft posts in Beehiiv from article data.
 * The draft appears in your Beehiiv dashboard for review before sending.
 */

const BASE_URL = 'https://www.trading365.org'
const BEEHIIV_BASE = 'https://api.beehiiv.com/v2'

export interface ArticleForNewsletter {
  slug: string
  title: string
  excerpt: string
  category: string
  categorySlug: string
  thumbnail?: string | null
  rating?: number | null
}

function esc(str: string | null | undefined): string {
  return (str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildEmailHtml(article: ArticleForNewsletter): string {
  const { slug, title, excerpt, category, categorySlug, thumbnail, rating } = article
  const articleUrl = `${BASE_URL}/${categorySlug}/${slug}`
  const ctaText = categorySlug === 'reviews' ? 'Read the full review' : 'Read the full article'
  const imgSrc = thumbnail
    ? thumbnail.startsWith('http') ? thumbnail : `${BASE_URL}${thumbnail}`
    : null

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

        <!-- Header / Logo -->
        <tr>
          <td style="background:#18181b;padding:22px 32px;text-align:center;">
            <img src="${BASE_URL}/images/logo-wide.png" alt="Trading365" width="160"
              style="display:block;margin:0 auto;max-width:160px;height:auto;">
          </td>
        </tr>

        ${imgSrc ? `
        <!-- Hero image -->
        <tr>
          <td style="padding:0;line-height:0;">
            <img src="${esc(imgSrc)}" alt="${esc(title)}" width="600"
              style="display:block;width:100%;max-width:600px;height:auto;">
          </td>
        </tr>` : ''}

        <!-- Body -->
        <tr>
          <td style="padding:36px 36px 28px;">

            <!-- Category + rating chips -->
            <p style="margin:0 0 20px;line-height:1;">
              <span style="display:inline-block;background:#d97706;color:#ffffff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;padding:4px 12px;border-radius:20px;">${esc(category)}</span>${rating ? `&nbsp;<span style="display:inline-block;background:#fef3c7;color:#92400e;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;">&#9733; ${rating}/10</span>` : ''}
            </p>

            <!-- Title -->
            <h1 style="margin:0 0 16px;font-size:26px;font-weight:700;line-height:1.35;color:#09090b;">${esc(title)}</h1>

            <!-- Gold accent line -->
            <div style="width:48px;height:2px;background:#d97706;margin:0 0 20px;"></div>

            <!-- Excerpt -->
            <p style="margin:0 0 28px;font-size:16px;line-height:1.65;color:#3f3f46;">${esc(excerpt)}</p>

            <!-- CTA Button -->
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background:#d97706;border-radius:8px;">
                  <a href="${esc(articleUrl)}" target="_blank"
                    style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${ctaText} &rarr;</a>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- Divider -->
        <tr>
          <td style="padding:0 36px;">
            <hr style="border:none;border-top:1px solid #e4e4e7;margin:0;">
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 36px;background:#fafafa;text-align:center;">
            <p style="margin:0 0 4px;font-size:13px;color:#71717a;font-weight:600;">Trading365</p>
            <p style="margin:0 0 8px;font-size:12px;color:#a1a1aa;">Expert crypto exchange reviews, comparisons &amp; bonus deals.</p>
            <p style="margin:0;font-size:12px;color:#a1a1aa;">
              <a href="${BASE_URL}" style="color:#d97706;text-decoration:none;">trading365.org</a>
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

export async function createBeehiivDraft(article: ArticleForNewsletter): Promise<{ id: string; url: string }> {
  const apiKey = process.env.BEEHIIV_API_KEY
  const rawId = process.env.BEEHIIV_PUBLICATION_ID
  if (!apiKey || !rawId) throw new Error('Beehiiv not configured')
  // Posts API requires pub_ prefix; subscriptions API works without it
  const publicationId = rawId.startsWith('pub_') ? rawId : `pub_${rawId}`

  const html = buildEmailHtml(article)
  const thumbnailUrl = article.thumbnail
    ? article.thumbnail.startsWith('http') ? article.thumbnail : `${BASE_URL}${article.thumbnail}`
    : undefined

  const body: Record<string, unknown> = {
    title: article.title,
    subtitle: article.excerpt,
    preview_text: article.excerpt,
    status: 'draft',
    body_content: html,
  }
  if (thumbnailUrl) body.thumbnail_image_url = thumbnailUrl

  const res = await fetch(`${BEEHIIV_BASE}/publications/${publicationId}/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  if (!res.ok) {
    const detail = JSON.stringify(data)
    console.error('Beehiiv 400 detail:', detail)
    throw new Error(`Beehiiv ${res.status}: ${detail}`)
  }

  const id: string = data?.data?.id ?? ''
  return { id, url: `https://app.beehiiv.com/posts/${id}` }
}
