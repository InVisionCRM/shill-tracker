import { eq, inArray, sql } from "drizzle-orm"
import { getDb } from "../db"
import { candleDays, mentions } from "../db/schema"
import { callRankWindow } from "../scoring/call-rank"
import { applyAssetState, downsample, evaluateCall } from "../scoring/evaluate"
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
  assetFetches: number
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

  let fetches = 0
  let failed = 0
  const haveByAsset = new Map<string, Set<string>>()
  const sourceByAsset = new Map<string, string>()

  for (const [assetKey, group] of ordered) {
    if (Date.now() - options.startedAt > options.budgetMs) break
    const needed = new Set<string>()
    for (const row of group) {
      for (const day of windowDays(row.createdAt.getTime())) needed.add(day)
    }
    const have = await cachedDays(assetKey, [...needed])
    haveByAsset.set(assetKey, have)
    const missing = [...needed].filter((day) => !have.has(day))
    const gap = firstGap(missing, 40)
    if (!gap.length) continue
    if (fetches >= options.assetFetches) break
    if (Date.now() - options.startedAt > options.budgetMs) break
    const sample = group[0]
    try {
      const from = dayStart(gap[0])
      const to = dayStart(gap[gap.length - 1]) + DAY - 1
      const { candles, source } = await fetchHistory(
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
        sample.createdAt.getTime(),
      )
      await storeDays(assetKey, gap, candles, source)
      for (const day of gap) have.add(day)
      sourceByAsset.set(assetKey, source)
      fetches += 1
    } catch (error) {
      fetches += 1
      failed += 1
      if (isUnverifiable(error)) {
        await db
          .update(mentions)
          .set({
            priceStatus: "unverifiable",
            priceError: error instanceof Error ? error.message : String(error),
            pricedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(inArray(mentions.id, group.map((row) => row.id)))
      }
    }
  }

  let priced = 0
  const touched = new Set<string>()
  const loaded = new Map<string, Awaited<ReturnType<typeof loadCandles>>>()

  for (const [assetKey, group] of ordered) {
    if (Date.now() - options.startedAt > options.budgetMs) break
    const have = haveByAsset.get(assetKey)
    if (!have) continue
    const ready = group
      .filter((row) => windowDays(row.createdAt.getTime()).every((day) => have.has(day)))
      .sort((a, b) => a.callRank - b.callRank)
    if (!ready.length) continue
    if (!loaded.has(assetKey)) loaded.set(assetKey, await loadCandles(assetKey, [...have]))
    const candles = loaded.get(assetKey) ?? []
    let source = sourceByAsset.get(assetKey)
    if (!source) {
      const [stored] = await db
        .select({ source: candleDays.source })
        .from(candleDays)
        .where(eq(candleDays.assetKey, assetKey))
        .limit(1)
      source = stored?.source ?? "cache"
    }
    for (const row of ready) {
      if (Date.now() - options.startedAt > options.budgetMs) break
      const postedAt = row.createdAt.getTime()
      const now = Date.now()
      const from = postedAt - 8 * DAY
      const to = Math.min(now, postedAt + 30 * DAY) + 2 * HOUR
      const slice = candles.filter((candle) => candle.t >= from && candle.t <= to)
      try {
        if (slice.length < 2) throw new Error(`cached window has ${slice.length} candles`)
        const evaluated = applyAssetState(
          evaluateCall({ postedAt, now, candles: slice }),
          row.assetState === "dead" || row.assetState === "rugged" ? row.assetState : null,
        )
        await db
          .update(mentions)
          .set({
            priceSource: source,
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
        priced += 1
        touched.add(row.influencerId)
      } catch (error) {
        failed += 1
        const attempts = row.priceAttempts + 1
        await db
          .update(mentions)
          .set({
            priceError: error instanceof Error ? error.message : String(error),
            priceAttempts: attempts,
            priceStatus: attempts >= 5 ? "unavailable" : row.priceStatus,
            updatedAt: new Date(),
          })
          .where(eq(mentions.id, row.id))
      }
    }
  }

  return { priced, failed, fetches, touched: [...touched] }
}

function resultRows<T>(result: unknown): T[] {
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) {
    return result.rows as T[]
  }
  return Array.isArray(result) ? (result as T[]) : []
}
