import { describe, expect, it } from "vitest"
import { collapseMatches, extractMatches, identifyFast } from "./extract"

const PEPE = "0x6982508145454ce325ddbe47a25d4ec3d2311933"
const WIF = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm"

describe("extractMatches", () => {
  it("reads cashtags, names, and contracts", () => {
    const text = `bitcoin looks heavy but $ETH is the tell. Also watching $PEPE ${PEPE} and ${WIF}`
    const matches = extractMatches(text)
    const keys = matches.map((match) => match.matchKey)
    expect(keys).toContain("name:BTC")
    expect(keys).toContain("cashtag:ETH")
    expect(keys).toContain("cashtag:PEPE")
    expect(keys).toContain(`evm:${PEPE}`)
    expect(keys).toContain(`solana:${WIF}`)
  })

  it("ignores dollar amounts and denied words", () => {
    const matches = extractMatches("sending $100 and $1,000. $THE timeline is $NFA.")
    expect(matches).toEqual([])
  })

  it("does not treat ordinary words as tickers", () => {
    const matches = extractMatches("we are near the local high and the link in bio is not a call")
    expect(matches).toEqual([])
  })

  it("does not treat a slice of an EVM address as a Solana mint", () => {
    const mixed = "0x6982508145454Ce325dDbE47a25d4ec3d2311933"
    const matches = extractMatches(`adding the pepe contract ${mixed}`)
    expect(matches.filter((match) => match.matchType === "solana")).toEqual([])
    expect(matches.some((match) => match.matchType === "evm")).toBe(true)
  })

  it("rejects short base58 noise", () => {
    const matches = extractMatches("code So11111111111111111111111111111111111111112 is wrapped sol")
    expect(matches.some((match) => match.matchType === "solana")).toBe(true)
  })
})

describe("collapseMatches", () => {
  it("merges a cashtag and a coin name for the same asset", () => {
    const matches = extractMatches("bitcoin and $BTC, same trade").map(identifyFast)
    const collapsed = collapseMatches(matches)
    expect(collapsed).toHaveLength(1)
    expect(collapsed[0].coingeckoId).toBe("bitcoin")
    expect(collapsed[0].symbol).toBe("BTC")
    expect(collapsed[0].confidence).toBe("high")
  })

  it("keeps the contract when a cashtag repeats it", () => {
    const raw = extractMatches(`aping $PEPE ${PEPE}`).map(identifyFast)
    const withContract = raw.map((match) =>
      match.matchType === "evm"
        ? {
            ...match,
            symbol: "PEPE",
            coingeckoId: "pepe",
            resolutionStatus: "resolved" as const,
            confidence: "high" as const,
          }
        : match,
    )
    const collapsed = collapseMatches(withContract)
    expect(collapsed).toHaveLength(1)
    expect(collapsed[0].contractAddress).toBe(PEPE)
    expect(collapsed[0].symbol).toBe("PEPE")
  })
})
