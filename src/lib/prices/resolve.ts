import { and, eq, gt } from "drizzle-orm"
import { dexUrl } from "../detect/pulse"
import { apiCache } from "../db/schema"
import { getDb } from "../db"
import { assetKeyOf } from "../format"
import { pulsePairsFor, pulseSymbolCandidates } from "../pulsechain/lookup"
import { pickPulsexPair, rankSymbolCandidates, tokenAssetState, type DirectoryPair } from "../pulsechain/rank"
import { fetchJson } from "./http"

export type ResolvedAsset = {
  symbol: string | null
  assetName: string | null
  coingeckoId: string | null
  binanceSymbol: string | null
  chain: string | null
  contractAddress: string | null
  pairAddress: string | null
  dexscreenerUrl: string | null
  geckoterminalNetwork: string | null
  confidence: "high" | "medium" | "low"
  confidenceReason: string
  /** high, medium, low, or ambiguous when two listings could both be right. */
  resolutionConfidence: "high" | "medium" | "low" | "ambiguous"
  resolutionStatus: "resolved" | "pending" | "unresolved"
  /** dead = no pairs or empty reserves. rugged = it traded, then liquidity went to zero. */
  assetState: "dead" | "rugged" | null
  assetKey: string | null
}

type DexPair = {
  chainId?: string
  pairAddress?: string
  url?: string
  priceUsd?: string
  baseToken?: { address?: string; symbol?: string; name?: string }
  liquidity?: { usd?: number }
  volume?: { h24?: number }
}

const CHAIN_ALIASES: Record<string, string> = {
  pulse: "pulsechain",
  pulsechain: "pulsechain",
  eth: "ethereum",
  ethereum: "ethereum",
  bsc: "bsc",
  binance: "bsc",
  "binance-smart-chain": "bsc",
  base: "base",
  polygon: "polygon",
  matic: "polygon",
  arbitrum: "arbitrum",
  optimism: "optimism",
  avalanche: "avalanche",
  avax: "avalanche",
}

const GT_NETWORK_TO_CHAIN: Record<string, string> = {
  pulsechain: "pulsechain",
  eth: "ethereum",
  bsc: "bsc",
  base: "base",
  polygon_pos: "polygon",
  arbitrum: "arbitrum",
  optimism: "optimism",
  avax: "avalanche",
}

export function canonicalChain(chainId: string | null | undefined) {
  if (!chainId) return null
  const key = chainId.trim().toLowerCase()
  if (!key || key === "unknown-evm") return null
  return CHAIN_ALIASES[key] ?? key
}

/** PulseChain tickers only: any pair on another chain is never a candidate, however liquid. */
export function resolveEvmContract(address: string, pairs: DexPair[]): ResolvedAsset {
  const normalized = address.startsWith("0x") ? address.toLowerCase() : address
  const matching = pairs.filter(
    (pair) => baseMatches(pair, normalized) && canonicalChain(pair.chainId) === "pulsechain",
  )
  const best = [...matching].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0]
  const liquidity = best?.liquidity?.usd ?? 0
  if (!best || liquidity <= 0) {
    return pack({
      symbol: best?.baseToken?.symbol?.toUpperCase() ?? null,
      assetName: best?.baseToken?.name ?? null,
      coingeckoId: null,
      binanceSymbol: null,
      chain: "pulsechain",
      contractAddress: normalized,
      pairAddress: null,
      dexscreenerUrl: null,
      geckoterminalNetwork: null,
      confidence: "low",
      resolutionConfidence: "low",
      assetState: "dead",
      confidenceReason:
        "No PulseChain pair with liquidity. The asset is dead. Price stays unverifiable and is never estimated.",
      resolutionStatus: "resolved",
    })
  }
  const confidence = liquidity >= 100_000 ? "high" : liquidity >= 20_000 ? "medium" : "low"
  return pack({
    symbol: best.baseToken?.symbol?.toUpperCase() ?? null,
    assetName: best.baseToken?.name ?? null,
    coingeckoId: null,
    binanceSymbol: null,
    chain: "pulsechain",
    contractAddress: normalized,
    pairAddress: best.pairAddress?.startsWith("0x") ? best.pairAddress.toLowerCase() : (best.pairAddress ?? null),
    dexscreenerUrl: best.url ?? null,
    geckoterminalNetwork: "pulsechain",
    confidence,
    confidenceReason: `${best.baseToken?.symbol ?? "Token"} on PulseChain, preferred pair has ${formatCap(liquidity)} liquidity.`,
    resolutionStatus: "resolved",
  })
}

