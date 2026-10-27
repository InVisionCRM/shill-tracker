export function Gauge({
  label,
  value,
  tone,
  caption,
}: {
  label: string
  value: number | null
  tone: "gain" | "loss" | "warn"
  caption: string
}) {
  const shown = value ?? 0
  const radius = 36
  const circ = 2 * Math.PI * radius
  const dash = (Math.max(0, Math.min(100, shown)) / 100) * circ
  const stroke = tone === "gain" ? "var(--gain)" : tone === "loss" ? "var(--loss)" : "var(--warn)"
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 96 96" className="size-24" role="img" aria-label={`${label} ${value ?? "unavailable"}`}>
        <circle cx="48" cy="48" r={radius} fill="none" stroke="var(--border)" strokeWidth="8" />
        <circle
          cx="48"
          cy="48"
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          transform="rotate(-90 48 48)"
        />
        <text x="48" y="52" textAnchor="middle" className="fill-foreground text-lg font-mono">
          {value == null ? "—" : Math.round(value)}
        </text>
      </svg>
      <div className="min-w-0">
        <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">{label}</p>
        <p className="mt-1 text-sm leading-5 text-foreground">{caption}</p>
      </div>
    </div>
  )
}
