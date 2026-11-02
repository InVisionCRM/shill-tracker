import { describe, expect, it } from "vitest"
import { TRANSIENT } from "./history"

describe("TRANSIENT (transient vs. permanent price failures)", () => {
  it("flags rate limits, timeouts, server errors, and a budget stall as transient", () => {
    expect(TRANSIENT.test("429 from api.geckoterminal.com")).toBe(true)
    expect(TRANSIENT.test("429 cooldown api.geckoterminal.com")).toBe(true)
    expect(TRANSIENT.test("pulsechain rpc timed out or rate limited on 3 call(s)")).toBe(true)
    expect(TRANSIENT.test("503 from api.coingecko.com")).toBe(true)
    expect(TRANSIENT.test("fetch aborted")).toBe(true)
    expect(TRANSIENT.test("Ran out of budget before enough price history was cached this pass.")).toBe(true)
  })
  it("does not flag a genuine no-data answer as transient", () => {
    expect(TRANSIENT.test("no candle within 36h of the post")).toBe(false)
    expect(TRANSIENT.test("cached window has 1 candles")).toBe(false)
    expect(TRANSIENT.test("No PulseX pair for this token. Not estimated.")).toBe(false)
    expect(TRANSIENT.test("GeckoTerminal free OHLCV does not cover this date")).toBe(false)
  })
})
