import { describe, expect, it } from "vitest"
import { aggregateInfluencer, firstCalls, type StatMention } from "./aggregate"
import { sql } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { firstMentionIds } from "./call-rank"

const DAY = 86_400_000
function m(id: string, symbol: string, day: number, roi7d: number | null, extra: Partial<StatMention> = {}): StatMention {
  return {
    id,
    assetKey: null,
    symbol,
    createdAt: Date.UTC(2026, 0, 1) + day * DAY,
    roi1h: null,
    roi24h: null,
    roi7d,
    roi30d: null,
    roiNow: null,
    pumpDumpFlag: false,
    pumpDumpScore: null,
    priceAt: roi7d == null ? null : 1,
    priceNow: roi7d == null ? null : 1 + roi7d,
    callKind: "call",
    resolutionStatus: "resolved",
    priceStatus: roi7d == null ? "pending" : "complete",
    ...extra,
  }
}

describe("first call per (voice, asset)", () => {
  it("lists each ticker once, at its earliest post", () => {
    const rows = [m("c", "NET", 9, 0.5), m("a", "NET", 1, -0.2), m("b", "net", 5, 3), m("d", "HEX", 2, 0.1)]
    const firsts = firstCalls(rows)
    expect(firsts.map((row) => row.id).sort()).toEqual(["a", "d"])
  })

  it("scores only first calls: repeats never move win rate, ROI, or the $100 book (shill-to-now move only)", () => {
    const rows = [m("a", "NET", 1, -0.2), m("b", "NET", 5, 3), m("c", "NET", 9, 2), m("d", "HEX", 2, 0.1)]
    const agg = aggregateInfluencer(rows, "first")
    expect(agg.horizons.now.portfolioN).toBe(2)
    expect(agg.horizons.now.winRate).toBe(0.5)
    expect(agg.horizons.now.portfolio).toBeCloseTo(100 * 0.8 + 100 * 1.1)
    expect(agg.shillCount).toBe(2)
    expect(agg.repeatAssets).toBe(1)
  })

  it("never lets a repeat stand in for an unverifiable first call", () => {
    const rows = [m("a", "NET", 1, null, { priceStatus: "unverifiable" }), m("b", "NET", 5, 3)]
    const agg = aggregateInfluencer(rows, "first")
    expect(agg.horizons.now.portfolioN).toBe(0)
    expect(agg.bestMentionId).toBeNull()
  })

  it("ignores retro brags when picking the first call", () => {
    const rows = [m("a", "NET", 1, null, { callKind: "retro_brag", priceStatus: "excluded" }), m("b", "NET", 5, 0.4)]
    const agg = aggregateInfluencer(rows, "first")
    expect(agg.horizons.now.portfolioN).toBe(1)
    expect(agg.bestMentionId).toBe("b")
  })

  it("keeps one first call per resolved asset once every row of the ticker resolves", () => {
    const rows = [m("a", "NET", 1, 0.2, { assetKey: "pulsechain:0xabc" }), m("b", "NET", 5, 3, { assetKey: "pulsechain:0xabc" })]
    expect(firstCalls(rows).map((row) => row.id)).toEqual(["a"])
  })

  it("re-ranks when an older post is backfilled", () => {
    const live = [m("b", "NET", 5, 3)]
    expect(aggregateInfluencer(live, "first").bestMentionId).toBe("b")
    const backfilled = [...live, m("a", "NET", 1, -0.5)]
    const agg = aggregateInfluencer(backfilled, "first")
    expect(agg.bestMentionId).toBe("a")
    expect(agg.horizons.now.portfolioN).toBe(1)
  })

  it("SQL first-call set uses the same identity and order as firstCalls()", () => {
    const text = new PgDialect().sqlToQuery(sql`${firstMentionIds}`).sql
    expect(text).toMatch(/distinct on \(fm\.influencer_id/)
    expect(text.indexOf("fm.asset_key")).toBeLessThan(text.indexOf("'sym:'"))
    expect(text).toMatch(/'sym:' \|\| upper\(ltrim\(btrim\(fm\.symbol\), '\$'\)\)/)
    expect(text).toMatch(/fm\.call_kind = 'call'/)
    expect(text).toMatch(/fm\.created_at asc, \(fm\.price_at is not null\) desc, \(fm\.resolution_status = 'resolved'\) desc, fm\.id asc/)
  })
})

describe("one % only", () => {
  it("scores (price now - price at shill) / price at shill and ignores stored 7d/24h returns", () => {
    const row = m("a", "NET", 1, 5, { priceAt: 2, priceNow: 1, roi24h: 9 })
    const agg = aggregateInfluencer([row], "first")
    expect(agg.credibilityHorizon).toBe("now")
    expect(agg.horizons.now.medianRoi).toBeCloseTo(-0.5)
  })

  it("does not score a call without both prices", () => {
    const row = m("a", "NET", 1, 0.3, { priceNow: null })
    const agg = aggregateInfluencer([row], "first")
    expect(agg.horizons.now.portfolioN).toBe(0)
    expect(agg.credibilityHorizon).toBeNull()
  })
})

describe("first-call identity (ROI Auditor C2/C3/C4)", () => {
  it("keys by resolved asset: Ethereum HEX never hides PulseChain HEX", () => {
    const rows = [
      m("eth", "HEX", 1, 0.1, { assetKey: "cg:hex" }),
      m("pls", "HEX", 400, -0.5, { assetKey: "ct:pulsechain:0x2b591e99afe9f32eaa6214f7b7629768c40eeb39" }),
    ]
    expect(firstCalls(rows).map((row) => row.id).sort()).toEqual(["eth", "pls"])
  })
  it("strips $ and case for unresolved cashtags", () => {
    const rows = [m("a", "$pls", 1, null, { resolutionStatus: "pending" }), m("b", "PLS", 2, null, { resolutionStatus: "pending" })]
    expect(firstCalls(rows).map((row) => row.id)).toEqual(["a"])
  })
  it("breaks same-time ties toward a priced row, not the smaller id", () => {
    const rows = [m("a", "LDO", 1, null, { assetKey: "k" }), m("b", "LDO", 1, 0.2, { assetKey: "k" })]
    expect(firstCalls(rows).map((row) => row.id)).toEqual(["b"])
  })
})
