import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm"
import { canonicalBySymbol } from "../detect/assets"
import { PULSE_BOOK, dexUrl } from "../detect/pulse"
import { getDb } from "../db"
import { cronRuns, influencers, mentions, quotes } from "../db/schema"
import { priceFromCache } from "./backlog"
import { callRankWindow } from "../scoring/call-rank"
import { getPricingProgress } from "../queries"
import { assetKeyOf } from "../format"
import { WEIGHTS, evaluateCall } from "../scoring/evaluate"
import { recomputeInfluencers } from "../stats"
import { fetchHistory, fetchBinanceTickers, fetchCoingeckoSimple, fetchDexTokenPrices } from "./history"
import { resolveContract, resolveSymbol } from "./resolve"

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

let quoteInflight: Promise<void> | null = null
let quoteAttemptAt = 0

export async function runPriceJob(options?: { limit?: number; mentionIds?: string[]; budgetMs?: number }) {
  const started = new Date()
  const db = getDb()
  const inline = Boolean(options?.mentionIds?.length)
  const requested = options?.limit ?? (inline ? 4 : 400)
  const limit = Math.min(Math.max(requested, 1), inline ? 20 : 800)
  const detail: Record<string, unknown> = { resolved: 0, priced: 0, failed: 0, quotes: 0, candleFetches: 0 }
  const touched = new Set<string>()

  try {
    if (!inline) {
      const pulseResolved = await applyPulseBias()
      detail.resolved = pulseResolved
    }
    const resolveLimit = inline ? limit : Math.min(6, limit)
    const pendingIds = options?.mentionIds?.length
      ? options.mentionIds.slice(0, resolveLimit)
      : resultRows<{ id: string }>(
          await db.execute(sql`
            with ranked as (
              select id, ${callRankWindow} as call_rank
              from mentions
            )
            select m.id
            from mentions m
            join ranked r on r.id = m.id
            where m.pinned = false
              and m.resolution_status = 'pending'
            order by r.call_rank asc, m.created_at asc
            limit ${resolveLimit}
          `),
        ).map((row) => row.id)
    const pending = pendingIds.length
      ? await db
          .select()
          .from(mentions)
          .where(
            and(
              eq(mentions.pinned, false),
              eq(mentions.resolutionStatus, "pending"),
              inArray(mentions.id, pendingIds),
            ),
          )
      : []
    const pendingOrder = new Map(pendingIds.map((id, index) => [id, index]))
    pending.sort((a, b) => (pendingOrder.get(a.id) ?? 0) - (pendingOrder.get(b.id) ?? 0))

    for (const mention of pending) {
      try {
        const resolved = mention.contractAddress
          ? await resolveContract(mention.contractAddress, mention.chain)
          : mention.symbol
            ? await resolveSymbol(mention.symbol)
            : null
        if (!resolved) continue
        const known = resolved.symbol ? canonicalBySymbol(resolved.symbol) : null
        await db
          .update(mentions)
          .set({
            symbol: resolved.symbol ?? mention.symbol,
            assetName: resolved.assetName,
            assetKey: resolved.assetKey,
            coingeckoId: resolved.coingeckoId ?? known?.id ?? null,
            binanceSymbol: known?.binance ?? resolved.binanceSymbol,
            chain: resolved.chain ?? mention.chain,
            contractAddress: resolved.contractAddress ?? mention.contractAddress,
            pairAddress: resolved.pairAddress,
            dexscreenerUrl: resolved.dexscreenerUrl,
            geckoterminalNetwork: resolved.geckoterminalNetwork,
            confidence: resolved.confidence,
            confidenceReason: resolved.confidenceReason,
            resolutionStatus: resolved.resolutionStatus,
            priceStatus: resolved.resolutionStatus === "unresolved" ? "unavailable" : mention.priceStatus,
            updatedAt: new Date(),
          })
          .where(eq(mentions.id, mention.id))
        detail.resolved = Number(detail.resolved) + 1
        touched.add(mention.influencerId)
        await dedupePost(mention.postId)
      } catch (error) {
        detail.failed = Number(detail.failed) + 1
        await db
          .update(mentions)
          .set({
            priceError: error instanceof Error ? error.message : String(error),
            priceAttempts: mention.priceAttempts + 1,
            updatedAt: new Date(),
          })
          .where(eq(mentions.id, mention.id))
      }
    }

    if (inline) {
    const history = await db
      .select()
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
          options?.mentionIds?.length ? inArray(mentions.id, options.mentionIds) : undefined,
        ),
      )
      .orderBy(asc(mentions.priceAttempts), asc(mentions.createdAt))
      .limit(limit)

    for (const mention of history) {
      if (mention.priceAttempts >= 5 && mention.priceStatus === "unavailable") continue
      try {
        const postedAt = mention.createdAt.getTime()
        const now = Date.now()
        const from = postedAt - 8 * DAY
        const to = Math.min(now, postedAt + WEIGHTS.excursionWindowMs) + 2 * HOUR
        const { candles, source } = await fetchHistory(
          {
            binanceSymbol: mention.binanceSymbol,
            coingeckoId: mention.coingeckoId,
            chain: mention.chain,
            pairAddress: mention.pairAddress,
            geckoterminalNetwork: mention.geckoterminalNetwork,
          },
          from,
          to,
        )
        if (candles.length < 2) throw new Error(`only ${candles.length} candles from ${source}`)
        const evaluated = evaluateCall({ postedAt, now, candles })
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
            series: candles,
            priceStatus: evaluated.priceStatus,
            priceError: null,
            pricedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(mentions.id, mention.id))
        detail.priced = Number(detail.priced) + 1
        touched.add(mention.influencerId)
      } catch (error) {
        detail.failed = Number(detail.failed) + 1
        const attempts = mention.priceAttempts + 1
        await db
          .update(mentions)
          .set({
            priceError: error instanceof Error ? error.message : String(error),
            priceAttempts: attempts,
            priceStatus: attempts >= 5 ? "unavailable" : mention.priceStatus,
            pricedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(mentions.id, mention.id))
      }
    }
    } else {
      const backlog = await priceFromCache({
        limit,
        budgetMs: options?.budgetMs ?? 35_000,
        assetFetches: 2,
        startedAt: started.getTime(),
      })
      detail.priced = Number(detail.priced) + backlog.priced
      detail.failed = Number(detail.failed) + backlog.failed
      detail.candleFetches = backlog.fetches
      for (const id of backlog.touched) touched.add(id)
    }

    detail.quotes = await refreshQuotes()
    if (touched.size) await recomputeInfluencers([...touched])
    const progress = await getPricingProgress()
    detail.progress = progress
    await db.insert(cronRuns).values({
      job: "prices",
      startedAt: started,
      finishedAt: new Date(),
      ok: true,
      detail,
    })
    return { ok: true, ...detail }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db.insert(cronRuns).values({
      job: "prices",
      startedAt: started,
      finishedAt: new Date(),
      ok: false,
      detail: { ...detail, error: message },
    })
    throw error
  }
}

