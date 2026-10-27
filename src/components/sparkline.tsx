export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) {
    return <span className={`block h-8 w-full ${className ?? ""}`} />
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(max - min, 0.0001)
  const w = 120
  const h = 36
  const d = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * w
      const y = h - ((value - min) / span) * (h - 4) - 2
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
  const up = values[values.length - 1] >= values[0]
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`h-8 w-full ${className ?? ""}`} aria-hidden>
      <path d={d} fill="none" className={up ? "stroke-gain" : "stroke-loss"} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}
