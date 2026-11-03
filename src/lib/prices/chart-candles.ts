/**
 * Candles for the call charts: real PulseX pool OHLCV from GeckoTerminal's free API, with the pool found on
 * DexScreener or GeckoTerminal's own pool list. GeckoTerminal only serves about the last 180 days. Nothing is ever filled in or estimated.
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
type GeckoPool = { id?: string; attributes?: { address?: string; reserve_in_usd?: string } }

/** PulseX pools for a token on DexScreener, deepest first. */
async function dexscreenerPools(token: string) {
  const response = await fetch(`https://api.dexscreener.com/token-pairs/v1/pulsechain/${token}`, { cache: "no-store" })
  if (!response.ok) throw new Error(`DexScreener ${response.status}`)
  const pairs = (await response.json()) as DexPair[]
  return (Array.isArray(pairs) ? pairs : [])
    .filter((pair) => pair.pairAddress && (pair.dexId ?? "").startsWith("pulsex"))
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))
    .map((pair) => pair.pairAddress!.toLowerCase())
}

/** The token's pools as GeckoTerminal itself lists them (deepest first); DexScreener misses many small tokens. */
async function geckoPools(token: string) {
  const response = await fetch(`https://api.geckoterminal.com/api/v2/networks/pulsechain/tokens/${token}/pools?page=1`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  })
  if (response.status === 404) return []
  if (!response.ok) throw new Error(`GeckoTerminal ${response.status}`)
  const body = (await response.json()) as { data?: GeckoPool[] }
  return [...(body.data ?? [])]
    .sort((a, b) => Number(b.attributes?.reserve_in_usd ?? 0) - Number(a.attributes?.reserve_in_usd ?? 0))
    .map((pool) => pool.attributes?.address?.toLowerCase())
    .filter((address): address is string => Boolean(address && ADDRESS.test(address)))
}

/** Pools to try, best first: the caller's known pair, DexScreener's PulseX pools, then GeckoTerminal's list. */
export async function chartPools(token: string, known?: string | null) {
  const out: string[] = []
  const add = (list: string[]) => list.forEach((pool) => !out.includes(pool) && out.push(pool))
  if (isChartToken(known)) add([known.toLowerCase()])
  let failed = false
  try {
    add(await dexscreenerPools(token))
  } catch {
    failed = true
  }
  if (out.length < 2) {
    try {
      add(await geckoPools(token))
    } catch {
      failed = true
    }
  }
  return { pools: out, failed }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** GeckoTerminal OHLCV for one pool; one short retry on a rate limit. */
async function poolOhlcv(pool: string, token: string, timeframe: ChartTimeframe) {
  const url = `https://api.geckoterminal.com/api/v2/networks/pulsechain/pools/${pool}/ohlcv/${timeframe}?aggregate=1&limit=1000&currency=usd&token=${token}`
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" })
    if (response.status === 429 && attempt === 0) {
      await wait(2_500)
      continue
    }
    if (!response.ok) return { candles: [] as ChartCandle[], failed: response.status !== 404 }
    const body = (await response.json()) as { data?: { attributes?: { ohlcv_list?: unknown } } }
    return { candles: parseOhlcv(body.data?.attributes?.ohlcv_list), failed: false }
  }
  return { candles: [] as ChartCandle[], failed: true }
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

/**
 * `failed` is true when a source errored or rate-limited (anything but a clean answer or a 404 for a pool
 * GeckoTerminal does not index), so the caller can cache that miss only briefly.
 */
export async function fetchChartCandles(token: string, timeframe: ChartTimeframe, knownPool?: string | null) {
  const address = token.toLowerCase()
  const found = await chartPools(address, knownPool)
  let failed = found.failed
  for (const pool of found.pools.slice(0, 3)) {
    const result = await poolOhlcv(pool, address, timeframe)
    if (result.candles.length) return { pool, candles: result.candles, failed: false }
    if (result.failed) failed = true
  }
  return { pool: null, candles: [] as ChartCandle[], failed }
}
