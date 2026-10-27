export const PULSEX_V2_FACTORY = "0x29ea7545def87022badc76323f373ea1e707c523"
export const PULSEX_V1_FACTORY = "0x1715a3e4a142d8b698131108995174f37aeba10d"

const PRICEABLE_QUOTES = new Set(["wpls", "pls", "dai", "usdc", "usdt"])

export type DirectoryPair = {
  pairAddress: string
  factory: string | null
  amm: string | null
  createdBlock: number | null
  dexId: string | null
  baseAddress: string
  baseSymbol: string | null
  baseName: string | null
  quoteSymbol: string | null
  imageUrl: string | null
  liquidityUsd: number | null
  missingSince: string | null
}

export type TokenCandidate = {
  address: string
  symbol: string
  name: string | null
  imageUrl: string | null
  liquidityUsd: number
  pairAddress: string | null
  createdBlock: number | null
  pulsexPairAddress: string | null
  pulsexCreatedBlock: number | null
  missingSince: string | null
  assetState: "dead" | null
}

export type RankedSymbol = {
  best: TokenCandidate | null
  confidence: "high" | "medium" | "low"
  resolutionConfidence: "high" | "medium" | "low" | "ambiguous"
  reason: string
}

export function isPulsexV2(pair: { factory?: string | null; amm?: string | null; dexId?: string | null }) {
  const amm = pair.amm?.toLowerCase() ?? ""
  if (amm && amm !== "v2") return false
  const factory = pair.factory?.toLowerCase() ?? ""
  const dex = pair.dexId?.toLowerCase() ?? ""
  return dex === "pulsex" || factory === PULSEX_V2_FACTORY || factory === PULSEX_V1_FACTORY
}

/** Dead when every pair is missing or has no liquidity. One live pool keeps the token alive. */
export function tokenAssetState(
  pairs: { liquidityUsd: number | null; missingSince: string | null }[],
): "dead" | null {
  if (!pairs.length) return "dead"
  const alive = pairs.some((pair) => !pair.missingSince && (pair.liquidityUsd ?? 0) > 0)
  return alive ? null : "dead"
}

export function rankSymbolCandidates(candidates: TokenCandidate[]): RankedSymbol {
  const alive = candidates
    .filter((row) => row.assetState !== "dead" && row.liquidityUsd > 0)
    .sort((a, b) => b.liquidityUsd - a.liquidityUsd)
  if (!alive.length) {
    const dead = [...candidates].sort((a, b) => b.liquidityUsd - a.liquidityUsd)[0] ?? null
    return {
      best: dead,
      confidence: "low",
      resolutionConfidence: "low",
      reason: dead
        ? `$${dead.symbol} on PulseChain has no pool with liquidity. The asset is dead and is not estimated.`
        : "No PulseChain candidate.",
    }
  }
  const top = alive[0]
  const second = alive[1]
  const ratio = second && second.liquidityUsd > 0 ? top.liquidityUsd / second.liquidityUsd : Infinity
  let confidence: RankedSymbol["confidence"] = "low"
  let resolutionConfidence: RankedSymbol["resolutionConfidence"] = "ambiguous"
  if (second && ratio < 2 && second.liquidityUsd >= 5_000) {
    confidence = "low"
    resolutionConfidence = "ambiguous"
  } else if (top.liquidityUsd >= 100_000 && ratio >= 5) {
    confidence = "high"
    resolutionConfidence = "high"
  } else if (top.liquidityUsd >= 20_000 && (second == null || ratio >= 2)) {
    confidence = "medium"
    resolutionConfidence = "medium"
  }
  const reason =
    resolutionConfidence === "ambiguous" && second
      ? `$${top.symbol} has ${alive.length} PulseChain contracts. ${short(top.address)} leads with ${money(top.liquidityUsd)} liquidity, and ${short(second.address)} is close at ${money(second.liquidityUsd)}.`
      : `$${top.symbol} matched PulseChain ${short(top.address)} with ${money(top.liquidityUsd)} liquidity.`
  return { best: top, confidence, resolutionConfidence, reason }
}

/** PulseX v2 pair that existed at atBlock, preferring a WPLS or stable quote. */
export function pickPulsexPair(pairs: DirectoryPair[], atBlock: number | null): DirectoryPair | null {
  const pulsex = pairs.filter(isPulsexV2)
  const pool =
    atBlock == null
      ? pulsex
      : pulsex.filter((pair) => pair.createdBlock == null || pair.createdBlock <= atBlock)
  if (!pool.length) return null
  const best = deepest(pool)
  const priceable = deepest(pool.filter((pair) => PRICEABLE_QUOTES.has((pair.quoteSymbol ?? "").toLowerCase())))
  if (!best) return priceable
  if (!priceable) return best
  const priceableLiquidity = priceable.liquidityUsd ?? 0
  const bestLiquidity = best.liquidityUsd ?? 0
  if (priceableLiquidity >= bestLiquidity * 0.2 || priceableLiquidity >= 5_000) return priceable
  return best
}

function deepest(pairs: DirectoryPair[]) {
  if (!pairs.length) return null
  return [...pairs].sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))[0]
}

function short(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
}
