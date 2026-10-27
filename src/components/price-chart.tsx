"use client"

import { useMemo, useRef, useState } from "react"
import { formatUsd } from "@/lib/format"

type Point = { t: number; p: number }

export function PriceChart({
  series,
  postedAt,
  entry,
  postText,
}: {
  series: Point[]
  postedAt: string
  entry: number | null
  postText?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const [window, setWindow] = useState({ start: 0, end: 1 })
  const [showPost, setShowPost] = useState(false)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const drag = useRef<{ x: number; start: number; end: number; moved: boolean } | null>(null)
  const pinch = useRef<{ dist: number; start: number; end: number } | null>(null)
  const post = new Date(postedAt).getTime()
  const visible = useMemo(() => sliceSeries(series, window.start, window.end), [series, window])
  const layout = useMemo(() => layoutChart(visible, post), [visible, post])

  if (!layout) {
    return (
      <div className="flex h-72 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        No candle path yet. The price job fills this once a source answers.
      </div>
    )
  }

  const active = hover != null ? layout.points[hover] : null

  function pickIndex(clientX: number, target: SVGSVGElement) {
    const rect = target.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * layout!.w
    let best = 0
    let dist = Infinity
    layout!.points.forEach((point, index) => {
      const delta = Math.abs(point.x - x)
      if (delta < dist) {
        dist = delta
        best = index
      }
    })
    return { best, x, rect }
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${layout.w} ${layout.h}`}
        className="h-72 w-full touch-none sm:h-80"
        role="img"
        aria-label="Price path around the call. Drag to scrub, pinch to zoom, tap the call marker to read the post."
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
          drag.current = { x: event.clientX, start: window.start, end: window.end, moved: false }
        }}
        onPointerMove={(event) => {
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
          const pts = [...pointers.current.values()]
          if (pts.length >= 2) {
            const dist = Math.max(24, Math.abs(pts[0].x - pts[1].x))
            if (!pinch.current) pinch.current = { dist, start: window.start, end: window.end }
            const span = pinch.current.end - pinch.current.start
            const next = Math.min(1, Math.max(0.08, span * (pinch.current.dist / dist)))
            const mid = (pinch.current.start + pinch.current.end) / 2
            setWindow({ start: Math.max(0, mid - next / 2), end: Math.min(1, mid + next / 2) })
            return
          }
          pinch.current = null
          if (!drag.current) return
          const delta = event.clientX - drag.current.x
          if (Math.abs(delta) > 6) drag.current.moved = true
          const rect = event.currentTarget.getBoundingClientRect()
          const span = drag.current.end - drag.current.start
          const shift = (-delta / rect.width) * span
          let start = drag.current.start + shift
          let end = drag.current.end + shift
          if (start < 0) {
            end -= start
            start = 0
          }
          if (end > 1) {
            start -= end - 1
            end = 1
          }
          setWindow({ start: Math.max(0, start), end: Math.min(1, end) })
          const { best } = pickIndex(event.clientX, event.currentTarget)
          setHover(best)
        }}
        onPointerUp={(event) => {
          pointers.current.delete(event.pointerId)
          pinch.current = null
          const moved = drag.current?.moved
          drag.current = null
          if (moved) return
          const { best, x } = pickIndex(event.clientX, event.currentTarget)
          setHover(best)
          if (Math.abs(x - layout.postX) < 28) setShowPost((open) => !open)
        }}
        onPointerCancel={(event) => {
          pointers.current.delete(event.pointerId)
          drag.current = null
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
        <path d={layout.d} fill="none" className="chart-draw stroke-phosphor" strokeWidth="2" />
        <line
          x1={layout.postX}
          x2={layout.postX}
          y1={layout.pad.t}
          y2={layout.h - layout.pad.b}
          className="stroke-foreground/70"
          strokeDasharray="3 3"
        />
        <circle cx={layout.postX} cy={layout.markerY} r="6" className="call-marker fill-phosphor" />
        <text x={layout.postX + 8} y={layout.pad.t + 14} className="fill-foreground text-[11px] font-mono">
          CALL
        </text>
        {layout.ticks.map((tick) => (
          <g key={tick.label}>
            <line x1={layout.pad.l} x2={layout.w - layout.pad.r} y1={tick.y} y2={tick.y} className="stroke-border" />
            <text x={4} y={tick.y + 4} className="fill-muted-foreground text-[10px] font-mono">
              {tick.label}
            </text>
          </g>
        ))}
        {active ? (
          <g>
            <line x1={active.x} x2={active.x} y1={layout.pad.t} y2={layout.h - layout.pad.b} className="stroke-foreground/40" />
            <circle cx={active.x} cy={active.y} r="4" className="fill-phosphor" />
          </g>
        ) : null}
      </svg>
      {showPost && postText ? (
        <p className="mt-2 rounded-lg border bg-card/80 p-3 text-sm leading-6">{postText}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Drag to scrub. Pinch to zoom. Tap the call marker for the post.</span>
        <span className="font-mono text-foreground">
          {active
            ? `${new Date(active.t).toISOString().slice(0, 16).replace("T", " ")} UTC · ${formatUsd(active.p)}`
            : entry != null
              ? `Entry ${formatUsd(entry)}`
              : "Touch the path"}
        </span>
      </div>
    </div>
  )
}

function sliceSeries(series: Point[], start: number, end: number) {
  if (series.length < 2 || (start <= 0 && end >= 1)) return series
  const i0 = Math.max(0, Math.floor(start * (series.length - 1)))
  const i1 = Math.min(series.length, Math.ceil(end * (series.length - 1)) + 1)
  return series.slice(i0, Math.max(i1, i0 + 2))
}

function layoutChart(series: Point[], post: number) {
  if (series.length < 2) return null
  const w = 760
  const h = 320
  const pad = { l: 72, r: 12, t: 16, b: 20 }
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
  const markerY = yOf(series.reduce((best, point) => (Math.abs(point.t - post) < Math.abs(best.t - post) ? point : best)).p)
  return {
    w,
    h,
    pad,
    innerH,
    d,
    points,
    postX,
    markerY,
    ticks,
    pre: preStart < postX ? { x: preStart, w: postX - preStart } : null,
    postRect: postEnd > postX ? { x: postX, w: postEnd - postX } : null,
  }
}