function baseMatches(pair: DexPair, address: string) {
  const base = pair.baseToken?.address?.toLowerCase()
  if (!base) return false
  return base === address.toLowerCase()
}

async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const db = getDb()
  const now = new Date()
  const hit = await db
    .select()
    .from(apiCache)
    .where(and(eq(apiCache.cacheKey, key), gt(apiCache.expiresAt, now)))
    .limit(1)
  if (hit[0]) return hit[0].payload as T
  const payload = await loader()
  const expiresAt = new Date(Date.now() + ttlMs)
  await db
    .insert(apiCache)
    .values({ cacheKey: key, payload, fetchedAt: now, expiresAt })
    .onConflictDoUpdate({
      target: apiCache.cacheKey,
      set: { payload, fetchedAt: now, expiresAt },
    })
  return payload
}

/** PulseChain tickers only: the local directory, then the explorer, then DexScreener — all PulseChain-scoped. */
export async function resolveSymbol(symbol: string): Promise<ResolvedAsset> {
  const local = await resolveFromDirectory(symbol)
  if (local) return local
  // PulseChain explorer token search: the most-held token with this exact symbol, which weeds out
  // copycats (PLSX has ~232k holders, its copies a few hundred). Adapted from PulseChainAI.com (GPL-3.0).
  const held = await mostHeldPulseToken(symbol).catch(() => null)
  if (held) {
    const byContract = await resolveContract(held).catch(() => null)
    if (byContract && byContract.resolutionStatus === "resolved" && byContract.chain === "pulsechain") {
      return byContract
    }
  }
  // DexScreener search, preferring the most liquid PulseChain pair for this symbol.
  const dex = await searchDex(symbol).catch(() => null)
  if (dex) return dex
  return pack({
    symbol: symbol.toUpperCase(),
    assetName: null,
    coingeckoId: null,
    binanceSymbol: null,
    chain: null,
    contractAddress: null,
    pairAddress: null,
    dexscreenerUrl: null,
    geckoterminalNetwork: null,
    confidence: "low",
    confidenceReason: `No PulseChain listing for $${symbol.toUpperCase()}.`,
    resolutionStatus: "unresolved",
  })
}

/** PulseChain tickers only: the local directory, then DexScreener and GeckoTerminal filtered to PulseChain pairs. */
export async function resolveContract(address: string): Promise<ResolvedAsset> {
  if (!address.startsWith("0x")) {
    return pack({
      symbol: null,
      assetName: null,
      coingeckoId: null,
      binanceSymbol: null,
      chain: null,
      contractAddress: address,
      pairAddress: null,
      dexscreenerUrl: null,
      geckoterminalNetwork: null,
      confidence: "low",
      confidenceReason: "Not an EVM contract. PulseChain is EVM only, so this never resolves.",
      resolutionStatus: "unresolved",
    })
  }
  const normalized = address.toLowerCase()
  const localPairs = await pulsePairsFor(normalized)
  if (localPairs.length) return assetFromLocalPairs(normalized, localPairs)
  let pairs = await loadDexPairs(normalized)
  const sawPulse = pairs.some((pair) => canonicalChain(pair.chainId) === "pulsechain")
  if (!sawPulse) {
    try {
      pairs = [...pairs, ...(await loadGeckoPairs(normalized))]
    } catch (error) {
      const hasPulse = pairs.some((pair) => baseMatches(pair, normalized) && canonicalChain(pair.chainId) === "pulsechain")
      if (!hasPulse) throw error
    }
  }
  return resolveEvmContract(normalized, pairs)
}

