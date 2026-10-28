import { sql } from "drizzle-orm"
import { getDb } from "../db"
import { firstMentionIds } from "../scoring/call-rank"
import type { PriceMatch } from "../scoring/evaluate"
import { binanceEntry } from "./history"
import { fetchJson } from "./http"
import { onchainSeries } from "./onchain"
import { recomputeInfluencers } from "../stats"

/**
 * Price at the shill. GeckoTerminal's free OHLCV first: the minute candle that contains the post (its
 * open, or its close when the post is in the last 10 seconds). It steps down to the hour, then the day
 * candle, labelled nearest_candle / nearest_daily_close. The free API only serves the last 180 days, so
 * older posts use PulseX reserves at the post's block (PulseChain) or Binance 1m klines (majors).
 * No real data means the row stays pending. Nothing is estimated.
 */

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
/** GeckoTerminal's public API refuses anything older than 180 days (401); keep a margin. */
const GT_WINDOW_MS = 179 * DAY
/** About 30 calls a minute on the free tier. fetchJson spaces calls per host. */
const GT_INTERVAL_MS = 2_100
const CONCURRENCY = 4

export type Entry = { price: number; ts: number; match: PriceMatch; source: string }

type GtResponse = { data?: { attributes?: { ohlcv_list?: number[][] } } }

async function gtCandles(network: string, pool: string, frame: "minute" | "hour" | "day", before: number, token: string | null) {
  const id = pool.startsWith("0x") || pool.startsWith("0X") ? pool.toLowerCase() : pool
  // token= prices OUR token even when it is the pool's quote side (the "inversion fix" from
  // PulseChainAI.com, GPL-3.0, app/api/portfolio/ohlcv/route.ts). Without it GeckoTerminal prices the base.
  const tokenParam = token ? `&token=${encodeURIComponent(token)}` : ""
  const url = `https://api.geckoterminal.com/api/v2/networks/${encodeURIComponent(network)}/pools/${encodeURIComponent(id)}/ohlcv/${frame}?aggregate=1&limit=10&currency=usd&before_timestamp=${Math.floor(before / 1000)}${tokenParam}`
  const body = await fetchJson<GtResponse>(url, {
    headers: { accept: "application/json;version=20230302" },
    minIntervalMs: GT_INTERVAL_MS,
    timeoutMs: 12_000,
  })
  return (body.data?.attributes?.ohlcv_list ?? []).map(([ts, open, , , close]) => ({ t: ts * 1000, open, close }))
}

/** The candle of size `size` that contains `postedAt`, from rows that end at or before the next one. */
export function pickContaining(
  rows: { t: number; open: number; close: number }[],
  postedAt: number,
  size: number,
  priorWithinMs = 0,
) {
  const start = Math.floor(postedAt / size) * size
  const hit = rows.find((row) => row.t === start)
  if (hit) {
    const price = postedAt - start >= (size * 5) / 6 ? hit.close : hit.open
    return Number.isFinite(price) && price > 0 ? { price, ts: start } : null
  }
  // GeckoTerminal omits candles with no trades. The close of the last traded candle just before the
  // post is the pool's price at the post, so accept it only when it is that recent.
  if (!priorWithinMs) return null
  const prior = rows.filter((row) => row.t < start).sort((a, b) => b.t - a.t)[0]
  if (!prior || start - (prior.t + size) > priorWithinMs) return null
  return Number.isFinite(prior.close) && prior.close > 0 ? { price: prior.close, ts: prior.t + size } : null
}

type Frame = { frame: "minute" | "hour" | "day"; size: number; match: PriceMatch; priorWithinMs: number }
const MINUTE_FRAME: Frame = { frame: "minute", size: MIN, match: "exact", priorWithinMs: 5 * MIN }
const COARSE_FRAMES: Frame[] = [
  { frame: "hour", size: HOUR, match: "nearest_candle", priorWithinMs: 0 },
  { frame: "day", size: DAY, match: "nearest_daily_close", priorWithinMs: 0 },
]

export async function geckoEntry(
  network: string,
  pool: string,
  token: string | null,
  postedAt: number,
  now = Date.now(),
  frames: Frame[] = [MINUTE_FRAME, ...COARSE_FRAMES],
): Promise<Entry | null> {
  if (now - postedAt > GT_WINDOW_MS) return null
  for (const { frame, size, match, priorWithinMs } of frames) {
    const start = Math.floor(postedAt / size) * size
    const rows = await gtCandles(network, pool, frame, start + size, token)
    const hit = pickContaining(rows, postedAt, size, priorWithinMs)
    if (hit) return { ...hit, match, source: "geckoterminal" }
  }
  return null
}

type Row = {
  id: string
  influencer_id?: string
  created_at: Date | string
  chain: string | null
  contract_address: string | null
  pair_address: string | null
  geckoterminal_network: string | null
  binance_symbol: string | null
}

