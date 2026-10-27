"use client"

import { useMemo, useState } from "react"
import { formatUsd } from "@/lib/format"

type Point = { t: number; p: number }

export function PriceChart({
  series,
  postedAt,
  entry,
}: {
  series: Point[]
  postedAt: string
  entry: number | null
}) {
  const [hover, setHover] = useState<number | null>(null)
  const post = new Date(postedAt).getTime()
  const layout = useMemo(() => layoutChart(series, post), [series, post])

  if (!layout) {
    return (
      <div className="flex h-72 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        No candle path yet. The price job fills this once a source answers.
      </div>
    )
  }

  const active = hover != null ? layout.points[hover] : null
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${layout.w} ${layout.h}`}
        className="h-80 w-full"
        role="img"
        aria-label="Price path around the call"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const x = ((event.clientX - rect.left) / rect.width) * layout.w
          let best = 0
          let dist = Infinity
          layout.points.forEach((point, index) => {
            const delta = Math.abs(point.x - x)
            if (delta < dist) {
              dist = delta
              best = index
            }
          })
          setHover(best)
        }}
      >
        <rect x="0" y="0" width={layout.w} height={layout.h} fill="transparent" />
        {layout.pre ? (
          <rect x={layout.pre.x} y={layout.pad.t} width={layout.pre.w} height={layout.innerH} className="fill-warn/10" />
        ) : null}
        {layout.postRect ? (
          <rect
            x={layout.postRect.x}
            y={layout.pad.t}
            width={layout.postRect.w}
            height={layout.innerH}
            className="fill-primary/10"
          />
        ) : null}
        <path d={layout.d} fill="none" className="stroke-phosphor" strokeWidth="2" />
        <line
          x1={layout.postX}
          x2={layout.postX}
          y1={layout.pad.t}
          y2={layout.h - layout.pad.b}
          className="stroke-foreground/70"
          strokeDasharray="3 3"
        />
        <text x={layout.postX + 6} y={layout.pad.t + 14} className="fill-foreground text-[11px] font-mono">
          CALL
        </text>
        {layout.ticks.map((tick) => (
          <g key={tick.label}>
            <line
              x1={layout.pad.l}
              x2={layout.w - layout.pad.r}
              y1={tick.y}
              y2={tick.y}
              className="stroke-border"
            />
            <text x={8} y={tick.y + 4} className="fill-muted-foreground text-[10px] font-mono">
              {tick.label}
            </text>
          </g>
        ))}
        {active ? (
          <g>
            <line
              x1={active.x}
              x2={active.x}
              y1={layout.pad.t}
              y2={layout.h - layout.pad.b}
              className="stroke-foreground/40"
            />
            <circle cx={active.x} cy={active.y} r="4" className="fill-phosphor" />
          </g>
        ) : null}
      </svg>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Amber band is the 7 days before the post. Green band is the 7 days after.</span>
        <span className="font-mono text-foreground">
          {active
            ? `${new Date(active.t).toISOString().slice(0, 16).replace("T", " ")} UTC · ${formatUsd(active.p)}`
            : entry != null
              ? `Entry ${formatUsd(entry)}`
              : "Hover the path"}
        </span>
      </div>
    </div>
  )
}

function layoutChart(series: Point[], post: number) {
  if (series.length < 2) return null
  const w = 760
  const h = 320
  const pad = { l: 64, r: 16, t: 16, b: 20 }
  const innerW = w - pad.l - pad.r
  const innerH = h - pad.t - pad.b
  const minT = series[0].t
  const maxT = series[series.length - 1].t
  const minP = Math.min(...series.map((point) => point.p))
  const maxP = Math.max(...series.map((point) => point.p))
  const spanT = Math.max(1, maxT - minT)
  const spanP = Math.max(maxP - minP, maxP * 0.02)
  const xOf = (t: number) => pad.l + ((t - minT) / spanT) * innerW
  const yOf = (p: number) => pad.t + (1 - (p - minP) / spanP) * innerH
  const points = series.map((point) => ({ ...point, x: xOf(point.t), y: yOf(point.p) }))
  const d = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ")
  const postX = xOf(Math.min(maxT, Math.max(minT, post)))
  const preStart = xOf(Math.max(minT, post - 7 * 24 * 60 * 60 * 1000))
  const postEnd = xOf(Math.min(maxT, post + 7 * 24 * 60 * 60 * 1000))
  const ticks = [minP, (minP + maxP) / 2, maxP].map((price) => ({
    y: yOf(price),
    label: formatUsd(price),
  }))
  return {
    w,
    h,
    pad,
    innerH,
    d,
    points,
    postX,
    ticks,
    pre: preStart < postX ? { x: preStart, w: postX - preStart } : null,
    postRect: postEnd > postX ? { x: postX, w: postEnd - postX } : null,
  }
}
