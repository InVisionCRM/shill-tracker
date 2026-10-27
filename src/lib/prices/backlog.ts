import { eq, inArray, sql } from "drizzle-orm"
import { getDb } from "../db"
import { candleDays, mentions } from "../db/schema"
import { callRankWindow } from "../scoring/call-rank"
import { applyAssetState, downsample, evaluateCall, type Candle } from "../scoring/evaluate"
import { PULSE_FORK_MS } from "../detect/context"
import { onchainSeries, sampleTimes, type OnchainNet } from "./onchain"
import { cachedDays, dayStart, firstGap, loadCandles, storeDays, windowDays } from "./candles"
import { fetchHistory, isUnverifiable } from "./history"

const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000

type Row = {
  id: string
  influencerId: string
  assetKey: string
  createdAt: Date
  binanceSymbol: string | null
  coingeckoId: string | null
  chain: string | null
  pairAddress: string | null
  contractAddress: string | null
  assetState: string | null
  geckoterminalNetwork: string | null
  priceAttempts: number
  priceStatus: string
  callRank: number
}

export async function priceFromCache(options: {
  limit: number
  budgetMs: number
  startedAt: number
}) {
  const db = getDb()
  const hourAgo = new Date(Date.now() - HOUR)
  const dayAgo = new Date(Date.now() - DAY)
  const weekAgo = new Date(Date.now() - 7 * DAY)
  const monthAgo = new Date(Date.now() - 30 * DAY)
  const selected = await db.execute(sql`
    with ranked as (
      select id, ${callRankWindow} as call_rank
      from mentions
      where call_kind = 'call'
    )
    select
      m.id,
      m.influencer_id,
      m.asset_key,
      m.created_at,
      m.binance_symbol,
      m.coingecko_id,
      m.chain,
      m.pair_address,
      m.contract_address,
      m.asset_state,
      m.geckoterminal_network,
      m.price_attempts,
      m.price_status,
      r.call_rank
    from mentions m
    join ranked r on r.id = m.id
    where m.pinned = false
      and m.call_kind = 'call'
      and m.asset_key is not null
      and m.price_status is distinct from 'unverifiable'
      and m.price_status is distinct from 'excluded'
      and (
        m.resolution_status = 'resolved'
        or m.coingecko_id is not null
        or m.binance_symbol is not null
        or m.pair_address is not null
      )
      and (
        m.price_status in ('pending', 'partial')
        or (m.price_1h is null and m.created_at < ${hourAgo})
        or (m.price_24h is null and m.created_at < ${dayAgo})
        or (m.price_7d is null and m.created_at < ${weekAgo})
        or (m.price_30d is null and m.created_at < ${monthAgo})
      )
      and not (m.price_status = 'unavailable' and m.price_attempts >= 5)
      and (
        r.call_rank = 1
        or not exists (
          select 1
          from mentions m2
          join ranked r2 on r2.id = m2.id
          where r2.call_rank = 1
            and m2.pinned = false
            and m2.price_at is null
            and m2.price_status in ('pending', 'partial')
        )
      )
    order by r.call_rank asc, m.price_attempts asc, m.created_at asc
    limit ${options.limit}
  `)

  const rows: Row[] = resultRows<{
    id: string
    influencer_id: string
    asset_key: string
    created_at: Date | string
    binance_symbol: string | null
    coingecko_id: string | null
    chain: string | null
    pair_address: string | null
    geckoterminal_network: string | null
    price_attempts: number
    price_status: string
    call_rank: number | string
    contract_address: string | null
    asset_state: string | null
  }>(selected).map((row) => ({
    id: row.id,
    influencerId: row.influencer_id,
    assetKey: row.asset_key,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    binanceSymbol: row.binance_symbol,
    coingeckoId: row.coingecko_id,
    chain: row.chain,
    pairAddress: row.pair_address,
    contractAddress: row.contract_address,
    assetState: row.asset_state,
    geckoterminalNetwork: row.geckoterminal_network,
    priceAttempts: Number(row.price_attempts),
    priceStatus: row.price_status,
    callRank: Number(row.call_rank),
  }))
  const groups = new Map<string, Row[]>()
  for (const row of rows) {
    const list = groups.get(row.assetKey) ?? []
    list.push(row)
    groups.set(row.assetKey, list)
  }
  const ordered = [...groups.entries()].sort((a, b) => {
    const rankA = Math.min(...a[1].map((row) => row.callRank))
    const rankB = Math.min(...b[1].map((row) => row.callRank))
    if (rankA !== rankB) return rankA - rankB
    return b[1].length - a[1].length
  })

  const stats: BacklogStats = {
    attempted: rows.length,
    assets: ordered.length,
    priced: 0,
    failed: 0,
    unverifiable: 0,
    dead: 0,
    fetches: 0,
    onchainAssets: 0,
    errorsBySource: {},
    touched: new Set<string>(),
  }
  const overBudget = () => Date.now() - options.startedAt > options.budgetMs

  const write = async (row: Row, slice: Candle[], source: string) => {
    const evaluated = applyAssetState(
      evaluateCall({ postedAt: row.createdAt.getTime(), now: Date.now(), candles: slice }),
      row.assetState === "dead" || row.assetState === "rugged" ? row.assetState : null,
    )
    if (evaluated.priceAt == null) return false
    await db
      .update(mentions)
      .set({
        priceSource: source,
        priceMatch: evaluated.priceMatch,
        priceAtTs: evaluated.priceAtTs != null ? new Date(evaluated.priceAtTs) : null,
        priceMatches: evaluated.priceMatches,
        priceAt: evaluated.priceAt,
        price1h: evaluated.price1h,
        price24h: evaluated.price24h,
        price7d: evaluated.price7d,
        price30d: evaluated.price30d,
        priceNow: evaluated.priceNow,
        price24hBefore: evaluated.price24hBefore,
        price7dBefore: evaluated.price7dBefore,
        roi1h: evaluated.roi1h,
        roi24h: evaluated.roi24h,
        roi7d: evaluated.roi7d,
        roi30d: evaluated.roi30d,
        roiNow: evaluated.roiNow,
        maxGain: evaluated.maxGain,
        maxDrawdown: evaluated.maxDrawdown,
        maxPriceAfter: evaluated.maxPriceAfter,
        minPriceAfter: evaluated.minPriceAfter,
        volumeBefore24h: evaluated.volumeBefore24h,
        volumeAfter24h: evaluated.volumeAfter24h,
        runup24h: evaluated.runup24h,
        runup7d: evaluated.runup7d,
        pumpDumpScore: evaluated.pumpDumpScore,
        pumpDumpFlag: evaluated.pumpDumpFlag,
        pumpDumpReasons: evaluated.pumpDumpReasons,
        series: downsample(slice, 220),
        assetState: row.assetState === "dead" && evaluated.priceAt != null ? "rugged" : row.assetState,
        priceStatus: evaluated.priceStatus,
        priceError: null,
        pricedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(mentions.id, row.id))
    stats.priced += 1
    if (row.assetState === "dead" || row.assetState === "rugged") stats.dead += 1
    stats.touched.add(row.influencerId)
    return true
  }

  const markUnverifiable = async (ids: string[], message: string) => {
    if (!ids.length) return
    await db
      .update(mentions)
      .set({ priceStatus: "unverifiable", priceError: message, pricedAt: new Date(), updatedAt: new Date() })
      .where(inArray(mentions.id, ids))
    stats.unverifiable += ids.length
  }

  const noteError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    const source = sourceOf(message)
    stats.errorsBySource[source] = (stats.errorsBySource[source] ?? 0) + 1
    return message
  }

  // 1) On-chain assets: one batched reserve read per asset covers every pending call on it.
  const apiGroups: [string, Row[]][] = []
  const onchainQueue: { assetKey: string; net: OnchainNet; token: string; pair: string | null; rows: Row[]; rest: Row[] }[] = []
  for (const [assetKey, group] of ordered) {
    const sample = group[0]
    const net = onchainNetOf(sample)
    if (!net || !sample.contractAddress) {
      apiGroups.push([assetKey, group])
      continue
    }
    const eligible = group.filter((row) => net === "pulsechain" || row.createdAt.getTime() < PULSE_FORK_MS)
    const rest = group.filter((row) => !eligible.includes(row))
    onchainQueue.push({ assetKey, net, token: sample.contractAddress, pair: net === "pulsechain" ? sample.pairAddress : null, rows: eligible, rest })
  }

  const runOnchain = async (job: (typeof onchainQueue)[number]) => {
    const fallback: Row[] = [...job.rest]
    for (let start = 0; start < job.rows.length; start += 30) {
      if (overBudget()) return fallback
      const chunk = job.rows.slice(start, start + 30)
      const times = [...new Set(chunk.flatMap((row) => sampleTimes(row.createdAt.getTime())))]
      let candles: Candle[] = []
      try {
        candles = await onchainSeries({ token: job.token, net: job.net, pair: job.pair, times })
        stats.fetches += 1
      } catch (error) {
        const message = noteError(error)
        if (isUnverifiable(error)) {
          // No pool at all. Recent calls may still have API history; old ones stay unverifiable.
          const old = chunk.filter((row) => row.createdAt.getTime() < Date.now() - API_HISTORY_MS)
          await markUnverifiable(old.map((row) => row.id), message)
          fallback.push(...chunk.filter((row) => !old.includes(row)))
        } else {
          fallback.push(...chunk)
        }
        continue
      }
      for (const row of chunk) {
        const postedAt = row.createdAt.getTime()
        const slice = candles.filter((candle) => candle.t >= postedAt - 8 * DAY && candle.t <= Date.now() + HOUR)
        const ok = await write(row, slice, job.net === "ethereum" ? "uniswap-v2" : "pulsex")
        if (!ok) fallback.push(row)
      }
    }
    return fallback
  }

  const onchainFallback: Row[] = []
  for (let index = 0; index < onchainQueue.length; index += ONCHAIN_CONCURRENCY) {
    if (overBudget()) break
    const batch = onchainQueue.slice(index, index + ONCHAIN_CONCURRENCY)
    stats.onchainAssets += batch.length
    const results = await Promise.all(batch.map((job) => runOnchain(job)))
    results.forEach((rowsLeft, offset) => {
      if (rowsLeft.length) onchainFallback.push(...rowsLeft.map((row) => ({ ...row, assetKey: batch[offset].assetKey })))
    })
  }
  for (const row of onchainFallback) {
    const existing = apiGroups.find(([key]) => key === row.assetKey)
    if (existing) existing[1].push(row)
    else apiGroups.push([row.assetKey, [row]])
  }

  // 2) API assets (Binance, CoinGecko, GeckoTerminal): fetch each missing day range once per asset,
  // cache it by day, then evaluate every call on that asset from the cache.
  for (const [assetKey, group] of apiGroups) {
    if (overBudget()) break
    const sample = group[0]
    const needed = new Set<string>()
    for (const row of group) for (const day of windowDays(row.createdAt.getTime())) needed.add(day)
    const have = await cachedDays(assetKey, [...needed])
    let source: string | null = null
    for (let pass = 0; pass < 6 && !overBudget(); pass += 1) {
      const missing = [...needed].filter((day) => !have.has(day))
      const gap = firstGap(missing, 40)
      if (!gap.length) break
      const from = dayStart(gap[0])
      const to = dayStart(gap[gap.length - 1]) + DAY - 1
      try {
        const fetched = await fetchHistory(
          {
            binanceSymbol: sample.binanceSymbol,
            coingeckoId: sample.coingeckoId,
            chain: sample.chain,
            pairAddress: sample.pairAddress,
            contractAddress: sample.contractAddress,
            geckoterminalNetwork: sample.geckoterminalNetwork,
          },
          from,
          to,
          from,
          { skipOnchain: true },
        )
        await storeDays(assetKey, gap, fetched.candles, fetched.source)
        source = fetched.source
        for (const day of gap) have.add(day)
        stats.fetches += 1
      } catch (error) {
        stats.fetches += 1
        stats.failed += 1
        const message = noteError(error)
        if (isUnverifiable(error)) {
          // Only the calls whose window falls in this gap are unverifiable, not the whole asset.
          const gapSet = new Set(gap)
          const hit = group.filter((row) => windowDays(row.createdAt.getTime()).some((day) => gapSet.has(day)))
          await markUnverifiable(hit.map((row) => row.id), message)
          for (const day of gap) needed.delete(day)
          for (const row of hit) group.splice(group.indexOf(row), 1)
          continue
        }
        break
      }
    }
    const ready = group.filter((row) => windowDays(row.createdAt.getTime()).every((day) => have.has(day)))
    if (!ready.length) continue
    const candles = await loadCandles(assetKey, [...have])
    if (!source) {
      const [stored] = await db
        .select({ source: candleDays.source })
        .from(candleDays)
        .where(eq(candleDays.assetKey, assetKey))
        .limit(1)
      source = stored?.source ?? "cache"
    }
    for (const row of ready) {
      if (overBudget()) break
      const postedAt = row.createdAt.getTime()
      const to = Math.min(Date.now(), postedAt + 30 * DAY) + 2 * HOUR
      const slice = candles.filter((candle) => candle.t >= postedAt - 8 * DAY && candle.t <= to)
      const ok = slice.length >= 2 && (await write(row, slice, source))
      if (!ok) {
        stats.failed += 1
        const attempts = row.priceAttempts + 1
        await db
          .update(mentions)
          .set({
            priceError: slice.length < 2 ? `cached window has ${slice.length} candles` : "no candle within 36h of the post",
            priceAttempts: attempts,
            priceStatus: attempts >= 3 ? (postedAt < Date.now() - API_HISTORY_MS ? "unverifiable" : "unavailable") : row.priceStatus,
            updatedAt: new Date(),
          })
          .where(eq(mentions.id, row.id))
      }
    }
  }

  return {
    ...stats,
    touched: [...stats.touched],
  }
}

