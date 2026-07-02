export type AuthorProfile = {
  name: string
  slug: string
  role: string
  bio: string
  expertise: string[]
  linkedIn?: string
}

// Author bylines used across the article DB map to these profiles. Every byline
// value in the content MUST have a matching profile here, otherwise the byline
// link 404s. `authorHref()` is defensive and only links when a profile exists.
export const AUTHORS: AuthorProfile[] = [
  {
    name: "Trading365 Editorial Desk",
    slug: "trading365-editorial-desk",
    role: "Editorial Team",
    bio: "The Trading365 Editorial Desk is our in-house team of active crypto traders and financial writers. Every review, comparison, and guide is written and fact-checked by people who actually use the exchanges we cover — not outsourced content farms. We hold ourselves to a simple standard: if we wouldn't trade on it, we won't recommend it.",
    expertise: ["Crypto Exchange Reviews", "Derivatives & Leverage Trading", "No-KYC Platforms", "Fee Optimisation", "Crypto Bonuses & Promotions"],
  },
  {
    name: "Trader From Hell",
    slug: "trader-from-hell",
    role: "Markets & Derivatives Writer",
    bio: "Trader From Hell is a full-time derivatives trader and long-time Trading365 contributor covering leverage, no-KYC platforms, and exchange mechanics from a hands-on perspective. Every take is grounded in real positions on the platforms reviewed, with a focus on fees, execution, and the details that actually move a P&L.",
    expertise: ["Futures & Perpetuals", "High-Leverage Trading", "Exchange Fees & Execution", "No-KYC Platforms", "Risk Management"],
  },
  {
    name: "Trading365 Team",
    slug: "trading365-team",
    role: "Editorial Team",
    bio: "The Trading365 editorial team consists of active crypto traders and financial writers with hands-on experience across the exchanges we review. Every review, comparison, and guide is written and verified by people who actually use these platforms — not outsourced content farms. We hold ourselves to a simple standard: if we wouldn't trade on it, we won't recommend it.",
    expertise: ["Crypto Exchange Reviews", "Derivatives & Leverage Trading", "No-KYC Platforms", "Fee Optimisation", "Crypto Bonuses & Promotions"],
  },
]

/** Slugify a byline name the same way the article template historically did. */
export function authorSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-")
}

export function getAuthorBySlug(slug: string): AuthorProfile | undefined {
  return AUTHORS.find((a) => a.slug === slug)
}

export function getAuthorByName(name: string): AuthorProfile | undefined {
  const slug = authorSlug(name)
  return AUTHORS.find((a) => a.slug === slug || a.name === name)
}

/** Return the internal author URL only if a matching profile exists, else null. */
export function authorHref(name: string): string | null {
  const profile = getAuthorByName(name)
  return profile ? `/authors/${profile.slug}` : null
}
