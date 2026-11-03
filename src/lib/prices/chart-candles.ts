/**
 * Candles for the call charts: real PulseX pool OHLCV from GeckoTerminal's free API, with the pool found on
 * DexScreener. GeckoTerminal only serves about the last 180 days. Nothing is ever filled in or estimated.
 */
export type ChartTimeframe = "day" | "hour"
export type ChartCandle = { time: number; open: number; high: number; low: number; close: number }

const ADDRESS = /^0x[a-f0-9]{40}$/

export function isChartToken(value: string | null | undefined): value is string {
  return Boolean(value && ADDRESS.test(value.toLowerCase()))
}

/** Hour candles when the shill is under 30 days old (GeckoTerminal returns at most 1,000 bars), else day candles. */
export function chartTimeframe(postedAtMs: number, now = Date.now()): ChartTimeframe {
  return now - postedAtMs < 30 * 24 * 60 * 60 * 1000 ? "hour" : "day"
}

/** Start of the bar (in seconds) that contains the post time. */
export function barTime(postedAtMs: number, timeframe: ChartTimeframe) {
  const size = timeframe === "hour" ? 3600 : 86400
  return Math.floor(postedAtMs / 1000 / size) * size
}

type DexPair = { pairAddress?: string; dexId?: string; liquidity?: { usd?: number } }

/** PulseX pools for a token, deepest first. GeckoTerminal only indexes PulseX pools on PulseChain. */
async function pulsexPools(token: string, revalidate: number) {
  const response = await fetch(`https://api.dexscreener.com/token-pairs/v1/pulsechain/${token}`, {
    next: { revalidate },
  })
  if (!response.ok) return []
  const pairs = (await response.json()) as DexPair[]
  return (Array.isArray(pairs) ? pairs : [])
    .filter((pair) => pair.pairAddress && (pair.dexId ?? "").startsWith("pulsex"))
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))
    .map((pair) => pair.pairAddress!.toLowerCase())
}

export function parseOhlcv(list: unknown): ChartCandle[] {
  if (!Array.isArray(list)) return []
  const candles = list
    .filter((row): row is number[] => Array.isArray(row) && row.length >= 5 && row.slice(0, 5).every((v) => Number.isFinite(Number(v))))
    .map((row) => ({ time: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]) }))
    .filter((candle) => candle.open > 0 && candle.high > 0 && candle.low > 0 && candle.close > 0)
    .sort((a, b) => a.time - b.time)
  return candles.filter((candle, index) => index === 0 || candle.time !== candles[index - 1].time)
}

export async function fetchChartCandles(token: string, timeframe: ChartTimeframe, revalidate: number) {
  const address = token.toLowerCase()
  const pools = (await pulsexPools(address, revalidate)).slice(0, 2)
  for (const pool of pools) {
    const response = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/pulsechain/pools/${pool}/ohlcv/${timeframe}?aggregate=1&limit=1000&currency=usd&token=${address}`,
      { headers: { accept: "application/json" }, next: { revalidate } },
    )
    if (!response.ok) continue
    const body = (await response.json()) as { data?: { attributes?: { ohlcv_list?: unknown } } }
    const candles = parseOhlcv(body.data?.attributes?.ohlcv_list)
    if (candles.length) return { pool, candles }
  }
  return { pool: null, candles: [] as ChartCandle[] }
}
