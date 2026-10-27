import { describe, expect, it } from "vitest"
import {
  pickPulsexPair,
  rankSymbolCandidates,
  tokenAssetState,
  type DirectoryPair,
  type TokenCandidate,
} from "./rank"

function pair(overrides: Partial<DirectoryPair> & Pick<DirectoryPair, "pairAddress">): DirectoryPair {
  return {
    factory: "0x29ea7545def87022badc76323f373ea1e707c523",
    amm: "v2",
    createdBlock: 17_200_000,
    dexId: "pulsex",
    baseAddress: "0xabc",
    baseSymbol: "CAT",
    baseName: "Cat",
    quoteSymbol: "WPLS",
    imageUrl: null,
    liquidityUsd: 1_000,
    missingSince: null,
    ...overrides,
  }
}

function token(overrides: Partial<TokenCandidate> & Pick<TokenCandidate, "address">): TokenCandidate {
  return {
    symbol: "CAT",
    name: "Cat",
    imageUrl: null,
    liquidityUsd: 50_000,
    pairAddress: "0xpair",
    createdBlock: 17_200_000,
    pulsexPairAddress: "0xpair",
    pulsexCreatedBlock: 17_200_000,
    missingSince: null,
    assetState: null,
    ...overrides,
  }
}

describe("PulseChain directory ranking", () => {
  it("ranks the deeper symbol candidate and flags a close second as ambiguous", () => {
    const clear = rankSymbolCandidates([
      token({ address: "0xaaa", liquidityUsd: 10_000 }),
      token({ address: "0xbbb", liquidityUsd: 200_000 }),
    ])
    expect(clear.best?.address).toBe("0xbbb")
    expect(clear.resolutionConfidence).toBe("high")

    const close = rankSymbolCandidates([
      token({ address: "0xaaa", liquidityUsd: 40_000 }),
      token({ address: "0xbbb", liquidityUsd: 30_000 }),
    ])
    expect(close.best?.address).toBe("0xaaa")
    expect(close.resolutionConfidence).toBe("ambiguous")
  })

  it("treats missing_since or zero liquidity as dead, unless one pool is still live", () => {
    expect(
      tokenAssetState([
        { liquidityUsd: 0, missingSince: null },
        { liquidityUsd: 10, missingSince: "2026-10-01T00:00:00Z" },
      ]),
    ).toBe("dead")
    expect(
      tokenAssetState([
        { liquidityUsd: 0, missingSince: null },
        { liquidityUsd: 25, missingSince: null },
      ]),
    ).toBeNull()

    const ranked = rankSymbolCandidates([
      token({ address: "0xdead", liquidityUsd: 0, assetState: "dead", missingSince: "2026-10-01T00:00:00Z" }),
    ])
    expect(ranked.best?.assetState).toBe("dead")
    expect(ranked.confidence).toBe("low")
  })

  it("picks a PulseX v2 pair that existed at the post block", () => {
    const pairs = [
      pair({
        pairAddress: "0xv3",
        amm: "v3",
        dexId: "9mm",
        factory: "0xe50dbdc88e87a2c92984d794bcf3d1d76f619c68",
        liquidityUsd: 9_000_000,
        createdBlock: 17_000_000,
        quoteSymbol: "WPLS",
      }),
      pair({ pairAddress: "0xlate", createdBlock: 20_000_000, liquidityUsd: 80_000, quoteSymbol: "WPLS" }),
      pair({ pairAddress: "0xearly", createdBlock: 17_300_000, liquidityUsd: 40_000, quoteSymbol: "WPLS" }),
      pair({ pairAddress: "0xmeme", createdBlock: 17_100_000, liquidityUsd: 500_000, quoteSymbol: "CAT2" }),
    ]
    expect(pickPulsexPair(pairs, 17_400_000)?.pairAddress).toBe("0xearly")
    expect(pickPulsexPair(pairs, 17_000_000)).toBeNull()
  })
})
