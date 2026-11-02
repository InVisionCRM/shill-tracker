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

type LayoutPoint = ShillTimelinePoint & { x: number; y: number; hollow: boolean }

export type TimelineLayout = {
  w: number
  h: number
  pad: { l: number; r: number; t: number; b: number }
  points: LayoutPoint[]
  zeroY: number
  ticks: { y: number; label: string }[]
}

/** Pure pixel layout for the timeline scatter, so it's testable without touching the DOM. */
export function layoutTimeline(
  points: ShillTimelinePoint[],
  opts: { w: number; h: number; pad?: { l: number; r: number; t: number; b: number } },
): TimelineLayout | null {
  if (points.length === 0) return null
  const { w, h } = opts
  const pad = opts.pad ?? { l: 44, r: 12, t: 14, b: 8 }
  const innerW = w - pad.l - pad.r
  const innerH = h - pad.t - pad.b
  const minT = points[0].createdAt.getTime()
  const maxT = points[points.length - 1].createdAt.getTime()
  const spanT = Math.max(1, maxT - minT)
  const scaled = points.map((point) => (point.move == null ? 0 : moveScale(point.move)))
  const maxAbs = Math.max(moveScale(1), ...scaled.map((value) => Math.abs(value)))
  const xOf = (t: number) => (points.length === 1 ? pad.l + innerW / 2 : pad.l + ((t - minT) / spanT) * innerW)
  const yOf = (value: number) => pad.t + innerH / 2 - (value / maxAbs) * (innerH / 2)
  const laid = points.map((point, index) => ({
    ...point,
    x: xOf(point.createdAt.getTime()),
    y: yOf(scaled[index]),
    hollow: point.move == null,
  }))
  const zeroY = yOf(0)
  const ticks = MOVE_TICKS.filter((pct) => Math.abs(moveScale(pct)) <= maxAbs + 1e-9).map((pct) => ({
    y: yOf(moveScale(pct)),
    label: `${pct > 0 ? "+" : ""}${Math.round(pct * 100)}%`,
  }))
  return { w, h, pad, points: laid, zeroY, ticks }
}
