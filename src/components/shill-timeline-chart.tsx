"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import { formatCallDate, formatRoi, formatUsd, roiClass } from "@/lib/format"
import { layoutTimeline, moveIntensity, orderTimelinePoints, pointFill, type ShillTimelineCall } from "@/lib/shill-timeline"

/** Used only before the container is first measured; the real viewBox always matches the rendered pixel size. */
const FALLBACK_W = 720
const FALLBACK_H = 224
const DOT_R = 4.5
const ACTIVE_DOT_R = 6.5
const HOLLOW_R = 4
/** >=24px diameter tap target per point, even though the visible dot is much smaller. */
const HIT_R = 13

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (!box) return
      setSize((prev) => (prev.width === box.width && prev.height === box.height ? prev : { width: box.width, height: box.height }))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, size] as const
}

export function ShillTimelineChart({ calls }: { calls: ShillTimelineCall[] }) {
  const router = useRouter()
  const [active, setActive] = useState<number | null>(null)
  const [containerRef, size] = useElementSize<HTMLDivElement>()
  const points = useMemo(() => orderTimelinePoints(calls), [calls])
  const measured = size.width > 0 && size.height > 0
  const w = measured ? size.width : FALLBACK_W
  const h = measured ? size.height : FALLBACK_H
  // Narrower charts can't fit as many month/year labels before they collide.
  const timeTickTarget = w < 420 ? 3 : w < 640 ? 4 : 6
  const layout = useMemo(
    () => (points.length ? layoutTimeline(points, { w, h, timeTickTarget }) : null),
    [points, w, h, timeTickTarget],
  )

  if (!layout) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        No PulseChain shills yet.
      </div>
    )
  }

  const activePoint = active != null ? layout.points[active] : null

  function openCall(index: number) {
    router.push(`/shills/${layout!.points[index].id}`)
  }

  function handlePointerUp(event: React.PointerEvent, index: number) {
    if (event.pointerType === "mouse") {
      openCall(index)
      return
    }
    if (active === index) openCall(index)
    else setActive(index)
  }

  // Tooltip flips off the point near the left/right edges so it never runs off the chart.
  const tooltipAnchor = activePoint ? (activePoint.x < 90 ? "left" : activePoint.x > layout.w - 90 ? "right" : "center") : "center"

  return (
    <div className="flex flex-col gap-2">
      <div ref={containerRef} className="relative h-60 w-full sm:h-52">
        {measured ? (
          <svg
            viewBox={`0 0 ${layout.w} ${layout.h}`}
            className="h-full w-full select-none overflow-visible"
            role="img"
            aria-label="Shill timeline. Each point is a first call, colored green for gains and red for losses since the shill. Tap a point for details, tap again to open it."
          >
            <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
              {layout.timeTicks.map((tick) => (
                <line
                  key={`x-${tick.label}-${tick.x}`}
                  x1={tick.x}
                  x2={tick.x}
                  y1={layout.pad.t}
                  y2={layout.h - layout.pad.b}
                  className="stroke-border/50"
                  strokeWidth={1}
                />
              ))}
              {layout.ticks
                .filter((tick) => tick.label !== "0%")
                .map((tick) => (
                  <line
                    key={`y-${tick.label}`}
                    x1={layout.pad.l}
                    x2={layout.w - layout.pad.r}
                    y1={tick.y}
                    y2={tick.y}
                    className="stroke-border/30"
                    strokeWidth={1}
                  />
                ))}
              <line
                x1={layout.pad.l}
                x2={layout.w - layout.pad.r}
                y1={layout.zeroY}
                y2={layout.zeroY}
                className="stroke-border"
                strokeDasharray="3 3"
              />
            </motion.g>

            {layout.ticks.map((tick) => (
              <text key={tick.label} x={2} y={tick.y + 4} className="fill-muted-foreground font-mono text-[11px]">
                {tick.label}
              </text>
            ))}
            {layout.timeTicks.map((tick) => (
              <text
                key={`xl-${tick.label}-${tick.x}`}
                x={tick.x}
                y={layout.h - 6}
                textAnchor="middle"
                className="fill-muted-foreground font-mono text-[11px]"
              >
                {tick.label}
              </text>
            ))}

            {layout.points.map((point, index) => {
              const isActive = index === active
              const fillOpacity = point.hollow ? 0 : Math.max(0.4, moveIntensity(point.move))
              return (
                <g key={point.id}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={HIT_R}
                    fill="transparent"
                    className="cursor-pointer"
                    tabIndex={0}
                    role="button"
                    aria-label={`${point.symbol ? `$${point.symbol}` : "mention"}, ${formatCallDate(point.createdAt)}, ${point.move == null ? "price pending" : formatRoi(point.move)}`}
                    onPointerEnter={(event) => {
                      if (event.pointerType === "mouse") setActive(index)
                    }}
                    onPointerLeave={(event) => {
                      if (event.pointerType === "mouse" && active === index) setActive(null)
                    }}
                    onFocus={() => setActive(index)}
                    onPointerUp={(event) => handlePointerUp(event, index)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        openCall(index)
                      }
                    }}
                  />
                  <motion.circle
                    cx={point.x}
                    cy={point.y}
                    initial={{ r: 0, opacity: 0 }}
                    animate={{ r: isActive ? ACTIVE_DOT_R : point.hollow ? HOLLOW_R : DOT_R, opacity: 1 }}
                    transition={{ delay: Math.min(index * 0.015, 0.3), type: "spring", stiffness: 320, damping: 22 }}
                    fill={pointFill(point.move)}
                    fillOpacity={fillOpacity}
                    stroke={point.hollow ? "var(--muted-foreground)" : isActive ? "var(--foreground)" : "none"}
                    strokeWidth={point.hollow ? 1.5 : isActive ? 1.5 : 0}
                    strokeOpacity={point.hollow ? 0.6 : 1}
                    pointerEvents="none"
                  />
                </g>
              )
            })}
          </svg>
        ) : null}

        {activePoint ? (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute z-10 w-max max-w-[220px] rounded-lg border bg-popover px-2.5 py-2 text-xs shadow-lg"
            style={{
              left: tooltipAnchor === "left" ? activePoint.x - 8 : tooltipAnchor === "right" ? activePoint.x + 8 : activePoint.x,
              top: Math.max(0, activePoint.y - 10),
              transform:
                tooltipAnchor === "left"
                  ? "translateY(-100%)"
                  : tooltipAnchor === "right"
                    ? "translate(-100%, -100%)"
                    : "translate(-50%, -100%)",
            }}
          >
            <p className="font-mono font-bold text-foreground">{activePoint.symbol ? `$${activePoint.symbol}` : "—"}</p>
            <p className="mt-0.5 text-muted-foreground">{formatCallDate(activePoint.createdAt)}</p>
            <p className="mt-1 flex items-center gap-1 font-mono">
              <span className="text-muted-foreground">
                {activePoint.priceAt == null ? "price pending" : formatUsd(activePoint.priceAt)}
              </span>
              <span className="text-muted-foreground">→</span>
              <span>{activePoint.priceNow == null ? "price pending" : formatUsd(activePoint.priceNow)}</span>
            </p>
            <p className={`mt-0.5 font-mono font-bold ${roiClass(activePoint.move)}`}>
              {activePoint.move == null ? "price pending" : formatRoi(activePoint.move)}
            </p>
          </motion.div>
        ) : null}
      </div>
      <div className="flex min-h-5 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {layout.points.length} first call{layout.points.length === 1 ? "" : "s"} over time
        </span>
        <span>Hover or tap a point. Tap again (or click) to open the call.</span>
      </div>
    </div>
  )
}
