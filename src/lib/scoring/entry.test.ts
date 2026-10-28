import { describe, expect, it } from "vitest"
import { entryAtDetail } from "./evaluate"

const MIN = 60_000
const HOUR = 60 * MIN

describe("entry price at the post (ROI Auditor C1)", () => {
  const base = Date.parse("2025-03-01T12:00:00Z")
  const minutes = [
    { t: base - MIN, p: 1.0, v: 0 },
    { t: base, p: 2.0, v: 0 },
    { t: base + MIN, p: 3.0, v: 0 },
  ]
  it("takes the open of the minute candle that contains the post, not its close", () => {
    expect(entryAtDetail(minutes, base + 10_000)).toEqual({ p: 1.0, t: base, m: "exact" })
  })
  it("takes the close when the post is at the end of the minute", () => {
    expect(entryAtDetail(minutes, base + 55_000)).toEqual({ p: 2.0, t: base + MIN, m: "exact" })
  })
  it("labels hourly data nearest_candle, never exact", () => {
    const hours = [
      { t: base - HOUR, p: 1, v: 0 },
      { t: base, p: 2, v: 0 },
      { t: base + HOUR, p: 3, v: 0 },
    ]
    expect(entryAtDetail(hours, base + 5 * MIN)?.m).toBe("nearest_candle")
  })
  it("returns nothing when no candle contains the post", () => {
    expect(entryAtDetail(minutes, base + 10 * MIN)).toBeNull()
    expect(entryAtDetail(minutes, base - 5 * MIN)).toBeNull()
  })
})