async function resolveFromDirectory(symbol: string): Promise<ResolvedAsset | null> {
  const candidates = await pulseSymbolCandidates(symbol)
  if (!candidates.length) return null
  const ranked = rankSymbolCandidates(candidates)
  const best = ranked.best
  if (!best) return null
  const pair = best.pulsexPairAddress ?? best.pairAddress
  return pack({
    symbol: best.symbol,
    assetName: best.name,
    coingeckoId: null,
    binanceSymbol: null,
    chain: "pulsechain",
    contractAddress: best.address,
    pairAddress: pair,
    dexscreenerUrl: pair ? dexUrl(pair) : null,
    geckoterminalNetwork: "pulsechain",
    confidence: ranked.confidence,
    resolutionConfidence: ranked.resolutionConfidence,
    assetState: best.assetState,
    confidenceReason: ranked.reason,
    resolutionStatus: "resolved",
  })
}

function assetFromLocalPairs(address: string, pairs: DirectoryPair[]): ResolvedAsset {
  const state = tokenAssetState(pairs)
  const ranked = [...pairs].sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))
  const live = ranked.find((pair) => !pair.missingSince && (pair.liquidityUsd ?? 0) > 0) ?? ranked[0]
  const pulsex = pickPulsexPair(pairs, null)
  const pairAddress = pulsex?.pairAddress ?? live?.pairAddress ?? null
  const liquidity = live && !live.missingSince ? (live.liquidityUsd ?? 0) : 0
  const symbol = (live?.baseSymbol ?? pulsex?.baseSymbol ?? "").toUpperCase() || null
  const confidence = liquidity >= 100_000 ? "high" : liquidity >= 20_000 ? "medium" : "low"
  return pack({
    symbol,
    assetName: live?.baseName ?? null,
    coingeckoId: null,
    binanceSymbol: null,
    chain: "pulsechain",
    contractAddress: address,
    pairAddress,
    dexscreenerUrl: pairAddress ? dexUrl(pairAddress) : null,
    geckoterminalNetwork: "pulsechain",
    confidence,
    resolutionConfidence: state === "dead" || confidence === "low" ? "low" : confidence,
    assetState: state,
    confidenceReason:
      state === "dead"
        ? "PulseChain directory has no pool with liquidity. The asset is dead. Price stays unverifiable and is never estimated."
        : `${symbol ?? "Token"} on PulseChain from the local directory, ${formatCap(liquidity)} liquidity.`,
    resolutionStatus: "resolved",
  })
}

async function loadDexPairs(address: string) {
  const data = await cached(`dex-token:${address.toLowerCase()}`, 6 * 60 * 60 * 1000, () =>
    fetchJson<{ pairs?: DexPair[] | null }>(`https://api.dexscreener.com/latest/dex/tokens/${address}`, {
      minIntervalMs: 280,
    }),
  )
  return data.pairs ?? []
}

type GtPool = {
  id?: string
  attributes?: { address?: string; name?: string; reserve_in_usd?: string }
  relationships?: { base_token?: { data?: { id?: string } } }
}

async function loadGeckoPairs(address: string): Promise<DexPair[]> {
  const data = await cached(`gt-pools:${address.toLowerCase()}`, 6 * 60 * 60 * 1000, () =>
    fetchJson<{ data?: GtPool[] | null }>(
      `https://api.geckoterminal.com/api/v2/search/pools?query=${address}`,
      { headers: { accept: "application/json;version=20230302" }, minIntervalMs: 1300 },
    ),
  )
  const pairs: DexPair[] = []
  for (const pool of data.data ?? []) {
    const baseId = pool.relationships?.base_token?.data?.id?.toLowerCase() ?? ""
    if (!baseId.endsWith(address.toLowerCase())) continue
    const network = networkFromPoolId(pool.id ?? "")
    if (!network) continue
    const name = pool.attributes?.name ?? ""
    const symbol = name.split("/")[0]?.trim() || null
    const reserve = Number(pool.attributes?.reserve_in_usd)
    pairs.push({
      chainId: GT_NETWORK_TO_CHAIN[network] ?? network,
      pairAddress: pool.attributes?.address,
      url: pool.attributes?.address
        ? `https://www.geckoterminal.com/${network}/pools/${pool.attributes.address}`
        : undefined,
      baseToken: { address, symbol: symbol ?? undefined, name: symbol ?? undefined },
      liquidity: { usd: Number.isFinite(reserve) ? reserve : 0 },
    })
  }
  return pairs
}

