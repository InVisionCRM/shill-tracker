import { describe, expect, it } from "vitest"
import { aggregateInfluencer, equityCurve, firstCalls } from "./aggregate"
import { evaluateCall, pumpDumpFromMoves } from "./evaluate"

describe("pumpDumpFromMoves", () => {
  it("flags a chart that ran before the post and dumped after", () => {
    const result = pumpDumpFromMoves({
      runup24h: 0.5,
      runup7d: 1.4,
      roi1h: 0.04,
      roi24h: -0.32,
      roi7d: -0.55,
      volumeBefore24h: 100,
      volumeAfter24h: 180,
    })
    expect(result.flag).toBe(true)
    expect(result.score).toBeGreaterThanOrEqual(62)
    expect(result.reasons.length).toBeGreaterThan(0)
  })

  it("does not flag a quiet rally", () => {
    const result = pumpDumpFromMoves({
      runup24h: 0.02,
      runup7d: 0.08,
      roi1h: 0.01,
      roi24h: 0.09,
      roi7d: 0.22,
      volumeBefore24h: 80,
      volumeAfter24h: 90,
    })
    expect(result.flag).toBe(false)
    expect(result.score ?? 0).toBeLessThan(30)
  })

  it("refuses to score without a pre-call window", () => {
    const result = pumpDumpFromMoves({
      runup24h: null,
      runup7d: null,
      roi1h: -0.2,
      roi24h: -0.4,
      roi7d: null,
      volumeBefore24h: null,
      volumeAfter24h: null,
    })
    expect(result.score).toBeNull()
    expect(result.flag).toBe(false)
  })
})

describe("evaluateCall", () => {
  it("reads hourly closes around the post", () => {
    const postedAt = Date.parse("2026-01-15T15:30:00Z")
    const hour = 60 * 60 * 1000
    const start = postedAt - 8 * 24 * hour
    const candles = []
    for (let t = start; t <= postedAt + 8 * 24 * hour; t += hour) {
      const ageHours = (t - postedAt) / hour
      const price = 100 * (1 + ageHours * 0.001)
      candles.push({ t: Math.floor(t / hour) * hour, p: price, v: 10 })
    }
    const result = evaluateCall({
      postedAt,
      now: postedAt + 8 * 24 * hour,
      candles,
    })
    expect(result.priceAt).not.toBeNull()
    expect(result.roi24h).toBeGreaterThan(0)
    expect(result.roi7d).toBeGreaterThan(result.roi24h ?? 0)
    expect(result.price30d).toBeNull()
    expect(result.priceStatus).toBe("ready")
  })
})

describe("aggregateInfluencer", () => {
  const calls = [
    mention("a", 0.2, false, 1, "m-a-1"),
    mention("b", -0.1, true, 2, "m-b-2"),
    mention("a", 0.05, false, 3, "m-a-3"),
  ]

  it("scores the first mention of each asset; shill count is first calls only", () => {
    const stats = aggregateInfluencer(calls)
    expect(stats.shillCount).toBe(2)
    expect(stats.uniqueTickers).toBe(2)
    expect(stats.repeatAssets).toBe(1)
    expect(stats.pricedCount).toBe(2)
    expect(stats.horizons["7d"].portfolioN).toBe(2)
    expect(stats.horizons["7d"].portfolio).toBeCloseTo(100 * (1.2 + 0.9))
    expect(stats.pumpDumpCount).toBe(1)
    expect(stats.credibilityScore).not.toBeNull()
    expect(stats.dumpRiskScore).not.toBeNull()
    expect(stats.bestMentionId).toBe("m-a-1")
    const curve = equityCurve([
      { createdAt: 1, roi: 0.2 },
      { createdAt: 2, roi: -0.1 },
    ])
    expect(curve.positions).toBe(2)
    expect(curve.equity).toBeCloseTo(10)
    expect(curve.deployed).toBe(200)
  })

  it("includes repeat mentions when asked", () => {
    const stats = aggregateInfluencer(calls, "all")
    expect(stats.shillCount).toBe(3)
    expect(stats.repeatAssets).toBe(1)
    expect(stats.pricedCount).toBe(3)
    expect(stats.horizons["7d"].portfolioN).toBe(3)
    expect(stats.horizons["7d"].portfolio).toBeCloseTo(100 * (1.2 + 0.9 + 1.05))
  })

  it("keeps the earlier call when a later mention returns more", () => {
    const rows = [
      mention("a", 0.05, false, 10, "m-early"),
      mention("a", 2, false, 20, "m-late"),
    ]
    expect(firstCalls(rows).map((row) => row.id)).toEqual(["m-early"])
    expect(aggregateInfluencer(rows).bestMentionId).toBe("m-early")
    expect(aggregateInfluencer(rows, "all").bestMentionId).toBe("m-late")
  })

  it("breaks a timestamp tie toward the smaller id", () => {
    const rows = [
      mention("a", 0.1, false, 5, "m-b"),
      mention("a", 0.4, false, 5, "m-a"),
    ]
    expect(firstCalls(rows).map((row) => row.id)).toEqual(["m-a"])
  })
})

function mention(symbol: string, roi7d: number, flag: boolean, createdAt = 1, id?: string) {
  return {
    id: id ?? `m-${symbol}-${createdAt}`,
    assetKey: `cg:${symbol}`,
    symbol,
    createdAt,
    roi1h: null,
    roi24h: null,
    roi7d,
    roi30d: null,
    roiNow: roi7d,
    pumpDumpFlag: flag,
    pumpDumpScore: flag ? 70 : 10,
    priceAt: 1,
  }
}