export async function entryFor(row: Row, now = Date.now()): Promise<Entry | null> {
  const postedAt = new Date(row.created_at).getTime()
  const errors: string[] = []
  const attempt = async (work: () => Promise<Entry | null>) => {
    try {
      return await work()
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
      return null
    }
  }
  const gecko = row.pair_address && row.geckoterminal_network ? { network: row.geckoterminal_network, pool: row.pair_address } : null
  // 1. GeckoTerminal minute candle (last 180 days).
  if (gecko) {
    const hit = await attempt(() => geckoEntry(gecko.network, gecko.pool, row.contract_address, postedAt, now, [MINUTE_FRAME]))
    if (hit) return hit
  }
  // 2. PulseChain: PulseX reserves at the post's block, an exact reading at any age.
  if (row.chain === "pulsechain" && row.contract_address?.startsWith("0x")) {
    const hit = await attempt(async () => {
      const candles = await onchainSeries({ token: row.contract_address!, net: "pulsechain", pair: row.pair_address, times: [postedAt] })
      const found = candles.find((candle) => Math.abs(candle.t - postedAt) <= 2 * MIN && candle.p > 0)
      return found ? { price: found.p, ts: found.t, match: "exact" as const, source: "pulsex" } : null
    })
    if (hit) return hit
  }
  // 3. Binance 1m kline for majors.
  if (row.binance_symbol) {
    const hit = await attempt(async () => {
      const found = await binanceEntry(row.binance_symbol!, postedAt)
      return found ? { ...found, match: "exact" as const, source: "binance" } : null
    })
    if (hit) return hit
  }
  // 4. GeckoTerminal hour, then day candle, labelled as such.
  if (gecko) {
    const hit = await attempt(() => geckoEntry(gecko.network, gecko.pool, row.contract_address, postedAt, now, COARSE_FRAMES))
    if (hit) return hit
  }
  if (errors.some((message) => /429|cooldown|abort|timeout|timed out|5\d\d from/i.test(message))) {
    throw new Error(errors.join(" | ").slice(0, 300))
  }
  return null
}

function rows<T>(result: unknown): T[] {
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows as T[]
  return Array.isArray(result) ? (result as T[]) : []
}

/** Fills price_at for resolved first calls that have none, newest first (inside the free 180-day window). */
export async function fillEntries(options?: { budgetMs?: number; limit?: number }) {
  const started = Date.now()
  const deadline = started + (options?.budgetMs ?? 40_000)
  const db = getDb()
  const pending = rows<Row>(
    await db.execute(sql`
      select id, influencer_id, created_at, chain, contract_address, pair_address, geckoterminal_network, binance_symbol
      from mentions
      where id in (${firstMentionIds})
        and pinned = false
        and resolution_status = 'resolved'
        and price_at is null
        and (price_status in ('pending', 'partial') or (price_status = 'unavailable' and price_attempts < 8))
        and (pair_address is not null or binance_symbol is not null or chain = 'pulsechain')
      order by price_attempts asc, created_at desc
      limit ${options?.limit ?? 300}
    `),
  )
  const summary = { candidates: pending.length, priced: 0, none: 0, transient: 0, bySource: {} as Record<string, number>, bySourceMatch: {} as Record<string, number> }
  const touched = new Set<string>()
  const queue = [...pending]
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length && deadline - Date.now() > 6_000) {
        const row = queue.shift()!
        try {
          const hit = await entryFor(row)
          if (!hit) {
            summary.none += 1
            await db.execute(sql`
              update mentions set price_attempts = price_attempts + 1,
                price_error = 'No free candle or reserve reading at the post time. Not estimated.', updated_at = now()
              where id = ${row.id}
            `)
            continue
          }
          await db.execute(sql`
            update mentions set
              price_at = ${hit.price},
              price_at_ts = ${new Date(hit.ts)},
              price_match = ${hit.match},
              price_source = ${hit.source},
              price_status = 'ready',
              price_error = null,
              roi_now = case when price_now is not null then price_now / ${hit.price}::float8 - 1 else null end,
              priced_at = now(),
              updated_at = now()
            where id = ${row.id} and price_at is null
          `)
          summary.priced += 1
          if (row.influencer_id) touched.add(row.influencer_id)
          summary.bySource[hit.source] = (summary.bySource[hit.source] ?? 0) + 1
          const key = `${hit.source}:${hit.match}`
          summary.bySourceMatch[key] = (summary.bySourceMatch[key] ?? 0) + 1
        } catch (error) {
          summary.transient += 1
          await db.execute(sql`
            update mentions set price_error = ${(error instanceof Error ? error.message : String(error)).slice(0, 300)}, updated_at = now()
            where id = ${row.id}
          `)
        }
      }
    }),
  )
  if (touched.size) await recomputeInfluencers([...touched]).catch(() => undefined)
  return { ...summary, ms: Date.now() - started }
}
