// Dependency-free inline SVG sparkline. Pure markup (no hooks), so it renders in
// both server and client components. Draws a smoothed area + line for a balance
// series and tints it green/red by net direction over the window.

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  stroke?: string // overrides the auto up/down tint
  className?: string
  strokeWidth?: number
}

export function Sparkline({
  data,
  width = 240,
  height = 56,
  stroke,
  className,
  strokeWidth = 2,
}: SparklineProps) {
  if (!data || data.length < 2) {
    return <svg width={width} height={height} className={className} aria-hidden />
  }

  // Downsample very long series so the SVG path stays light, always keeping the
  // first and last points (so the net up/down tint is accurate).
  const MAX_POINTS = 200
  const series =
    data.length > MAX_POINTS
      ? (() => {
          const stride = Math.ceil(data.length / MAX_POINTS)
          const s = data.filter((_, i) => i % stride === 0)
          if (s[s.length - 1] !== data[data.length - 1]) s.push(data[data.length - 1])
          return s
        })()
      : data

  const min = Math.min(...series)
  const max = Math.max(...series)
  const span = max - min || 1
  const pad = strokeWidth + 1
  const innerH = height - pad * 2
  const stepX = width / (series.length - 1)

  const points = series.map((v, i) => {
    const x = i * stepX
    const y = pad + innerH - ((v - min) / span) * innerH
    return [x, y] as const
  })

  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ")
  const area = `${line} L${width.toFixed(2)},${height} L0,${height} Z`

  const up = series[series.length - 1] >= series[0]
  const color = stroke ?? (up ? "#34d399" : "#f87171")
  // Deterministic, collision-resistant id (no random/useId — renders in both
  // server and client components). Mixes length, extremes and the midpoint.
  const mid = Math.round(series[Math.floor(series.length / 2)])
  const gid = `spark-${up ? "u" : "d"}-${series.length}-${Math.round(min)}-${Math.round(max)}-${mid}`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} stroke="none" />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
