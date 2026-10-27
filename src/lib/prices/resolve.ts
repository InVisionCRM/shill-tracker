import { and, eq, gt } from "drizzle-orm"
import { CHAIN_TO_GECKOTERMINAL } from "../detect/assets"
import { apiCache } from "../db/schema"
import { getDb } from "../db"
import { assetKeyOf } from "../format"
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
  resolutionStatus: "resolved" | "unresolved"
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

export async function resolveSymbol(symbol: string): Promise<ResolvedAsset> {
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
      const reason =
        confidence === "high"
          ? `${top.name} leads other $${symbol.toUpperCase()} listings by market cap (${formatCap(top.market_cap)} vs ${formatCap(second)}).`
          : confidence === "medium"
            ? `${top.name} is the largest $${symbol.toUpperCase()} by market cap, but a runner-up is close enough to keep this at medium confidence.`
            : `Several assets share $${symbol.toUpperCase()}. ${top.name} is the largest (${formatCap(top.market_cap)}), but the lead is thin, so this match is low confidence.`
      return pack({
        symbol: top.symbol.toUpperCase(),
        assetName: top.name,
        coingeckoId: top.id,
        binanceSymbol: null,
        chain: null,
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

  const dex = await searchDex(symbol)
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

export async function resolveContract(address: string, hintedChain?: string | null): Promise<ResolvedAsset> {
  const data = await cached(`dex-token:${address.toLowerCase()}`, 6 * 60 * 60 * 1000, () =>
    fetchJson<{ pairs?: DexPair[] | null }>(
      `https://api.dexscreener.com/latest/dex/tokens/${address}`,
      { minIntervalMs: 280 },
    ),
  )
  const pairs = (data.pairs ?? []).filter((pair) => {
    const base = pair.baseToken?.address?.toLowerCase()
    if (!base) return false
    if (base !== address.toLowerCase() && !address.startsWith("0x")) {
      return base === address
    }
    return base === address.toLowerCase()
  })
  const best = [...pairs].sort(
    (a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0),
  )[0]
  if (!best) {
    return pack({
      symbol: null,
      assetName: null,
      coingeckoId: null,
      binanceSymbol: null,
      chain: hintedChain ?? null,
      contractAddress: address,
      pairAddress: null,
      dexscreenerUrl: null,
      geckoterminalNetwork: null,
      confidence: "low",
      confidenceReason: "DexScreener has no pair for this contract.",
      resolutionStatus: "unresolved",
    })
  }
  const liquidity = best.liquidity?.usd ?? 0
  const confidence = liquidity >= 100_000 ? "high" : liquidity >= 20_000 ? "medium" : "low"
  const chain = best.chainId ?? hintedChain ?? null
  return pack({
    symbol: best.baseToken?.symbol?.toUpperCase() ?? null,
    assetName: best.baseToken?.name ?? null,
    coingeckoId: null,
    binanceSymbol: null,
    chain,
    contractAddress: address.startsWith("0x") ? address.toLowerCase() : address,
    pairAddress: best.pairAddress ?? null,
    dexscreenerUrl: best.url ?? null,
    geckoterminalNetwork: chain ? (CHAIN_TO_GECKOTERMINAL[chain] ?? null) : null,
    confidence,
    confidenceReason: `${best.baseToken?.symbol ?? "Token"} on ${chain ?? "unknown chain"}, most liquid pair has ${formatCap(liquidity)} liquidity.`,
    resolutionStatus: "resolved",
  })
}

async function searchDex(symbol: string): Promise<ResolvedAsset | null> {
  const data = await cached(`dex-search:${symbol}`, 60 * 60 * 1000, () =>
    fetchJson<{ pairs?: DexPair[] | null }>(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(symbol)}`,
      { minIntervalMs: 280 },
    ),
  )
  const pairs = (data.pairs ?? []).filter(
    (pair) => pair.baseToken?.symbol?.toUpperCase() === symbol.toUpperCase(),
  )
  const best = [...pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0]
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

function pack(asset: Omit<ResolvedAsset, "assetKey">): ResolvedAsset {
  return { ...asset, assetKey: assetKeyOf(asset) }
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
