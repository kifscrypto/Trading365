import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { sql } from '@/lib/db'

async function checkAuth() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_auth')
}

export async function GET() {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Breakdowns are HUMAN-only (is_bot IS NOT TRUE). Legacy rows predate the bot
    // flag (is_bot NULL) and count as human/unknown, so history is unaffected;
    // only newly-flagged bots are excluded from top pages / sources / geo.
    const [totals, visitors, bots, topPages, topReferrers, utmSources, countries, devices, daily] = await Promise.all([
      sql`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day')   AS today,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')  AS week,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS month,
          COUNT(*) AS total
        FROM page_views
      `,
      // Unique human visitors (distinct daily-hashed id). Only populated for rows
      // recorded after the upgrade — earlier rows have no visitor_id.
      sql`
        SELECT
          COUNT(DISTINCT visitor_id) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day')   AS today,
          COUNT(DISTINCT visitor_id) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')  AS week,
          COUNT(DISTINCT visitor_id) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS month
        FROM page_views
        WHERE is_bot IS NOT TRUE AND visitor_id IS NOT NULL
      `,
      // Bot vs human split (last 30 days). Meaningful only from the upgrade onward.
      sql`
        SELECT
          COUNT(*) FILTER (WHERE is_bot IS TRUE)     AS bots,
          COUNT(*) FILTER (WHERE is_bot IS NOT TRUE) AS humans,
          COUNT(*) FILTER (WHERE user_agent IS NOT NULL) AS classified
        FROM page_views
        WHERE created_at >= NOW() - INTERVAL '30 days'
      `,
      sql`
        SELECT path, COUNT(*) AS views
        FROM page_views
        WHERE created_at >= NOW() - INTERVAL '30 days' AND is_bot IS NOT TRUE
        GROUP BY path ORDER BY views DESC LIMIT 20
      `,
      sql`
        SELECT
          CASE
            WHEN referrer IS NULL OR referrer = '' THEN 'Direct'
            WHEN referrer LIKE '%google%'   THEN 'google.com'
            WHEN referrer LIKE '%twitter%' OR referrer LIKE '%t.co%' THEN 'twitter.com'
            WHEN referrer LIKE '%facebook%' THEN 'facebook.com'
            WHEN referrer LIKE '%reddit%'   THEN 'reddit.com'
            WHEN referrer LIKE '%youtube%'  THEN 'youtube.com'
            WHEN referrer LIKE '%telegram%' THEN 'telegram.org'
            ELSE REGEXP_REPLACE(referrer, '^https?://([^/]+).*', E'\\1')
          END AS source,
          COUNT(*) AS views
        FROM page_views
        WHERE created_at >= NOW() - INTERVAL '30 days' AND is_bot IS NOT TRUE
        GROUP BY source ORDER BY views DESC LIMIT 15
      `,
      sql`
        SELECT
          COALESCE(utm_source, 'none') AS utm_source,
          COALESCE(utm_medium, 'none') AS utm_medium,
          COUNT(*) AS views
        FROM page_views
        WHERE created_at >= NOW() - INTERVAL '30 days'
          AND utm_source IS NOT NULL AND is_bot IS NOT TRUE
        GROUP BY utm_source, utm_medium ORDER BY views DESC LIMIT 15
      `,
      sql`
        SELECT COALESCE(country, 'Unknown') AS country, COUNT(*) AS views
        FROM page_views
        WHERE created_at >= NOW() - INTERVAL '30 days' AND is_bot IS NOT TRUE
        GROUP BY country ORDER BY views DESC LIMIT 15
      `,
      sql`
        SELECT device, COUNT(*) AS views
        FROM page_views
        WHERE created_at >= NOW() - INTERVAL '30 days' AND is_bot IS NOT TRUE
        GROUP BY device ORDER BY views DESC
      `,
      sql`
        SELECT DATE(created_at AT TIME ZONE 'UTC') AS day, COUNT(*) AS views
        FROM page_views
        WHERE created_at >= NOW() - INTERVAL '30 days' AND is_bot IS NOT TRUE
        GROUP BY day ORDER BY day ASC
      `,
    ])

    return NextResponse.json({
      totals: totals[0],
      visitors: visitors[0],
      bots: bots[0],
      topPages, topReferrers, utmSources, countries, devices, daily,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
