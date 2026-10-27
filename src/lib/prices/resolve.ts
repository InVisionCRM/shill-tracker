import { and, eq, gt } from "drizzle-orm"
import { CHAIN_TO_GECKOTERMINAL } from "../detect/assets"
import { dexUrl } from "../detect/pulse"
import { apiCache } from "../db/schema"
import { getDb } from "../db"
import { assetKeyOf } from "../format"
import { pulsePairsFor, pulseSymbolCandidates } from "../pulsechain/lookup"
import { pickPulsexPair, rankSymbolCandidates, tokenAssetState, type DirectoryPair } from "../pulsechain/rank"
import { coingeckoConfig, fetchJson } from "./http"

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

type CgSearch = {
  coins?: { id: string; name: string; symbol: string; market_cap_rank: number | null }[]
}

type CgMarket = {
  id: string
  symbol: string
  name: string
  market_cap: number | null
  total_volume: number | null
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

/** PulseChain first. This archive is mostly PulseChain, and the same 0x address can exist on Ethereum. */
export const EVM_CHAIN_PREFERENCE = [
  "pulsechain",
  "ethereum",
  "base",
  "bsc",
  "polygon",
  "arbitrum",
  "optimism",
  "avalanche",
] as const

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

const PULSE_FLOOR_USD = 20_000

export function pickEvmPair<T extends { chainId?: string | null; liquidity?: { usd?: number } | null }>(
  pairs: T[],
): T | null {
  if (!pairs.length) return null
  const ranked = [...pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))
  const bestOn = (chain: string) => ranked.find((pair) => canonicalChain(pair.chainId) === chain)
  const pulse = bestOn("pulsechain")
  const other = ranked.find((pair) => canonicalChain(pair.chainId) !== "pulsechain")
  const pulseLiquidity = pulse?.liquidity?.usd ?? 0
  const otherLiquidity = other?.liquidity?.usd ?? 0
  // A copied Ethereum contract can have a dust PulseChain pool. Prefer PulseChain when
  // that pool is a real market, or when nothing else is listed.
  if (
    pulse &&
    (!other || pulseLiquidity >= PULSE_FLOOR_USD || pulseLiquidity >= otherLiquidity * 0.2)
  ) {
    return pulse
  }
  for (const chain of EVM_CHAIN_PREFERENCE) {
    if (chain === "pulsechain") continue
    const hit = bestOn(chain)
    if (hit) return hit
  }
  return ranked[0]
}

