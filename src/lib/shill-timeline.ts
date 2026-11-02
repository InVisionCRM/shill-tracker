import { shillMoveOf } from "./scoring/aggregate"

export type ShillTimelineCall = {
  id: string
  symbol: string | null
  createdAt: Date
  priceAt: number | null
  priceNow: number | null
}

export type ShillTimelinePoint = ShillTimelineCall & {
  move: number | null
}

/** Oldest first, left to right across the chart. Move is always priceNow vs priceAt — never a 7d/24h window. */
export function orderTimelinePoints(calls: ShillTimelineCall[]): ShillTimelinePoint[] {
  return calls
    .map((call) => ({ ...call, move: shillMoveOf(call) }))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
}

/** Compresses big pumps/dumps onto a readable axis: 0 stays 0, doubling (+100%) and halving (-50%) land at the same distance. */
export function moveScale(move: number): number {
  return Math.sign(move) * Math.log1p(Math.abs(move))
}

/** 0 for unpriced calls, ramps to 1 by a +/-300% move so one outlier doesn't wash out the rest. */
export function moveIntensity(move: number | null): number {
  if (move == null || !Number.isFinite(move)) return 0
  return Math.min(1, Math.log1p(Math.abs(move)) / Math.log1p(3))
}

/** Green up, red down, neutral/hollow when there's no price yet. */
export function pointFill(move: number | null): string {
  if (move == null) return "transparent"
  if (move > 0) return "var(--gain)"
  if (move < 0) return "var(--loss)"
  return "var(--muted-foreground)"
}

export const MOVE_TICKS = [-0.9, -0.5, 0, 1, 3, 10]

/** Calendar months, used to pick a "nice" step for the time axis (1, 3, 6, 12, 24, … months apart). */
const MONTH_STEPS = [1, 2, 3, 6, 12, 24, 36, 60, 120, 240]

function utcMonthIndex(ms: number) {
  const date = new Date(ms)
  return date.getUTCFullYear() * 12 + date.getUTCMonth()
}

function monthIndexToMs(index: number) {
  return Date.UTC(Math.floor(index / 12), index % 12, 1)
}

function monthTickLabel(ms: number, stepMonths: number) {
  const date = new Date(ms)
  if (stepMonths >= 12) {
    return new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "UTC" }).format(date)
  }
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }).format(date)
}

export type TimeTick = { t: number; label: string }

/** Month/year ticks that adapt to the span: monthly for a few weeks, yearly (or multi-year) across a long history. */
export function timeTicks(minT: number, maxT: number, targetCount = 5): TimeTick[] {
  if (!Number.isFinite(minT) || !Number.isFinite(maxT)) return []
  if (maxT <= minT) return [{ t: minT, label: monthTickLabel(minT, 1) }]
  const spanMonths = Math.max(1, utcMonthIndex(maxT) - utcMonthIndex(minT))
  const step = MONTH_STEPS.find((candidate) => spanMonths / candidate <= targetCount) ?? MONTH_STEPS[MONTH_STEPS.length - 1]
  const ticks: TimeTick[] = []
  for (let index = Math.ceil(utcMonthIndex(minT) / step) * step; ; index += step) {
    const t = monthIndexToMs(index)
    if (t > maxT) break
    if (t >= minT) ticks.push({ t, label: monthTickLabel(t, step) })
  }
  if (ticks.length === 0) ticks.push({ t: minT, label: monthTickLabel(minT, step) })
  return ticks
}

const DAY_MS = 24 * 60 * 60 * 1000
/** Pixel spread for same-day points so each stays its own tap target instead of one stacked dot. */
const CLUSTER_JITTER_PX = 11

type LayoutPoint = ShillTimelinePoint & { x: number; y: number; hollow: boolean }

export type TimelineLayout = {
  w: number
  h: number
  pad: { l: number; r: number; t: number; b: number }
  points: LayoutPoint[]
  zeroY: number
  ticks: { y: number; label: string }[]
  timeTicks: { x: number; label: string }[]
}

/** Pure pixel layout for the timeline scatter, so it's testable without touching the DOM. */
export function layoutTimeline(
  points: ShillTimelinePoint[],
  opts: { w: number; h: number; pad?: { l: number; r: number; t: number; b: number }; timeTickTarget?: number },
): TimelineLayout | null {
  if (points.length === 0) return null
  const { w, h } = opts
  const pad = opts.pad ?? { l: 46, r: 12, t: 16, b: 24 }
  const innerW = w - pad.l - pad.r
  const innerH = h - pad.t - pad.b
  const minT = points[0].createdAt.getTime()
  const maxT = points[points.length - 1].createdAt.getTime()
  const spanT = Math.max(1, maxT - minT)
  const scaled = points.map((point) => (point.move == null ? 0 : moveScale(point.move)))
  const maxAbs = Math.max(moveScale(1), ...scaled.map((value) => Math.abs(value)))
  const xOf = (t: number) => (points.length === 1 ? pad.l + innerW / 2 : pad.l + ((t - minT) / spanT) * innerW)
  const yOf = (value: number) => pad.t + innerH / 2 - (value / maxAbs) * (innerH / 2)

  const baseX = points.map((point) => xOf(point.createdAt.getTime()))
  const dayGroups = new Map<number, number[]>()
  points.forEach((point, index) => {
    const key = Math.floor(point.createdAt.getTime() / DAY_MS)
    const group = dayGroups.get(key) ?? []
    group.push(index)
    dayGroups.set(key, group)
  })
  const jitteredX = [...baseX]
  for (const group of dayGroups.values()) {
    if (group.length < 2) continue
    group.forEach((pointIndex, slot) => {
      const offset = (slot - (group.length - 1) / 2) * CLUSTER_JITTER_PX
      jitteredX[pointIndex] = Math.min(w - pad.r, Math.max(pad.l, baseX[pointIndex] + offset))
    })
  }

  const laid = points.map((point, index) => ({
    ...point,
    x: jitteredX[index],
    y: yOf(scaled[index]),
    hollow: point.move == null,
  }))
  const zeroY = yOf(0)
  const rawTicks = MOVE_TICKS.filter((pct) => Math.abs(moveScale(pct)) <= maxAbs + 1e-9).map((pct) => ({
    y: yOf(moveScale(pct)),
    label: `${pct > 0 ? "+" : ""}${Math.round(pct * 100)}%`,
  }))
  const xTicks = timeTicks(minT, maxT, opts.timeTickTarget ?? 5).map((tick) => ({
    x: xOf(tick.t),
    label: tick.label,
  }))
  return { w, h, pad, points: laid, zeroY, ticks: declutterTicks(rawTicks), timeTicks: xTicks }
}

/** A big outlier compresses modest moves close to 0% on the log scale; drop labels that would collide, keeping 0%. */
function declutterTicks<T extends { y: number; label: string }>(ticks: T[], minGapPx = 14): T[] {
  const sorted = [...ticks].sort((a, b) => a.y - b.y)
  const kept: T[] = []
  for (const tick of sorted) {
    const prev = kept[kept.length - 1]
    if (prev && Math.abs(tick.y - prev.y) < minGapPx) {
      if (tick.label === "0%") kept[kept.length - 1] = tick
      continue
    }
    kept.push(tick)
  }
  return kept
}
