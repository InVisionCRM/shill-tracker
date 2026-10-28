import { describe, expect, it } from "vitest"
import { pickContaining } from "./entry"

const MIN = 60_000

describe("GeckoTerminal entry candle", () => {
  const start = Date.parse("2026-10-20T15:30:00Z")
  const rows = [
    { t: start, open: 1, close: 2 },
    { t: start - 3 * MIN, open: 0.5, close: 0.9 },
  ]
  it("uses the open of the minute that contains the post", () => {
    expect(pickContaining(rows, start + 20_000, MIN)).toEqual({ price: 1, ts: start })
  })
  it("uses the close when the post is in the last 10 seconds of the minute", () => {
    expect(pickContaining(rows, start + 55_000, MIN)).toEqual({ price: 2, ts: start })
  })
  it("falls back to the last traded minute only when it is recent", () => {
    const sparse = [{ t: start - 3 * MIN, open: 0.5, close: 0.9 }]
    expect(pickContaining(sparse, start + 5_000, MIN, 5 * MIN)).toEqual({ price: 0.9, ts: start - 2 * MIN })
    expect(pickContaining(sparse, start + 5_000, MIN)).toBeNull()
    expect(pickContaining(sparse, start + 10 * MIN, MIN, 5 * MIN)).toBeNull()
  })
})