/** Pair choice for an 0x contract. A real chain hint beats the PulseChain-first default. */
export function resolveEvmContract(address: string, pairs: DexPair[], chainHint?: string | null): ResolvedAsset {
  const normalized = address.startsWith("0x") ? address.toLowerCase() : address
  const matching = pairs.filter((pair) => baseMatches(pair, normalized))
  const hint = chainHint && chainHint !== "unknown-evm" ? canonicalChain(chainHint) ?? chainHint : null
  const hinted = hint
    ? [...matching]
        .filter((pair) => canonicalChain(pair.chainId) === hint)
        .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0]
    : undefined
  const best = hinted && (hinted.liquidity?.usd ?? 0) > 0 ? hinted : pickEvmPair(matching)
  const liquidity = best?.liquidity?.usd ?? 0
  if (!best || liquidity <= 0) {
    return pack({
      symbol: best?.baseToken?.symbol?.toUpperCase() ?? null,
      assetName: best?.baseToken?.name ?? null,
      coingeckoId: null,
      binanceSymbol: null,
      chain: hint ?? "unknown-evm",
      contractAddress: normalized,
      pairAddress: null,
      dexscreenerUrl: null,
      geckoterminalNetwork: null,
      confidence: "low",
      resolutionConfidence: "low",
      assetState: "dead",
      confidenceReason:
        "No pair with liquidity. The asset is dead. Price stays unverifiable and is never estimated.",
      resolutionStatus: "resolved",
    })
  }
  const chain = canonicalChain(best.chainId) ?? hint ?? "unknown-evm"
  const confidence = liquidity >= 100_000 ? "high" : liquidity >= 20_000 ? "medium" : "low"
  return pack({
    symbol: best.baseToken?.symbol?.toUpperCase() ?? null,
    assetName: best.baseToken?.name ?? null,
    coingeckoId: null,
    binanceSymbol: null,
    chain,
    contractAddress: normalized,
    pairAddress: best.pairAddress?.startsWith("0x") ? best.pairAddress.toLowerCase() : (best.pairAddress ?? null),
    dexscreenerUrl: best.url ?? null,
    geckoterminalNetwork: chain ? (CHAIN_TO_GECKOTERMINAL[chain] ?? null) : null,
    confidence,
    confidenceReason: `${best.baseToken?.symbol ?? "Token"} on ${chain}, preferred pair has ${formatCap(liquidity)} liquidity.`,
    resolutionStatus: chain === "unknown-evm" ? "pending" : "resolved",
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

function confidenceFromCaps(top: number, second: number | null): "high" | "medium" | "low" {
  if (top <= 0) return "low"
  if (second == null || second <= 0) return top >= 5_000_000 ? "high" : "medium"
  const ratio = top / second
  if (ratio >= 5 && top >= 5_000_000) return "high"
  if (ratio >= 2 && top >= 1_000_000) return "medium"
  return "low"
}

export async function resolveSymbol(symbol: string, hintedChain?: string | null): Promise<ResolvedAsset> {
  const hint = hintedChain && hintedChain !== "unknown-evm" ? canonicalChain(hintedChain) : null
  if (hint === "pulsechain") {
    const local = await resolveFromDirectory(symbol)
    if (local) return local
  }
  const cg = coingeckoConfig()
  const search = await cached(`cg-search:${symbol}`, 12 * 60 * 60 * 1000, () =>
    fetchJson<CgSearch>(`${cg.base}/search?query=${encodeURIComponent(symbol)}`, {
      headers: cg.headers,
      minIntervalMs: cg.minIntervalMs,
    }),
  )
  const coins = (search.coins ?? [])
    .filter((coin) => coin.symbol?.toUpperCase() === symbol.toUpperCase())
    .slice(0, 8)

  if (coins.length) {
    const ids = coins.map((coin) => coin.id).join(",")
    let markets: CgMarket[] = []
    try {
      markets = await cached(`cg-markets:${ids}`, 60 * 60 * 1000, () =>
        fetchJson<CgMarket[]>(
          `${cg.base}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids)}&order=market_cap_desc&per_page=10&page=1&sparkline=false`,
          { headers: cg.headers, minIntervalMs: cg.minIntervalMs },
        ),
      )
    } catch {
      markets = []
    }
    const ranked = [...markets].sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0))
    const top = ranked[0]
    if (top) {
      const second = ranked[1]?.market_cap ?? null
      const confidence = confidenceFromCaps(top.market_cap ?? 0, second)
      const hexNote =
        top.id === "hex"
          ? " This is the Ethereum HEX listing. PulseChain-focused accounts are priced from the PulseChain pool that shares this contract."
          : ""
      const reason =
        (confidence === "high"
          ? `${top.name} leads other $${symbol.toUpperCase()} listings by market cap (${formatCap(top.market_cap)} vs ${formatCap(second)}).`
          : confidence === "medium"
            ? `${top.name} is the largest $${symbol.toUpperCase()} by market cap, but a runner-up is close enough to keep this at medium confidence.`
            : `Several assets share $${symbol.toUpperCase()}. ${top.name} is the largest (${formatCap(top.market_cap)}), but the lead is thin, so this match is low confidence.`) +
        hexNote
      return pack({
        symbol: top.symbol.toUpperCase(),
        assetName: top.name,
        coingeckoId: top.id,
        binanceSymbol: null,
        chain: top.id === "hex" ? "ethereum" : null,
        contractAddress: null,
        pairAddress: null,
        dexscreenerUrl: null,
        geckoterminalNetwork: null,
        confidence,
        confidenceReason: reason,
        resolutionStatus: "resolved",
      })
    }
  }

  const dex = await searchDex(symbol, hintedChain)
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
    confidenceReason: `No CoinGecko market and no liquid DexScreener pair for $${symbol.toUpperCase()}.`,
    resolutionStatus: "unresolved",
  })
}

