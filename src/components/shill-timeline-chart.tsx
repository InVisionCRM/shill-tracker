"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { formatCallDate, formatRoi, formatUsd, roiClass } from "@/lib/format"
import {
  layoutTimeline,
  moveIntensity,
  orderTimelinePoints,
  pointFill,
  type ShillTimelineCall,
} from "@/lib/shill-timeline"

const W = 720
const H = 180
/** Viewbox units a tap needs to land within a point; generous since fingers are wide and points can be close together. */
const HIT_RADIUS = 40

export function ShillTimelineChart({ calls }: { calls: ShillTimelineCall[] }) {
  const router = useRouter()
  const [active, setActive] = useState<number | null>(null)
  const points = useMemo(() => orderTimelinePoints(calls), [calls])
  const layout = useMemo(() => layoutTimeline(points, { w: W, h: H }), [points])

  if (!layout) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        No PulseChain shills yet.
      </div>
    )
  }

  const activePoint = active != null ? layout.points[active] : null

  function nearestIndex(clientX: number, target: SVGSVGElement) {
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
    return { best, dist }
  }

  function openCall(index: number) {
    router.push(`/shills/${layout!.points[index].id}`)
  }

  return (
    <div className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${layout.w} ${layout.h}`}
        className="h-36 w-full select-none sm:h-44"
        role="img"
        aria-label="Shill timeline. Each point is a first call, colored green for gains and red for losses since the shill. Tap a point for details, tap again to open it."
        onPointerMove={(event) => {
          if (event.pointerType !== "mouse") return
          setActive(nearestIndex(event.clientX, event.currentTarget).best)
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") setActive(null)
        }}
        onPointerUp={(event) => {
          const { best, dist } = nearestIndex(event.clientX, event.currentTarget)
          if (dist > HIT_RADIUS) {
            if (event.pointerType !== "mouse") setActive(null)
            return
          }
          if (event.pointerType === "mouse") {
            openCall(best)
            return
          }
          if (active === best) {
            openCall(best)
          } else {
            setActive(best)
          }
        }}
      >
        <line
          x1={layout.pad.l}
          x2={layout.w - layout.pad.r}
          y1={layout.zeroY}
          y2={layout.zeroY}
          className="stroke-border"
          strokeDasharray="3 3"
        />
        {layout.ticks.map((tick) => (
          <text key={tick.label} x={2} y={tick.y + 3} className="fill-muted-foreground text-[9px] font-mono">
            {tick.label}
          </text>
        ))}
        {layout.points.map((point, index) => (
          <circle
            key={point.id}
            cx={point.x}
            cy={point.y}
            r={index === active ? 6.5 : 4.5}
            fill={pointFill(point.move)}
            stroke={point.hollow ? "var(--muted-foreground)" : index === active ? "var(--foreground)" : "none"}
            strokeWidth={point.hollow ? 1.5 : index === active ? 1.5 : 0}
            opacity={point.hollow ? 0.6 : Math.max(0.4, moveIntensity(point.move))}
            className="cursor-pointer"
          />
        ))}
      </svg>
      <div className="flex min-h-5 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {layout.points.length} first call{layout.points.length === 1 ? "" : "s"} over time
        </span>
        {activePoint ? (
          <button
            type="button"
            onClick={() => active != null && openCall(active)}
            className="truncate font-mono text-foreground hover:underline"
          >
            {activePoint.symbol ? `$${activePoint.symbol}` : "—"} · {formatCallDate(activePoint.createdAt)} ·{" "}
            {activePoint.priceAt == null ? "price pending" : formatUsd(activePoint.priceAt)}
            {" → "}
            {activePoint.priceNow == null ? "—" : formatUsd(activePoint.priceNow)} ·{" "}
            <span className={roiClass(activePoint.move)}>
              {activePoint.move == null ? "price pending" : formatRoi(activePoint.move)}
            </span>
          </button>
        ) : (
          <span>Hover or tap a point. Click (or tap again) to open the call.</span>
        )}
      </div>
    </div>
  )
}
