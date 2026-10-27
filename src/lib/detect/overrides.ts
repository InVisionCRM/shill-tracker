import { PULSE_FORK_MS, contextFromText } from "./context"
import { dexUrl, pulseAsset } from "./pulse"

export type CuratedAsset = {
  symbol: string
  assetName: string
  chain: string
  contractAddress: string
  pairAddress: string | null
  coingeckoId: string | null
  geckoterminalNetwork: string | null
  dexscreenerUrl: string | null
  confidence: "high" | "medium" | "low"
  resolutionConfidence: "high" | "medium" | "low" | "ambiguous"
  confidenceReason: string
}

/** GeckoTerminal calls this token DAI. The cashtag in the archive is $PDAI. */
export const PDAI_CONTRACT = "0x6b175474e89094c44da98b954eedeac495271d0f"
export const PDAI_PAIR = "0xfc64556faa683e6087f425819c7ca3c558e13ac1"

/** $BEAR on PulseChain. GeckoTerminal swaps this token's name and symbol. */
export const TEDDY_CONTRACT = "0xd6c31ba0754c4383a41c0e9df042c62b5e918f6d"
export const TEDDY_PAIR = "0x24c4d0532cddae3b0b8935196f2b91e68d6b85ed"

/** Crypto NET on Robinhood. A Cloudflare stock token shares the ticker. */
export const NET_CONTRACT = "0xca9c78dd337a67f6e0077f65f5e9218719d30edf"
export const NET_PAIR = "0x99e70a5b06215e5d2f3bec773b4f59c008fc1673"

const HEX_CONTRACT = "0x2b591e99afe9f32eaa6214f7b7629768c40eeb39"

export function lookupOverride(input: {
  symbol: string | null | undefined
  text?: string | null
  postedAt?: number | Date | null
  chainHint?: string | null
  chainBias?: string | null
}): CuratedAsset | null {
  if (!input.symbol) return null
  const symbol = input.symbol.toUpperCase()
  const text = input.text ?? ""
  const context = contextFromText(text)
  const hint = input.chainHint ?? context.chainHint
  const pulse = hint === "pulsechain" || input.chainBias === "pulsechain"
  const postedAt =
    input.postedAt == null
      ? null
      : input.postedAt instanceof Date
        ? input.postedAt.getTime()
        : input.postedAt

  if (symbol === "PDAI") {
    return {
      symbol: "PDAI",
      assetName: "DAI",
      chain: "pulsechain",
      contractAddress: PDAI_CONTRACT,
      pairAddress: PDAI_PAIR,
      coingeckoId: null,
      geckoterminalNetwork: "pulsechain",
      dexscreenerUrl: dexUrl(PDAI_PAIR),
      confidence: "high",
      resolutionConfidence: "high",
      confidenceReason:
        "$PDAI is the PulseChain DAI at 0x6b175474e89094c44da98b954eedeac495271d0f. GeckoTerminal's symbol for it is DAI, not PDAI.",
    }
  }

  if ((symbol === "BEAR" || symbol === "TEDDYBEAR" || symbol === "TEDDY") && pulse) {
    return {
      symbol: "BEAR",
      assetName: "TEDDY BEAR",
      chain: "pulsechain",
      contractAddress: TEDDY_CONTRACT,
      pairAddress: TEDDY_PAIR,
      coingeckoId: null,
      geckoterminalNetwork: "pulsechain",
      dexscreenerUrl: dexUrl(TEDDY_PAIR),
      confidence: "high",
      resolutionConfidence: "high",
      confidenceReason:
        "$BEAR in a PulseChain post is TEDDY BEAR, 0xd6c31ba0754c4383a41c0e9df042c62b5e918f6d. GeckoTerminal swaps that token's name and symbol.",
    }
  }

  if (symbol === "HEX") {
    const ethereum = context.ethereumHex || (postedAt != null && postedAt < PULSE_FORK_MS)
    if (ethereum) {
      return {
        symbol: "HEX",
        assetName: "HEX",
        chain: "ethereum",
        contractAddress: HEX_CONTRACT,
        pairAddress: null,
        coingeckoId: "hex",
        geckoterminalNetwork: "eth",
        dexscreenerUrl: null,
        confidence: "high",
        resolutionConfidence: "high",
        confidenceReason:
          postedAt != null && postedAt < PULSE_FORK_MS
            ? "HEX before 13 May 2023 is the Ethereum contract. PulseChain did not exist yet."
            : "The post says eHEX or ETH, so this HEX is the Ethereum listing, not PulseChain.",
      }
    }
    const pulseHex = pulseAsset("HEX")
    if (pulseHex) {
      return {
        symbol: "HEX",
        assetName: pulseHex.name,
        chain: "pulsechain",
        contractAddress: pulseHex.contract,
        pairAddress: pulseHex.pair,
        coingeckoId: null,
        geckoterminalNetwork: "pulsechain",
        dexscreenerUrl: dexUrl(pulseHex.pair),
        confidence: "high",
        resolutionConfidence: "high",
        confidenceReason:
          "HEX after 13 May 2023 defaults to PulseChain unless the post says eHEX or ETH. Same contract, PulseX pool.",
      }
    }
  }

  if (symbol === "NET" && (hint === "robinhood" || /\brobinhood\b/i.test(text))) {
    return {
      symbol: "NET",
      assetName: "NetNet",
      chain: "robinhood",
      contractAddress: NET_CONTRACT,
      pairAddress: NET_PAIR,
      coingeckoId: null,
      geckoterminalNetwork: "robinhood",
      dexscreenerUrl: `https://dexscreener.com/robinhood/${NET_PAIR}`,
      confidence: "low",
      resolutionConfidence: "ambiguous",
      confidenceReason:
        "$NET on Robinhood is ambiguous: crypto NetNet (0xCA9c78Dd337A67F6e0077F65F5E9218719d30eDf) versus a Cloudflare stock token. The crypto token is preferred and marked ambiguous.",
    }
  }

  return null
}