function networkFromPoolId(id: string) {
  const marker = id.toLowerCase().lastIndexOf("_0x")
  if (marker <= 0) return null
  return id.slice(0, marker).toLowerCase()
}

/** Exact-symbol ERC-20 on PulseChain with the most holders (at least 100), from the free Blockscout API. */
async function mostHeldPulseToken(symbol: string): Promise<string | null> {
  const body = await cached(`pls-explorer-search:${symbol.toUpperCase()}`, 12 * 60 * 60 * 1000, () =>
    fetchJson<{ items?: { symbol?: string; address?: string; address_hash?: string; holders?: string; holders_count?: string }[] }>(
      `https://api.scan.pulsechain.com/api/v2/tokens?q=${encodeURIComponent(symbol)}&type=ERC-20`,
      { minIntervalMs: 250, timeoutMs: 10_000 },
    ),
  )
  const wanted = symbol.toUpperCase()
  const best = (body.items ?? [])
    .filter((item) => item.symbol?.toUpperCase() === wanted)
    .map((item) => ({ address: item.address ?? item.address_hash ?? null, holders: Number(item.holders ?? item.holders_count ?? 0) }))
    .filter((item): item is { address: string; holders: number } => Boolean(item.address) && item.holders >= 100)
    .sort((a, b) => b.holders - a.holders)[0]
  return best ? best.address.toLowerCase() : null
}

async function searchDex(symbol: string): Promise<ResolvedAsset | null> {
  const data = await cached(`dex-search:${symbol}`, 60 * 60 * 1000, () =>
    fetchJson<{ pairs?: DexPair[] | null }>(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(symbol)}`,
      { minIntervalMs: 280 },
    ),
  )
  const pairs = (data.pairs ?? []).filter(
    (pair) => pair.baseToken?.symbol?.toUpperCase() === symbol.toUpperCase() && canonicalChain(pair.chainId) === "pulsechain",
  )
  const best = [...pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0]
  if (!best || (best.liquidity?.usd ?? 0) < 5_000) return null
  const liquidity = best.liquidity?.usd ?? 0
  const confidence = liquidity >= 250_000 ? "medium" : "low"
  return pack({
    symbol: symbol.toUpperCase(),
    assetName: best.baseToken?.name ?? null,
    coingeckoId: null,
    binanceSymbol: null,
    chain: "pulsechain",
    contractAddress: best.baseToken?.address ?? null,
    pairAddress: best.pairAddress ?? null,
    dexscreenerUrl: best.url ?? null,
    geckoterminalNetwork: "pulsechain",
    confidence,
    confidenceReason: `DexScreener's most liquid PulseChain $${symbol.toUpperCase()} pair has ${formatCap(liquidity)} liquidity${confidence === "low" ? ", so this stays low confidence" : ""}.`,
    resolutionStatus: "resolved",
  })
}

function pack(
  asset: Omit<ResolvedAsset, "assetKey" | "resolutionConfidence" | "assetState"> & {
    resolutionConfidence?: ResolvedAsset["resolutionConfidence"]
    assetState?: ResolvedAsset["assetState"]
  },
): ResolvedAsset {
  const resolutionConfidence =
    asset.resolutionConfidence ?? (asset.confidence === "low" ? "ambiguous" : asset.confidence)
  return {
    ...asset,
    resolutionConfidence,
    assetState: asset.assetState ?? null,
    assetKey: assetKeyOf(asset),
  }
}

function formatCap(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
}
