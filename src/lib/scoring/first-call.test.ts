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

  it("scores only first calls: repeats never move win rate, ROI, or the $100 book", () => {
    const rows = [m("a", "NET", 1, -0.2), m("b", "NET", 5, 3), m("c", "NET", 9, 2), m("d", "HEX", 2, 0.1)]
    const agg = aggregateInfluencer(rows, "first")
    expect(agg.horizons["7d"].portfolioN).toBe(2)
    expect(agg.horizons["7d"].winRate).toBe(0.5)
    expect(agg.horizons["7d"].portfolio).toBeCloseTo(100 * 0.8 + 100 * 1.1)
    expect(agg.shillCount).toBe(2)
    expect(agg.repeatAssets).toBe(1)
  })

  it("never lets a repeat stand in for an unverifiable first call", () => {
    const rows = [m("a", "NET", 1, null, { priceStatus: "unverifiable" }), m("b", "NET", 5, 3)]
    const agg = aggregateInfluencer(rows, "first")
    expect(agg.horizons["7d"].portfolioN).toBe(0)
    expect(agg.bestMentionId).toBeNull()
  })

  it("ignores retro brags when picking the first call", () => {
    const rows = [m("a", "NET", 1, null, { callKind: "retro_brag", priceStatus: "excluded" }), m("b", "NET", 5, 0.4)]
    const agg = aggregateInfluencer(rows, "first")
    expect(agg.horizons["7d"].portfolioN).toBe(1)
    expect(agg.bestMentionId).toBe("b")
  })

  it("keeps one first call when only some rows of a ticker got an asset key", () => {
    const rows = [m("a", "NET", 1, 0.2, { assetKey: "pulsechain:0xabc" }), m("b", "NET", 5, 3)]
    expect(firstCalls(rows).map((row) => row.id)).toEqual(["a"])
  })

  it("re-ranks when an older post is backfilled", () => {
    const live = [m("b", "NET", 5, 3)]
    expect(aggregateInfluencer(live, "first").bestMentionId).toBe("b")
    const backfilled = [...live, m("a", "NET", 1, -0.5)]
    const agg = aggregateInfluencer(backfilled, "first")
    expect(agg.bestMentionId).toBe("a")
    expect(agg.horizons["7d"].portfolioN).toBe(1)
  })

  it("SQL first-call set uses the same identity and order as firstCalls()", () => {
    const text = new PgDialect().sqlToQuery(sql`${firstMentionIds}`).sql
    expect(text).toMatch(/distinct on \(fm\.influencer_id/)
    expect(text.indexOf("upper(fm.symbol)")).toBeLessThan(text.indexOf("fm.asset_key"))
    expect(text).toMatch(/'sym:' \|\| upper\(fm\.symbol\)/)
    expect(text).toMatch(/fm\.call_kind = 'call'/)
    expect(text).toMatch(/fm\.created_at asc, fm\.id asc/)
  })
})
