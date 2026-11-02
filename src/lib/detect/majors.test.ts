import { describe, expect, it } from "vitest"
import { identifyFast } from "./extract"
import { countsTowardScore } from "./kinds"
import { isMajorContract, isMajorSymbol, MAJOR_LIQUIDITY_USD } from "./majors"

describe("majors blocklist", () => {
  it("flags the explicitly named majors and stables by symbol", () => {
    for (const symbol of ["BTC", "WBTC", "ETH", "WETH", "PLS", "WPLS", "PLSX", "HEX", "INC", "USDC", "USDT", "DAI", "SOL", "BNB", "XRP", "DOGE", "ADA"]) {
      expect(isMajorSymbol(symbol)).toBe(true)
      expect(isMajorSymbol(symbol.toLowerCase())).toBe(true)
    }
  })

  it("does not flag a real small-cap PulseChain ticker", () => {
    for (const symbol of ["PRVX", "PCOCK", "ATROPA", "DOWN", "BEAR"]) {
      expect(isMajorSymbol(symbol)).toBe(false)
    }
  })

  it("flags the known PulseChain contract addresses for bridged majors, case-insensitively", () => {
    const wpls = "0xa1077a294dde1b09bb078844df40758a5d0f9a27"
    expect(isMajorContract(wpls)).toBe(true)
    expect(isMajorContract(wpls.toUpperCase())).toBe(true)
    expect(isMajorContract("0x0000000000000000000000000000000000dead")).toBe(false)
  })

  it("rejects a bare $BTC cashtag outright, with no chain hint needed", () => {
    const identified = identifyFast({ matchType: "cashtag", rawText: "$BTC", symbol: "BTC", contractAddress: null, matchKey: "cashtag:BTC" })
    expect(identified.resolutionStatus).toBe("rejected")
    expect(countsTowardScore(identified)).toBe(false)
  })

  it("rejects $PLS and $PLSX even with a PulseChain chain bias (the app's own foundational tokens)", () => {
    const pls = identifyFast({ matchType: "cashtag", rawText: "$PLS", symbol: "PLS", contractAddress: null, matchKey: "cashtag:PLS" }, { chainBias: "pulsechain" })
    const plsx = identifyFast({ matchType: "cashtag", rawText: "$PLSX", symbol: "PLSX", contractAddress: null, matchKey: "cashtag:PLSX" }, { chainBias: "pulsechain" })
    expect(pls.resolutionStatus).toBe("rejected")
    expect(plsx.resolutionStatus).toBe("rejected")
  })

  it("rejects a bare contract post of a blocklisted PulseChain token (no symbol at all)", () => {
    const wpls = "0xa1077a294dde1b09bb078844df40758a5d0f9a27"
    const identified = identifyFast({
      matchType: "evm",
      rawText: wpls,
      symbol: null,
      contractAddress: wpls,
      chain: "pulsechain",
      matchKey: `evm:${wpls}`,
    })
    expect(identified.resolutionStatus).toBe("rejected")
  })

  it("leaves a real small-cap ticker alone", () => {
    const identified = identifyFast({ matchType: "cashtag", rawText: "$PRVX", symbol: "PRVX", contractAddress: null, matchKey: "cashtag:PRVX" })
    expect(identified.resolutionStatus).toBe("pending")
  })

  it("picks the liquidity cutoff from the documented snapshot gap", () => {
    // Best-pair liquidity: ATROPA (~$11.8M) and dOWN (~$1.75M) sit above the line; the next pools
    // (~$0.88M, PCOCK ~$0.77M, PRVX ~$0.74M) sit below it. See the comment on MAJOR_LIQUIDITY_USD.
    expect(MAJOR_LIQUIDITY_USD).toBe(1_000_000)
    expect(1_750_000).toBeGreaterThan(MAJOR_LIQUIDITY_USD)
    expect(880_000).toBeLessThan(MAJOR_LIQUIDITY_USD)
  })
})
