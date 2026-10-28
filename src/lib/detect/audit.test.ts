import { describe, expect, it } from "vitest"
import { classifyPost } from "./context"
import { collapseMatches, extractMatches, identifyFast } from "./extract"
import { linkNearbyPosts, linkSamePost } from "./link"
import { countsTowardScore } from "./kinds"
import { applyAssetState, evaluateCall } from "../scoring/evaluate"
import { tokenPriceFromReserves, USDC, WPLS } from "../prices/pulsex"

const HOUR = 60 * 60 * 1000

const POSTS = {
  priors: {
    id: "2115111360505999495",
    text: "robinhood:0xedbf91223639800bcd5756815caf908df3b890be",
  },
  retro: {
    id: "2114034079276360057",
    text: `2021
$Shib had a damn near 99% correction and stayed still for 4 months……. Then 1,000,000x

80,000x FROM MY CALL

2023/4
- #Teddybear rugs, comes back

3,000x FROM MY CALL

- $PDAI massive 99% correction

6,000x FROM MY CALL`,
  },
  solana: {
    id: "2113287525385093608",
    text: "I’ve got 530 subscribers, never dumped on them, tons of positive reviews, making money, teaching them the game, and you guys are still following people like this on Solana.\n\nYou aren’t making money from him. Everyone including Pump dot Fun uses you, thru him for exit liquidity",
  },
  maxi: {
    id: "1752405414258655673",
    text: "I wonder why $HEX maxi @ccfxstudios didn’t want to debate $PDAI in front of 1300 viewers. Yall gotta do better than that.",
    at: Date.parse("2024-01-30T18:56:23Z"),
  },
  bear: {
    id: "2059671552996651295",
    text: `@PLSBernie You sure about that

$Pdai 6,000x
$Bear- 3,000x
$Ptgc- 2500x

All on #Pulsechain with liquidity at the tops. Don't mistake your broke portfolio with mine`,
    at: Date.parse("2026-05-27T16:22:19Z"),
  },
  hex2021: {
    id: "1426030969845395464",
    text: `Best way to get $pulse if you didn’t sacrifice.
1. Buy $hex now! It’s breaking out for new ATH
2. Hold it minimum till snapshot
3. Bc you feel good about making gains while everything else goes down, you’ll likely Hodl it.
4. Swap $Phex for $pls at launch,
5. Not financial advice`,
    at: Date.parse("2021-08-13T04:00:52Z"),
  },
}

function identified(text: string, postedAt?: number, chainBias: string | null = "pulsechain") {
  const kind = classifyPost(text)
  return collapseMatches(
    linkSamePost(extractMatches(text)).map((match) => ({
      ...identifyFast(match, { chainBias, text, postedAt }),
      callKind: kind.kind,
    })),
  )
}

