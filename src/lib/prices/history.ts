import type { Candle } from "../scoring/evaluate"
import { CHAIN_TO_GECKOTERMINAL } from "../detect/assets"
import { coingeckoConfig, fetchJson } from "./http"
import { fetchPulsexCandles, isUnverifiable, UnverifiablePriceError } from "./pulsex"

const DAY = 24 * 60 * 60 * 1000
const GT_HISTORY_MS = 170 * DAY
const CG_HISTORY_MS = 360 * DAY

export { isUnverifiable, UnverifiablePriceError }

const HOUR = 60 * 60 * 1000

// Market-data host first. api.binance.com returns 451 from some regions; vision does not.
const BINANCE_HOSTS = ["https://data-api.binance.vision", "https://api.binance.com"]

async function binanceGet<T>(path: string, minIntervalMs: number, timeoutMs: number) {
  const errors: string[] = []
  for (const host of BINANCE_HOSTS) {
    try {
      return await fetchJson<T>(`${host}${path}`, { minIntervalMs, timeoutMs })
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  throw new Error(errors.join(" | "))
}

type HistoryTarget = {
  binanceSymbol?: string | null
  coingeckoId?: string | null
  chain?: string | null
  pairAddress?: string | null
  geckoterminalNetwork?: string | null
}

export async function fetchHistory(
  target: HistoryTarget & { contractAddress?: string | null },
  fromMs: number,
  toMs: number,
  postedAt = fromMs,
): Promise<{ candles: Candle[]; source: "binance" | "coingecko" | "geckoterminal" | "pulsex" }> {
  const errors: string[] = []
  const olderThanGt = fromMs < Date.now() - GT_HISTORY_MS
  const olderThanCg = fromMs < Date.now() - CG_HISTORY_MS
  if (target.binanceSymbol) {
    try {
      return { candles: await binanceKlines(target.binanceSymbol, fromMs, toMs), source: "binance" }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  if (target.coingeckoId && !olderThanCg) {
    try {
      return {
        candles: await coingeckoRange(target.coingeckoId, fromMs, toMs),
        source: "coingecko",
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  } else if (target.coingeckoId && olderThanCg) {
    errors.push("CoinGecko free history does not cover this date")
  }
  const network =
    target.geckoterminalNetwork ??
    (target.chain ? CHAIN_TO_GECKOTERMINAL[target.chain] : null)
  if (network && target.pairAddress && !olderThanGt) {
    try {
      return {
        candles: await geckoTerminalOhlcv(network, target.pairAddress, fromMs, toMs),
        source: "geckoterminal",
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(message)
      if (!message.startsWith("401") && !olderThanGt) {
        // A fresh GeckoTerminal failure can be retried. An old 401 falls through.
      }
    }
  } else if (network && target.pairAddress && olderThanGt) {
    errors.push("GeckoTerminal free OHLCV does not cover this date")
  }
  if (target.chain === "pulsechain" && target.pairAddress && target.contractAddress) {
    try {
      const candles = await fetchPulsexCandles({
        token: target.contractAddress,
        pair: target.pairAddress,
        postedAt,
        fromMs,
        toMs,
      })
      if (candles.length) return { candles, source: "pulsex" }
    } catch (error) {
      if (isUnverifiable(error)) {
        throw new UnverifiablePriceError(error instanceof Error ? error.message : String(error))
      }
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  if (olderThanGt || olderThanCg) {
    throw new UnverifiablePriceError(
      errors.join(" | ") || "No free history covers this date, and on-chain reserves were not available. Not estimated.",
    )
  }
  throw new Error(errors.join(" | ") || "no price source for this asset")
}

async function binanceKlines(symbol: string, fromMs: number, toMs: number) {
  const candles: Candle[] = []
  let cursor = fromMs
  while (cursor < toMs && candles.length < 5000) {
    const path = `/api/v3/klines?symbol=${symbol}&interval=1h&startTime=${cursor}&endTime=${toMs}&limit=1000`
    const rows = await binanceGet<unknown[]>(path, 120, 12_000)
    if (!Array.isArray(rows) || rows.length === 0) break
    for (const row of rows) {
      if (!Array.isArray(row)) continue
      const openTime = Number(row[0])
      const close = Number(row[4])
      const quoteVolume = Number(row[7])
      if (!Number.isFinite(openTime) || !Number.isFinite(close)) continue
      candles.push({ t: openTime, p: close, v: Number.isFinite(quoteVolume) ? quoteVolume : 0 })
    }
    const lastOpen = Number((rows[rows.length - 1] as number[])[0])
    if (!Number.isFinite(lastOpen) || lastOpen <= cursor) break
    cursor = lastOpen + 1
    if (rows.length < 1000) break
  }
  return dedupe(candles)
}

async function coingeckoRange(id: string, fromMs: number, toMs: number) {
  const cg = coingeckoConfig()
  const candles: Candle[] = []
  let cursor = fromMs
  const chunk = 80 * 24 * HOUR
  while (cursor < toMs) {
    const end = Math.min(toMs, cursor + chunk)
    const url = `${cg.base}/coins/${id}/market_chart/range?vs_currency=usd&from=${Math.floor(cursor / 1000)}&to=${Math.floor(end / 1000)}`
    const body = await fetchJson<{ prices?: [number, number][]; total_volumes?: [number, number][] }>(
      url,
      { headers: cg.headers, minIntervalMs: cg.minIntervalMs, timeoutMs: 15_000 },
    )
    const volumes = new Map((body.total_volumes ?? []).map(([t, v]) => [t, v]))
    for (const [t, p] of body.prices ?? []) {
      candles.push({ t, p, v: volumes.get(t) ?? 0 })
    }
    if (end === toMs) break
    cursor = end + 1000
  }
  return dedupe(candles)
}

type GtResponse = {
  data?: { attributes?: { ohlcv_list?: number[][] } }
}

async function geckoTerminalOhlcv(network: string, pool: string, fromMs: number, toMs: number) {
  const poolId = pool.startsWith("0x") || pool.startsWith("0X") ? pool.toLowerCase() : pool
  const candles: Candle[] = []
  let before = Math.floor(toMs / 1000) + 3600
  for (let page = 0; page < 4; page += 1) {
    const url = `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${poolId}/ohlcv/hour?aggregate=1&limit=1000&currency=usd&before_timestamp=${before}`
    const body = await fetchJson<GtResponse>(url, {
      headers: { accept: "application/json;version=20230302" },
      minIntervalMs: 1300,
      timeoutMs: 12_000,
    })
    const rows = body.data?.attributes?.ohlcv_list ?? []
    if (!rows.length) break
    let oldest = before
    for (const row of rows) {
      const [ts, , , , close, volume] = row
      const t = ts * 1000
      oldest = Math.min(oldest, ts)
      if (t < fromMs - HOUR || t > toMs + HOUR) continue
      candles.push({ t, p: close, v: volume ?? 0 })
    }
    if (oldest * 1000 <= fromMs || rows.length < 1000) break
    before = oldest
  }
  return dedupe(candles)
}

function dedupe(candles: Candle[]) {
  const byTime = new Map<number, Candle>()
  for (const candle of candles) {
    if (!Number.isFinite(candle.p) || candle.p <= 0) continue
    byTime.set(candle.t, candle)
  }
  return [...byTime.values()].sort((a, b) => a.t - b.t)
}

export async function fetchBinanceTickers(symbols: string[]) {
  if (!symbols.length) return []
  const path = `/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`
  const rows = await binanceGet<
    { symbol: string; lastPrice: string; priceChangePercent: string }[]
  >(path, 100, 10_000)
  return rows.map((row) => ({
    symbol: row.symbol,
    price: Number(row.lastPrice),
    change24h: Number(row.priceChangePercent) / 100,
  }))
}

export async function fetchCoingeckoSimple(ids: string[]) {
  if (!ids.length) return []
  const cg = coingeckoConfig()
  const url = `${cg.base}/simple/price?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=usd&include_24hr_change=true`
  const body = await fetchJson<Record<string, { usd?: number; usd_24h_change?: number }>>(url, {
    headers: cg.headers,
    minIntervalMs: cg.minIntervalMs,
    timeoutMs: 12_000,
  })
  return Object.entries(body).map(([id, row]) => ({
    id,
    price: row.usd ?? null,
    change24h: row.usd_24h_change != null ? row.usd_24h_change / 100 : null,
  }))
}

export async function fetchDexTokenPrices(addresses: string[]) {
  if (!addresses.length) return []
  const url = `https://api.dexscreener.com/latest/dex/tokens/${addresses.join(",")}`
  const body = await fetchJson<{ pairs?: { baseToken?: { address?: string; symbol?: string; name?: string }; chainId?: string; priceUsd?: string; priceChange?: { h24?: number }; liquidity?: { usd?: number } }[] }>(
    url,
    { minIntervalMs: 280, timeoutMs: 12_000 },
  )
  const best = new Map<string, { price: number; change24h: number | null; liquidity: number; symbol: string; name: string; chain: string; address: string }>()
  for (const pair of body.pairs ?? []) {
    const address = pair.baseToken?.address
    const price = Number(pair.priceUsd)
    if (!address || !Number.isFinite(price)) continue
    const key = address.toLowerCase()
    const liquidity = pair.liquidity?.usd ?? 0
    const current = best.get(key)
    if (current && current.liquidity >= liquidity) continue
    best.set(key, {
      price,
      change24h: pair.priceChange?.h24 != null ? pair.priceChange.h24 / 100 : null,
      liquidity,
      symbol: pair.baseToken?.symbol ?? "",
      name: pair.baseToken?.name ?? "",
      chain: pair.chainId ?? "unknown",
      address,
    })
  }
  return [...best.values()]
}
