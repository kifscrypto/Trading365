"use client"

// Hidden affiliate partner pixels — fire on every page visit.
// Each iframe loads the partner's referral URL so their tracking cookie
// is set in the visitor's browser.
const PARTNERS = [
  {
    id: "bydfi",
    url: "https://partner.bydfi.com/register?vipCode=KifsCryptoU3&f=websit",
  },
  {
    id: "bitunix",
    url: "https://www.bitunix.com/register?vipCode=VP7Q",
  },
]

export function PartnerPixels() {
  return (
    <div aria-hidden="true" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden", pointerEvents: "none" }}>
      {PARTNERS.map((p) => (
        <iframe
          key={p.id}
          src={p.url}
          title={p.id}
          width={0}
          height={0}
          style={{ display: "none" }}
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="no-referrer-when-downgrade"
        />
      ))}
    </div>
  )
}
