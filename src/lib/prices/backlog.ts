import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm"
import { getDb } from "../db"
import { candleDays, mentions } from "../db/schema"
import { downsample, evaluateCall } from "../scoring/evaluate"
import { cachedDays, dayStart, firstGap, loadCandles, storeDays, windowDays } from "./candles"
import { fetchHistory } from "./history"

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
  geckoterminalNetwork: string | null
  priceAttempts: number
  priceStatus: string
}

export async function priceFromCache(options: {
  limit: number
  budgetMs: number
  assetFetches: number
  startedAt: number
}) {
  const db = getDb()
  const selected = await db
    .select({
      id: mentions.id,
      influencerId: mentions.influencerId,
      assetKey: mentions.assetKey,
      createdAt: mentions.createdAt,
      binanceSymbol: mentions.binanceSymbol,
      coingeckoId: mentions.coingeckoId,
      chain: mentions.chain,
      pairAddress: mentions.pairAddress,
      geckoterminalNetwork: mentions.geckoterminalNetwork,
      priceAttempts: mentions.priceAttempts,
      priceStatus: mentions.priceStatus,
    })
    .from(mentions)
    .where(
      and(
        eq(mentions.pinned, false),
        or(
          eq(mentions.resolutionStatus, "resolved"),
          sql`${mentions.coingeckoId} is not null`,
          sql`${mentions.binanceSymbol} is not null`,
          sql`${mentions.pairAddress} is not null`,
        ),
        or(
          inArray(mentions.priceStatus, ["pending", "partial"]),
          and(isNull(mentions.price1h), lt(mentions.createdAt, new Date(Date.now() - HOUR))),
          and(isNull(mentions.price24h), lt(mentions.createdAt, new Date(Date.now() - DAY))),
          and(isNull(mentions.price7d), lt(mentions.createdAt, new Date(Date.now() - 7 * DAY))),
          and(isNull(mentions.price30d), lt(mentions.createdAt, new Date(Date.now() - 30 * DAY))),
        ),
      ),
    )
    .orderBy(asc(mentions.priceAttempts), asc(mentions.createdAt))
    .limit(options.limit)

  const rows: Row[] = selected.filter((row): row is Row => Boolean(row.assetKey))
  const groups = new Map<string, Row[]>()
  for (const row of rows) {
    const list = groups.get(row.assetKey) ?? []
    list.push(row)
    groups.set(row.assetKey, list)
  }
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)

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
    if (!gap.length || fetches >= options.assetFetches) continue
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
          geckoterminalNetwork: sample.geckoterminalNetwork,
        },
        from,
        to,
      )
      await storeDays(assetKey, gap, candles, source)
      for (const day of gap) have.add(day)
      sourceByAsset.set(assetKey, source)
      fetches += 1
    } catch {
      fetches += 1
      failed += 1
    }
  }

  let priced = 0
  const touched = new Set<string>()
  const loaded = new Map<string, Awaited<ReturnType<typeof loadCandles>>>()

  for (const [assetKey, group] of ordered) {
    if (Date.now() - options.startedAt > options.budgetMs) break
    const have = haveByAsset.get(assetKey)
    if (!have) continue
    const ready = group.filter((row) => windowDays(row.createdAt.getTime()).every((day) => have.has(day)))
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
        const evaluated = evaluateCall({ postedAt, now, candles: slice })
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
