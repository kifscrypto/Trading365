/**
 * Beehiiv API client + HTML email template builder.
 *
 * Creates newsletter draft posts in Beehiiv from article data.
 * The draft appears in your Beehiiv dashboard for review before sending.
 */

const BASE_URL = 'https://trading365.org'
const BEEHIIV_BASE = 'https://api.beehiiv.com/v2'

export interface ArticleForNewsletter {
  slug: string
  title: string
  excerpt: string
  category: string
  categorySlug: string
  thumbnail?: string | null
  rating?: number | null
  exchangeName?: string | null
  referralLink?: string | null
  bonus?: string | null
}

function esc(str: string | null | undefined): string {
  return (str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildEmailHtml(article: ArticleForNewsletter): string {
  const { slug, title, excerpt, category, categorySlug, thumbnail, rating, exchangeName, referralLink, bonus } = article
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

            <!-- CTA Buttons -->
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

        ${referralLink && exchangeName ? `
        <!-- Exchange direct CTA -->
        <tr>
          <td style="padding:0 36px 36px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#09090b;border-radius:10px;overflow:hidden;">
              <tr>
                <td style="padding:24px 28px;">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#d97706;">Exclusive Offer</p>
                  <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#ffffff;">Skip the article — claim your bonus now</p>
                  ${bonus ? `<p style="margin:0 0 16px;font-size:14px;color:#a1a1aa;">Bonus: <strong style="color:#fbbf24;">${esc(bonus)}</strong></p>` : `<p style="margin:0 0 16px;font-size:14px;color:#a1a1aa;">Sign up via Trading365 for the best available offer.</p>`}
                  <table cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="background:#d97706;border-radius:8px;">
                        <a href="${esc(referralLink)}" target="_blank" rel="noopener noreferrer sponsored"
                          style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">
                          Go to ${esc(exchangeName)} &rarr;
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>` : ''}

        <!-- The Challenge section -->
        <tr>
          <td style="padding:0 36px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:2px solid #d97706;border-radius:10px;overflow:hidden;">
              <tr>
                <td style="padding:22px 24px;">
                  <p style="margin:0 0 2px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#d97706;">Live Trading Journal</p>
                  <p style="margin:0 0 8px;font-size:17px;font-weight:700;color:#09090b;">Can $1,000 Become $1,000,000?</p>
                  <p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#52525b;">Real money. Real trades. No bullshit. We&#39;re putting $1,000 on the line and going all in. Follow the journey live.</p>
                  <table cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="background:#09090b;border-radius:8px;">
                        <a href="https://www.kifscrypto.com/blog/week-1-bydfi-the-challenge-begins" target="_blank" rel="noopener noreferrer"
                          style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">
                          Follow the Journey &rarr;
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Meme Asylum button -->
        <tr>
          <td style="padding:0 36px 36px;text-align:center;">
            <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
              <tr>
                <td style="background:#7c3aed;border-radius:8px;">
                  <a href="https://app.memeasylum.com/" target="_blank" rel="noopener noreferrer"
                    style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">
                    Play The Meme Asylum Experiment.
                  </a>
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
