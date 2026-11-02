import { describe, expect, it } from "vitest"
import { layoutTimeline, moveIntensity, orderTimelinePoints, pointFill, timeTicks } from "./shill-timeline"

function call(id: string, iso: string, priceAt: number | null, priceNow: number | null, symbol = "FOO") {
  return { id, symbol, createdAt: new Date(iso), priceAt, priceNow }
}

describe("orderTimelinePoints", () => {
  it("sorts oldest first and computes move as priceNow vs priceAt only", () => {
    const points = orderTimelinePoints([
      call("b", "2026-01-02T00:00:00Z", 2, 4),
      call("a", "2026-01-01T00:00:00Z", 1, 2),
    ])
    expect(points.map((p) => p.id)).toEqual(["a", "b"])
    expect(points[0].move).toBeCloseTo(1)
    expect(points[1].move).toBeCloseTo(1)
  })

  it("leaves move null for unpriced calls instead of falling back to a window roi", () => {
    const [point] = orderTimelinePoints([call("a", "2026-01-01T00:00:00Z", null, null)])
    expect(point.move).toBeNull()
  })
})

describe("moveIntensity", () => {
  it("is 0 for unpriced calls and ramps up with magnitude, capped at 1", () => {
    expect(moveIntensity(null)).toBe(0)
    expect(moveIntensity(0)).toBe(0)
    expect(moveIntensity(3)).toBeCloseTo(1)
    expect(moveIntensity(50)).toBe(1)
    expect(moveIntensity(1)).toBeGreaterThan(0)
    expect(moveIntensity(1)).toBeLessThan(moveIntensity(3))
  })
})

describe("pointFill", () => {
  it("colors by sign and leaves unpriced calls transparent", () => {
    expect(pointFill(null)).toBe("transparent")
    expect(pointFill(0.5)).toBe("var(--gain)")
    expect(pointFill(-0.5)).toBe("var(--loss)")
    expect(pointFill(0)).toBe("var(--muted-foreground)")
  })
})

describe("layoutTimeline", () => {
  it("returns null with no points", () => {
    expect(layoutTimeline([], { w: 720, h: 180 })).toBeNull()
  })

  it("places a single point centered on the time axis", () => {
    const points = orderTimelinePoints([call("a", "2026-01-01T00:00:00Z", 1, 1)])
    const pad = { l: 46, r: 12, t: 16, b: 24 }
    const layout = layoutTimeline(points, { w: 720, h: 180, pad })
    expect(layout).not.toBeNull()
    expect(layout!.points[0].x).toBeCloseTo((720 + pad.l - pad.r) / 2, 0)
  })

  it("orders x left-to-right with time and keeps unpriced points on the zero line", () => {
    const points = orderTimelinePoints([
      call("a", "2026-01-01T00:00:00Z", 1, 2),
      call("b", "2026-01-05T00:00:00Z", null, null),
      call("c", "2026-01-10T00:00:00Z", 1, 0.5),
    ])
    const layout = layoutTimeline(points, { w: 720, h: 180 })!
    const [first, mid, last] = layout.points
    expect(first.x).toBeLessThan(mid.x)
    expect(mid.x).toBeLessThan(last.x)
    expect(mid.hollow).toBe(true)
    expect(mid.y).toBeCloseTo(layout.zeroY)
    expect(first.y).toBeLessThan(layout.zeroY)
    expect(last.y).toBeGreaterThan(layout.zeroY)
  })

  it("always keeps a 0% and +/-100%-ish tick in range even for tiny moves", () => {
    const points = orderTimelinePoints([call("a", "2026-01-01T00:00:00Z", 1, 1.01)])
    const layout = layoutTimeline(points, { w: 720, h: 180 })!
    expect(layout.ticks.some((t) => t.label === "0%")).toBe(true)
    expect(layout.ticks.some((t) => t.label === "+100%")).toBe(true)
  })

  it("spreads same-day points apart so each stays its own tap target", () => {
    const points = orderTimelinePoints([
      call("a", "2026-01-01T09:00:00Z", 1, 2),
      call("b", "2026-01-01T15:00:00Z", 1, 0.5),
      call("c", "2026-06-01T09:00:00Z", 1, 1.5),
    ])
    const layout = layoutTimeline(points, { w: 720, h: 180 })!
    const [a, b, c] = layout.points
    expect(a.x).not.toBeCloseTo(b.x, 1)
    expect(Math.abs(a.x - b.x)).toBeLessThan(30)
    expect(c.x).toBeGreaterThan(a.x)
    expect(c.x).toBeGreaterThan(b.x)
  })

  it("carries month/year time-axis ticks adapted to the span", () => {
    const points = orderTimelinePoints([
      call("a", "2026-01-01T00:00:00Z", 1, 1.2),
      call("b", "2026-02-15T00:00:00Z", 1, 0.8),
    ])
    const layout = layoutTimeline(points, { w: 720, h: 180 })!
    expect(layout.timeTicks.length).toBeGreaterThan(0)
    for (const tick of layout.timeTicks) {
      expect(tick.x).toBeGreaterThanOrEqual(layout.pad.l - 1)
      expect(tick.x).toBeLessThanOrEqual(layout.w - layout.pad.r + 1)
    }
  })
})

describe("timeTicks", () => {
  it("steps monthly across a short span", () => {
    const minT = Date.parse("2026-01-01T00:00:00Z")
    const maxT = Date.parse("2026-03-15T00:00:00Z")
    const ticks = timeTicks(minT, maxT)
    expect(ticks.length).toBeGreaterThanOrEqual(2)
    expect(ticks.every((t) => /^[A-Z][a-z]{2} \d{2}$/.test(t.label))).toBe(true)
  })

  it("steps yearly across a multi-year span and labels with the bare year", () => {
    const minT = Date.parse("2018-01-01T00:00:00Z")
    const maxT = Date.parse("2026-01-01T00:00:00Z")
    const ticks = timeTicks(minT, maxT)
    expect(ticks.length).toBeGreaterThan(0)
    expect(ticks.length).toBeLessThanOrEqual(6)
    expect(ticks.every((t) => /^\d{4}$/.test(t.label))).toBe(true)
  })

  it("returns a single tick when min and max collapse to the same instant", () => {
    const t = Date.parse("2026-05-01T00:00:00Z")
    expect(timeTicks(t, t)).toHaveLength(1)
  })
})