async function dedupePost(postId: string) {
  const db = getDb()
  const rows = await db.select().from(mentions).where(eq(mentions.postId, postId))
  const groups = new Map<string, typeof rows>()
  for (const row of rows) {
    const key = row.assetKey ?? (row.symbol ? `sym:${row.symbol}` : row.matchKey)
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const ranked = [...group].sort((a, b) => scoreRow(b) - scoreRow(a))
    const keep = ranked[0]
    const drop = ranked.slice(1)
    if (drop.length) {
      await db.delete(mentions).where(inArray(mentions.id, drop.map((row) => row.id)))
      const extras = drop.map((row) => row.rawText).join(", ")
      await db
        .update(mentions)
        .set({
          confidenceReason: `${keep.confidenceReason ?? ""} Also matched ${extras} in the same post.`.trim(),
        })
        .where(eq(mentions.id, keep.id))
    }
  }
}

function scoreRow(row: { priceAt: number | null; matchType: string; confidence: string }) {
  const type = row.matchType === "evm" || row.matchType === "solana" ? 3 : row.matchType === "cashtag" ? 2 : 1
  const confidence = row.confidence === "high" ? 3 : row.confidence === "medium" ? 2 : 1
  return (row.priceAt != null ? 10 : 0) + type + confidence
}

export async function ensureFreshQuotes() {
  if (Date.now() - quoteAttemptAt < 20_000) return
  if (quoteInflight) return quoteInflight
  quoteAttemptAt = Date.now()
  quoteInflight = refreshQuotes()
    .catch(() => {
      quoteAttemptAt = Date.now() - 15_000
    })
    .then(() => undefined)
    .finally(() => {
      quoteInflight = null
    })
  return quoteInflight
}

async function applyPulseBias() {
  const db = getDb()
  const biased = await db
    .select({ id: influencers.id })
    .from(influencers)
    .where(eq(influencers.chainBias, "pulsechain"))
  if (!biased.length) return 0
  const ids = biased.map((row) => row.id)
  let count = 0
  for (const asset of Object.values(PULSE_BOOK)) {
    const updated = await db
      .update(mentions)
      .set({
        symbol: asset.symbol,
        assetName: asset.name,
        assetKey: `ct:pulsechain:${asset.contract}`,
        coingeckoId: null,
        binanceSymbol: null,
        chain: "pulsechain",
        contractAddress: asset.contract,
        pairAddress: asset.pair,
        dexscreenerUrl: dexUrl(asset.pair),
        geckoterminalNetwork: "pulsechain",
        confidence: "high",
        confidenceReason: asset.reason,
        resolutionStatus: "resolved",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mentions.resolutionStatus, "pending"),
          eq(mentions.pinned, false),
          sql`upper(${mentions.symbol}) = ${asset.symbol}`,
          inArray(mentions.influencerId, ids),
        ),
      )
      .returning({ id: mentions.id })
    count += updated.length
  }
  return count
}

