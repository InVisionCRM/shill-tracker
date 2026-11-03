import { describe, expect, it } from "vitest"
import { barTime, chartTimeframe, isChartToken, parseOhlcv } from "./chart-candles"

describe("call chart candles", () => {
  it("parses GeckoTerminal OHLCV newest-first into ascending, valid, unique bars", () => {
    const candles = parseOhlcv([
      [200, 2, 3, 1, 2.5, 10],
      [100, 1, 2, 0.5, 1.5, 10],
      [100, 1, 2, 0.5, 1.5, 10],
      [300, 0, 0, 0, 0, 0],
      ["x"],
    ])
    expect(candles.map((c) => c.time)).toEqual([100, 200])
    expect(candles[1]).toEqual({ time: 200, open: 2, high: 3, low: 1, close: 2.5 })
    expect(parseOhlcv(null)).toEqual([])
  })
  it("picks hour bars for fresh shills and day bars for older ones", () => {
    const now = Date.UTC(2026, 10, 2)
    expect(chartTimeframe(now - 5 * 86400000, now)).toBe("hour")
    expect(chartTimeframe(now - 60 * 86400000, now)).toBe("day")
  })
  it("snaps the shill to the bar that contains it", () => {
    const ms = Date.UTC(2026, 8, 7, 23, 19, 52)
    expect(barTime(ms, "day")).toBe(Date.UTC(2026, 8, 7) / 1000)
    expect(barTime(ms, "hour")).toBe(Date.UTC(2026, 8, 7, 23) / 1000)
  })
  it("only accepts 0x addresses", () => {
    expect(isChartToken("0x16eccfdbb4ee1a85a33f3a9b21175cd7ae753db4")).toBe(true)
    expect(isChartToken("PLS")).toBe(false)
    expect(isChartToken(null)).toBe(false)
  })
})
