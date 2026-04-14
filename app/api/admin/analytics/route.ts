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
    const [totals, topPages, topReferrers, utmSources, countries, devices, daily] = await Promise.all([
      sql`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day')   AS today,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')  AS week,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS month,
          COUNT(*) AS total
        FROM page_views
      `,
      sql`
        SELECT path, COUNT(*) AS views
        FROM page_views
        WHERE created_at >= NOW() - INTERVAL '30 days'
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
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY source ORDER BY views DESC LIMIT 15
      `,
      sql`
        SELECT
          COALESCE(utm_source, 'none') AS utm_source,
          COALESCE(utm_medium, 'none') AS utm_medium,
          COUNT(*) AS views
        FROM page_views
        WHERE created_at >= NOW() - INTERVAL '30 days'
          AND utm_source IS NOT NULL
        GROUP BY utm_source, utm_medium ORDER BY views DESC LIMIT 15
      `,
      sql`
        SELECT COALESCE(country, 'Unknown') AS country, COUNT(*) AS views
        FROM page_views
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY country ORDER BY views DESC LIMIT 15
      `,
      sql`
        SELECT device, COUNT(*) AS views
        FROM page_views
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY device ORDER BY views DESC
      `,
      sql`
        SELECT DATE(created_at AT TIME ZONE 'UTC') AS day, COUNT(*) AS views
        FROM page_views
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY day ORDER BY day ASC
      `,
    ])

    return NextResponse.json({ totals: totals[0], topPages, topReferrers, utmSources, countries, devices, daily })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
