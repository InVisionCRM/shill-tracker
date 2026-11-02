import { describe, expect, it } from "vitest"
import { layoutTimeline, moveIntensity, orderTimelinePoints, pointFill } from "./shill-timeline"

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
    const layout = layoutTimeline(points, { w: 720, h: 180 })
    expect(layout).not.toBeNull()
    expect(layout!.points[0].x).toBeCloseTo((720 + 44 - 12) / 2, 0)
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
})
