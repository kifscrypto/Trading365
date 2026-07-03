import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()

  if (!q || q.length < 2) {
    return Response.json([])
  }

  const term = `%${q}%`

  // Return category_slug (the URL segment: "reviews", "bonuses") aliased as
  // category. The plain "category" column is a display label ("Exchange Reviews")
  // and matches no route, so linking to /category/slug used to 404 to the homepage.
  const results = await sql`
    SELECT slug, title, category_slug AS category, excerpt
    FROM articles
    WHERE published = true
      AND (title ILIKE ${term} OR excerpt ILIKE ${term})
    ORDER BY
      CASE WHEN title ILIKE ${term} THEN 0 ELSE 1 END,
      created_at DESC
    LIMIT 8
  `

  return Response.json(results)
}