export async function resolveContract(address: string, _hintedChain?: string | null): Promise<ResolvedAsset> {
  const normalized = address.startsWith("0x") ? address.toLowerCase() : address
  const hint = _hintedChain && _hintedChain !== "unknown-evm" ? canonicalChain(_hintedChain) ?? _hintedChain : null
  const localPairs = normalized.startsWith("0x") ? await pulsePairsFor(normalized) : []
  if (hint === "pulsechain" && localPairs.length) return assetFromLocalPairs(normalized, localPairs)
  let pairs = await loadDexPairs(normalized)
  const sawPulse = pairs.some((pair) => canonicalChain(pair.chainId) === "pulsechain")
  if (normalized.startsWith("0x") && !sawPulse) {
    try {
      pairs = [...pairs, ...(await loadGeckoPairs(normalized))]
    } catch (error) {
      if (!pickEvmPair(pairs.filter((pair) => baseMatches(pair, normalized)))) throw error
    }
  }
  const seen = new Set(pairs.map((pair) => pair.pairAddress?.toLowerCase()).filter(Boolean))
  for (const extra of localDexPairs(localPairs)) {
    const key = extra.pairAddress?.toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    pairs.push(extra)
  }
  return resolveEvmContract(normalized, pairs, hint)
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

function localDexPairs(pairs: DirectoryPair[]): DexPair[] {
  return pairs.map((pair) => ({
    chainId: "pulsechain",
    pairAddress: pair.pairAddress,
    url: dexUrl(pair.pairAddress),
    baseToken: {
      address: pair.baseAddress,
      symbol: pair.baseSymbol ?? undefined,
      name: pair.baseName ?? undefined,
    },
    liquidity: { usd: pair.missingSince ? 0 : (pair.liquidityUsd ?? 0) },
  }))
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

async function searchDex(symbol: string, hintedChain?: string | null): Promise<ResolvedAsset | null> {
  const data = await cached(`dex-search:${symbol}`, 60 * 60 * 1000, () =>
    fetchJson<{ pairs?: DexPair[] | null }>(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(symbol)}`,
      { minIntervalMs: 280 },
    ),
  )
  const pairs = (data.pairs ?? []).filter(
    (pair) => pair.baseToken?.symbol?.toUpperCase() === symbol.toUpperCase(),
  )
  const hint = hintedChain && hintedChain !== "unknown-evm" ? hintedChain : null
  const hinted = hint
    ? [...pairs]
        .filter((pair) => canonicalChain(pair.chainId) === canonicalChain(hint))
        .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0]
    : undefined
  const best = hinted && (hinted.liquidity?.usd ?? 0) > 0
    ? hinted
    : [...pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0]
  if (!best || (best.liquidity?.usd ?? 0) < 5_000) return null
  const liquidity = best.liquidity?.usd ?? 0
  const confidence = liquidity >= 250_000 ? "medium" : "low"
  const chain = best.chainId ?? null
  return pack({
    symbol: symbol.toUpperCase(),
    assetName: best.baseToken?.name ?? null,
    coingeckoId: null,
    binanceSymbol: null,
    chain,
    contractAddress: best.baseToken?.address ?? null,
    pairAddress: best.pairAddress ?? null,
    dexscreenerUrl: best.url ?? null,
    geckoterminalNetwork: chain ? (CHAIN_TO_GECKOTERMINAL[chain] ?? null) : null,
    confidence,
    confidenceReason: `No clean CoinGecko winner. DexScreener's most liquid $${symbol.toUpperCase()} pair has ${formatCap(liquidity)} liquidity${confidence === "low" ? ", so this stays low confidence" : ""}.`,
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