export async function refreshQuotes() {
  const db = getDb()
  const rows = await db
    .selectDistinct({
      assetKey: mentions.assetKey,
      symbol: mentions.symbol,
      assetName: mentions.assetName,
      binanceSymbol: mentions.binanceSymbol,
      coingeckoId: mentions.coingeckoId,
      contractAddress: mentions.contractAddress,
      chain: mentions.chain,
    })
    .from(mentions)
    .where(and(eq(mentions.pinned, false), sql`${mentions.priceAt} is not null`, sql`${mentions.assetKey} is not null`))

  const binance = new Map<string, { assetKey: string; symbol: string; name: string | null }>()
  const cg = new Map<string, { assetKey: string; symbol: string; name: string | null }>()
  const dex = new Map<string, { assetKey: string; symbol: string; name: string | null; chain: string | null }>()

  for (const row of rows) {
    const key = row.assetKey ?? assetKeyOf(row)
    if (!key || !row.symbol) continue
    if (row.binanceSymbol) {
      binance.set(row.binanceSymbol, { assetKey: key, symbol: row.symbol, name: row.assetName })
    } else if (row.coingeckoId) {
      cg.set(row.coingeckoId, { assetKey: key, symbol: row.symbol, name: row.assetName })
    } else if (row.contractAddress) {
      dex.set(row.contractAddress, {
        assetKey: key,
        symbol: row.symbol,
        name: row.assetName,
        chain: row.chain,
      })
    }
  }

  // Tape still wants majors even when every demo call is pinned.
  for (const symbol of ["BTCUSDT", "ETHUSDT", "SOLUSDT"]) {
    if (!binance.has(symbol)) {
      const asset = canonicalBySymbol(symbol.replace("USDT", ""))
      if (asset) {
        binance.set(symbol, { assetKey: `cg:${asset.id}`, symbol: asset.symbol, name: asset.name })
      }
    }
  }

  const prices = new Map<string, { price: number; change24h: number | null; source: string; symbol: string; name: string | null }>()

  if (binance.size) {
    try {
      const tickers = await fetchBinanceTickers([...binance.keys()])
      for (const ticker of tickers) {
        const meta = binance.get(ticker.symbol)
        if (!meta || !Number.isFinite(ticker.price)) continue
        prices.set(meta.assetKey, {
          price: ticker.price,
          change24h: ticker.change24h,
          source: "binance",
          symbol: meta.symbol,
          name: meta.name,
        })
      }
    } catch {
      for (const meta of binance.values()) {
        const asset = canonicalBySymbol(meta.symbol)
        if (asset && !cg.has(asset.id)) {
          cg.set(asset.id, { assetKey: meta.assetKey, symbol: meta.symbol, name: meta.name })
        }
      }
    }
  }

  if (cg.size) {
    try {
      const simple = await fetchCoingeckoSimple([...cg.keys()])
      for (const row of simple) {
        const meta = cg.get(row.id)
        if (!meta || row.price == null) continue
        prices.set(meta.assetKey, {
          price: row.price,
          change24h: row.change24h,
          source: "coingecko",
          symbol: meta.symbol,
          name: meta.name,
        })
      }
    } catch {
      // A 429 should not discard Binance marks already collected this pass.
    }
  }

  if (dex.size) {
    try {
      const live = await fetchDexTokenPrices([...dex.keys()])
      for (const row of live) {
        const meta = dex.get(row.address) ?? dex.get(row.address.toLowerCase())
        if (!meta) continue
        prices.set(meta.assetKey, {
          price: row.price,
          change24h: row.change24h,
          source: "dexscreener",
          symbol: meta.symbol || row.symbol,
          name: meta.name || row.name,
        })
      }
    } catch {
      // DexScreener is best-effort for the tape.
    }
  }

  const now = new Date()
  for (const [assetKey, quote] of prices) {
    await db
      .insert(quotes)
      .values({
        assetKey,
        symbol: quote.symbol,
        name: quote.name,
        price: quote.price,
        change24h: quote.change24h,
        source: quote.source,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: quotes.assetKey,
        set: {
          symbol: quote.symbol,
          name: quote.name,
          price: quote.price,
          change24h: quote.change24h,
          source: quote.source,
          updatedAt: now,
        },
      })
  }

  const keys = [...prices.keys()]
  if (keys.length) {
    await db.execute(sql`
      update mentions
      set price_now = quotes.price,
          roi_now = quotes.price / mentions.price_at - 1,
          updated_at = now()
      from quotes
      where mentions.asset_key = quotes.asset_key
        and mentions.pinned = false
        and mentions.price_at is not null
        and mentions.price_at <> 0
        and mentions.asset_key in (${sql.join(keys.map((key) => sql`${key}`), sql`, `)})
    `)
  }
  return prices.size
}

function resultRows<T>(result: unknown): T[] {
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) {
    return result.rows as T[]
  }
  return Array.isArray(result) ? (result as T[]) : []
}
