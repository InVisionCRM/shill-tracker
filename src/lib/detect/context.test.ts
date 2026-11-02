import { describe, expect, it } from "vitest"
import { classifyPost, hasChainLink, SHILL_LANGUAGE } from "./context"
import { identifyFast } from "./extract"
import { countsTowardScore } from "./kinds"

describe("classifyPost: junk list of cashtags", () => {
  it("does not call a bare roll call of 4+ tickers with no shill language", () => {
    const { kind, reason } = classifyPost("$PLS $PLSX $HEX $INC $PRVX")
    expect(kind).toBe("list")
    expect(reason).toMatch(/roll call/)
  })

  it("still calls a 4+ ticker post once real shill language shows up", () => {
    expect(classifyPost("$PLS $PLSX $HEX $INC $PRVX — loading more, this chart is ready to rip").kind).toBe("call")
  })

  it("still calls a 4+ ticker post that carries a dex link", () => {
    expect(
      classifyPost("$PLS $PLSX $HEX $INC $PRVX dexscreener.com/pulsechain/0xabc123").kind,
    ).toBe("call")
  })

  it("leaves a short mention (under 4 tickers) alone even with no shill language", () => {
    expect(classifyPost("$PLS $PLSX $HEX").kind).toBe("call")
  })

  it("a junk list's call_kind excludes every ticker in it from score, even a real small-cap like PRVX", () => {
    const { kind } = classifyPost("$PLS $PLSX $HEX $INC $PRVX")
    const prvx = identifyFast(
      { matchType: "cashtag", rawText: "$PRVX", symbol: "PRVX", contractAddress: null, matchKey: "cashtag:PRVX" },
      { chainBias: "pulsechain" },
    )
    // This mirrors ingest.ts: every match in a post gets the post's one call_kind.
    expect(prvx.resolutionStatus).toBe("pending")
    expect(countsTowardScore({ ...prvx, callKind: kind })).toBe(false)
  })
})

describe("SHILL_LANGUAGE and link detection", () => {
  it("matches the example words from the shill-language list", () => {
    for (const phrase of ["buy the dip", "loading more", "aping in", "gem of the year", "send it", "to x100", "still accumulating", "check the chart", "good entry"]) {
      expect(SHILL_LANGUAGE.test(phrase)).toBe(true)
    }
  })

  it("does not flag plain text with no shill language", () => {
    expect(SHILL_LANGUAGE.test("just checking the weather today")).toBe(false)
  })

  it("recognizes DexScreener/PulseX/scan links", () => {
    expect(hasChainLink("dexscreener.com/pulsechain/0xabc")).toBe(true)
    expect(hasChainLink("scan.pulsechain.com/address/0xabc")).toBe(true)
    expect(hasChainLink("pulsex.com/swap")).toBe(true)
    expect(hasChainLink("just talking about the chart")).toBe(false)
  })
})

describe("confidence: contract/link beats a bare cashtag", () => {
  it("gives a bare cashtag with no evidence low confidence", () => {
    const identified = identifyFast({ matchType: "cashtag", rawText: "$PRVX", symbol: "PRVX", contractAddress: null, matchKey: "cashtag:PRVX" })
    expect(identified.confidence).toBe("low")
  })

  it("raises confidence when shill language is in the post", () => {
    const identified = identifyFast(
      { matchType: "cashtag", rawText: "$PRVX", symbol: "PRVX", contractAddress: null, matchKey: "cashtag:PRVX" },
      { text: "loading more $PRVX here" },
    )
    expect(identified.confidence).toBe("medium")
  })

  it("raises confidence for a bare contract address over a bare cashtag", () => {
    const address = "0xf6f8db0aba00007681f8faf16a0fda1c9b030b11"
    const identified = identifyFast({
      matchType: "evm",
      rawText: address,
      symbol: null,
      contractAddress: address,
      chain: "pulsechain",
      matchKey: `evm:${address}`,
    })
    expect(identified.confidence).toBe("medium")
  })
})
