/**
 * Exchange logo tile. Renders the brand logo from `logo` (a /public path) on a
 * normalizing white tile so disparate logos look uniform; falls back to a clean
 * branded monogram when an exchange has no logo file yet. Drop a new logo at
 * public/images/exchanges/<slug>.(png|ico) and set `logo` on the exchange to use it.
 */
interface Props {
  name: string
  logo?: string
  size?: number
  className?: string
}

export function ExchangeLogo({ name, logo, size = 44, className = "" }: Props) {
  const style = { width: size, height: size }
  if (logo) {
    return (
      <span
        style={style}
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white ${className}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo}
          alt={`${name} logo`}
          width={size}
          height={size}
          loading="lazy"
          className="h-full w-full object-contain p-1.5"
        />
      </span>
    )
  }
  const initials = name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase()
  return (
    <span
      style={style}
      className={`inline-flex shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 font-bold text-primary ${className}`}
    >
      <span style={{ fontSize: Math.round(size * 0.34) }}>{initials}</span>
    </span>
  )
}