type BacklogStats = {
  attempted: number
  assets: number
  priced: number
  failed: number
  unverifiable: number
  dead: number
  fetches: number
  onchainAssets: number
  errorsBySource: Record<string, number>
  touched: Set<string>
}

const ONCHAIN_CONCURRENCY = 3
/** Free CoinGecko history reaches back about 365 days; GeckoTerminal about 180. */
const API_HISTORY_MS = 360 * DAY

function onchainNetOf(row: Row): OnchainNet | null {
  if (!row.contractAddress || !row.contractAddress.startsWith("0x")) return null
  if (row.chain === "pulsechain") return "pulsechain"
  if (row.chain === "ethereum" && !row.binanceSymbol) return "ethereum"
  return null
}

export function sourceOf(message: string) {
  const text = message.toLowerCase()
  if (text.includes("binance")) return "binance"
  if (text.includes("coingecko")) return "coingecko"
  if (text.includes("geckoterminal")) return "geckoterminal"
  if (text.includes("dexscreener")) return "dexscreener"
  if (text.includes("pulsechain rpc") || text.includes("pulsex") || text.includes("uniswap")) return "onchain"
  return "other"
}

function resultRows<T>(result: unknown): T[] {
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) {
    return result.rows as T[]
  }
  return Array.isArray(result) ? (result as T[]) : []
}