describe("audit fixtures", () => {
  it("keeps a robinhood:0x prefix and links it to a nearby $PRIORS", () => {
    const [contract] = extractMatches(POSTS.priors.text)
    expect(contract.rawText).toBe(POSTS.priors.text)
    expect(contract.chain).toBe("robinhood")
    expect(contract.contractAddress).toBe("0xedbf91223639800bcd5756815caf908df3b890be")
    expect(contract.matchType).toBe("evm")

    const nearby = linkNearbyPosts([
      {
        id: "priors-cashtag",
        createdAt: Date.parse("2026-10-27T12:00:00Z"),
        matches: extractMatches("$PRIORS is the one"),
      },
      {
        id: POSTS.priors.id,
        createdAt: Date.parse("2026-10-27T16:00:19Z"),
        matches: extractMatches(POSTS.priors.text),
      },
    ])
    const linked = nearby.find((post) => post.id === POSTS.priors.id)?.matches[0]
    const cashtag = nearby.find((post) => post.id === "priors-cashtag")?.matches[0]
    expect(linked?.symbol).toBe("PRIORS")
    expect(cashtag?.contractAddress).toBe("0xedbf91223639800bcd5756815caf908df3b890be")
    expect(cashtag?.chain).toBe("robinhood")
  })

  it("extracts ticker hashtags and ignores #Pulsechain", () => {
    const matches = extractMatches("#BCAT #Teddybear #shibzen #streamerinu #Pulsechain #crypto")
    const symbols = matches.map((match) => match.symbol).sort()
    expect(symbols).toEqual(["BCAT", "SHIBZEN", "STREAMERINU", "TEDDYBEAR"])
    expect(matches.every((match) => match.matchType === "hashtag")).toBe(true)
  })

  it("drops chain-name false positives and a HEX maxi", () => {
    expect(extractMatches(POSTS.solana.text)).toEqual([])
    expect(extractMatches("THE SHIB OF SOLANA")).toEqual([])
    expect(extractMatches("spending eth on fees")).toEqual([])
    expect(extractMatches("Buy solana now").map((match) => match.symbol)).toEqual(["SOL"])

    const maxi = identified(POSTS.maxi.text, POSTS.maxi.at)
    expect(maxi.map((match) => match.symbol)).toEqual(["PDAI"])
    expect(maxi[0].callKind).toBe("commentary")
    expect(countsTowardScore(maxi[0])).toBe(false)
  })

  it("keeps typos as their own symbols and leaves them out of the score until they resolve", () => {
    const matches = extractMatches("$SHJB and $WELSCH")
    expect(matches.map((match) => match.symbol).sort()).toEqual(["SHJB", "WELSCH"])
    expect(countsTowardScore({ callKind: "call", resolutionStatus: "unresolved" })).toBe(false)
  })

  it("classifies the retro brag and resolves #Teddybear and $PDAI on PulseChain", () => {
    expect(classifyPost(POSTS.retro.text).kind).toBe("retro_brag")
    const matches = identified(POSTS.retro.text, Date.parse("2026-10-24T16:39:36Z"))
    expect(matches.every((match) => match.callKind === "retro_brag")).toBe(true)
    expect(countsTowardScore(matches[0])).toBe(false)
    const teddy = matches.find((match) => match.rawText.toLowerCase().includes("teddy"))
    const pdai = matches.find((match) => match.symbol === "PDAI")
    expect(teddy?.symbol).toBe("BEAR")
    expect(teddy?.contractAddress).toBe("0xd6c31ba0754c4383a41c0e9df042c62b5e918f6d")
    expect(pdai?.contractAddress).toBe("0x6b175474e89094c44da98b954eedeac495271d0f")
    expect(pdai?.chain).toBe("pulsechain")
    expect(pdai?.assetName).toBe("DAI")
  })

  it("maps $BEAR in a #Pulsechain post to TEDDY BEAR and marks the post a recap", () => {
    const matches = identified(POSTS.bear.text, POSTS.bear.at, null)
    expect(classifyPost(POSTS.bear.text).kind).toBe("retro_brag")
    const bear = matches.find((match) => match.symbol === "BEAR")
    expect(bear?.assetName).toBe("TEDDY BEAR")
    expect(bear?.contractAddress).toBe("0xd6c31ba0754c4383a41c0e9df042c62b5e918f6d")
    expect(bear?.chain).toBe("pulsechain")
    expect(matches.find((match) => match.symbol === "PDAI")?.contractAddress).toBe(
      "0x6b175474e89094c44da98b954eedeac495271d0f",
    )
    expect(matches.find((match) => match.symbol === "PTGC")?.resolutionStatus).toBe("pending")
  })

  it("identifies 2021 HEX as Ethereum, then rejects it (PulseChain tickers only: Ethereum HEX never scores)", () => {
    const matches = identified(POSTS.hex2021.text, POSTS.hex2021.at, null)
    const hex = matches.find((match) => match.symbol === "HEX")
    expect(hex?.chain).toBe("ethereum")
    expect(hex?.coingeckoId).toBe("hex")
    expect(hex?.contractAddress).toBe("0x2b591e99afe9f32eaa6214f7b7629768c40eeb39")
    expect(hex?.callKind).toBe("call")
    expect(hex?.resolutionStatus).toBe("rejected")
    expect(countsTowardScore(hex!)).toBe(false)
    expect(classifyPost(POSTS.hex2021.text).kind).toBe("call")
  })

  it("no longer curates Robinhood $NET: it is just a pending cashtag, same as any other", () => {
    const [match] = identified("$NET on robinhood", Date.parse("2026-01-01T00:00:00Z"), null)
    expect(match.chain).toBeNull()
    expect(match.contractAddress).toBeNull()
    expect(match.resolutionStatus).toBe("pending")
  })
})

describe("dead assets and reserve math", () => {
  it("scores a dead call at -100% from a real entry and unverifiable without one", () => {
    const postedAt = Date.parse("2024-06-01T00:00:00Z")
    const withEntry = applyAssetState(
      evaluateCall({
        postedAt,
        now: postedAt + 40 * 24 * HOUR,
        candles: [
          { t: postedAt - HOUR, p: 1, v: 0 },
          { t: postedAt, p: 1.1, v: 0 },
          { t: postedAt + HOUR, p: 1.2, v: 0 },
        ],
      }),
      "dead",
    )
    expect(withEntry.priceAt).toBe(1)
    expect(withEntry.roiNow).toBe(-1)
    expect(withEntry.priceNow).toBe(0)

    const without = applyAssetState(
      evaluateCall({ postedAt, now: postedAt + HOUR, candles: [] }),
      "dead",
    )
    expect(without.priceStatus).toBe("unverifiable")
    expect(without.roiNow).toBeNull()
    expect(countsTowardScore({ callKind: "call", priceStatus: "unverifiable", resolutionStatus: "resolved" })).toBe(
      false,
    )
  })

  it("prices WPLS from USDC reserves without estimating", () => {
    const price = tokenPriceFromReserves({
      target: WPLS,
      token0: USDC,
      token1: WPLS,
      reserve0: BigInt(100) * BigInt(10) ** BigInt(6),
      reserve1: BigInt(1000) * BigInt(10) ** BigInt(18),
      decimals0: 6,
      decimals1: 18,
      quoteUsd: 1,
    })
    expect(price).toBeCloseTo(0.1, 8)
  })
})
