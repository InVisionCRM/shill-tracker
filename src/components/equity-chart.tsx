"use client"

import { formatUsd } from "@/lib/format"

export function EquityChart({
  points,
}: {
  points: { t: number; equity: number; deployed: number }[]
}) {
  if (points.length < 1) {
    return <p className="text-sm text-muted-foreground">No closed prints for this hold yet.</p>
  }
  const w = 640
  const h = 160
  const pad = 16
  const values = points.map((point) => point.equity)
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const span = Math.max(1, max - min)
  const x = (index: number) => pad + (index / Math.max(1, points.length - 1)) * (w - pad * 2)
  const y = (value: number) => pad + (1 - (value - min) / span) * (h - pad * 2)
  const d = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.equity).toFixed(1)}`)
    .join(" ")
  const zero = y(0)
  const last = points[points.length - 1]
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-40 w-full" role="img" aria-label="Cumulative profit and loss">
        <line x1={pad} x2={w - pad} y1={zero} y2={zero} className="stroke-border" />
        <path d={d} fill="none" className={last.equity >= 0 ? "stroke-gain" : "stroke-loss"} strokeWidth="2.5" />
      </svg>
      <p className="font-mono text-xs text-muted-foreground">
        {points.length} closed prints · deployed {formatUsd(last.deployed)} · P&L {formatUsd(last.equity)}
      </p>
    </div>
  )
}
