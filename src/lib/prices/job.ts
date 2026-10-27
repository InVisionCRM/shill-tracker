import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm"
import { canonicalBySymbol } from "../detect/assets"
import { PULSE_BOOK, dexUrl } from "../detect/pulse"
import { getDb } from "../db"
import { cronRuns, influencers, mentions, quotes } from "../db/schema"
import { priceFromCache, sourceOf, type BacklogStats } from "./backlog"
import { onchainCallCount } from "./onchain"
import { callRankWindow } from "../scoring/call-rank"
import { getPricingProgress } from "../queries"
import { assetKeyOf } from "../format"
import { lookupOverride } from "../detect/overrides"
import { WEIGHTS, applyAssetState, evaluateCall } from "../scoring/evaluate"
import { recomputeInfluencers } from "../stats"
import { fetchHistory, fetchBinanceTickers, fetchCoingeckoSimple, fetchDexTokenPrices, isUnverifiable } from "./history"
import { resolveContract, resolveSymbol } from "./resolve"

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

let quoteInflight: Promise<void> | null = null
let quoteAttemptAt = 0

/** Work stops at the budget; the summary, quotes and run record get what is left before the hard cap. */
const DEFAULT_BUDGET_MS = 45_000
const FINALIZE_MS = 9_000
const RESOLVE_CONCURRENCY = 3

class BudgetExceeded extends Error {
  constructor() {
    super("price job budget reached")
    this.name = "BudgetExceeded"
  }
}

/** Resolves with the work, or rejects at the deadline so no slow call can push past it. */
function beforeDeadline<T>(work: Promise<T>, deadline: number): Promise<T> {
  const remaining = deadline - Date.now()
  if (remaining <= 0) {
    work.catch(() => undefined)
    return Promise.reject(new BudgetExceeded())
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new BudgetExceeded()), remaining)
  })
  work.catch(() => undefined)
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer))
}

export async function runPriceJob(options?: {
  limit?: number
  mentionIds?: string[]
  budgetMs?: number
  skipQuotes?: boolean
}) {
  const started = new Date()
  const db = getDb()
  const inline = Boolean(options?.mentionIds?.length)
  const requested = options?.limit ?? (inline ? 4 : 400)
  const limit = Math.min(Math.max(requested, 1), inline ? 20 : 800)
  const detail: Record<string, unknown> = { resolved: 0, priced: 0, failed: 0, quotes: 0, candleFetches: 0 }
  const touched = new Set<string>()
  const budgetMs = options?.budgetMs ?? DEFAULT_BUDGET_MS
  const workDeadline = started.getTime() + budgetMs
  const hardDeadline = workDeadline + FINALIZE_MS
  const dedupeIds: string[] = []
  const summary = {
    attempted: 0,
    priced: 0,
    unverifiable: 0,
    dead: 0,
    errorsBySource: {} as Record<string, number>,
    resolveGroups: 0,
    resolveGroupsPending: 0,
    assets: 0,
    onchainAssets: 0,
    fetches: 0,
    rpcBatches: 0,
    durationMs: 0,
    stoppedBy: "done" as "done" | "budget",
    phases: {} as Record<string, number>,
  }
  const phase = (name: string, since: number) => {
    summary.phases[name] = Date.now() - since
  }
  const rpcStart = onchainCallCount()

  // priceFromCache reports into this live object, so a run cut off at the budget still counts its work.
  let backlogStats: BacklogStats | null = null
  try {
    const work = async () => {
    let mark = Date.now()
    if (!inline) {
      const pulseResolved = await applyPulseBias()
      detail.resolved = pulseResolved
    }
    const resolveLimit = inline ? limit : 4000
    const pendingIds = options?.mentionIds?.length
      ? options.mentionIds.slice(0, resolveLimit)
      : resultRows<{ id: string }>(
          await db.execute(sql`
            with ranked as (
              select id, ${callRankWindow} as call_rank
              from mentions
              where call_kind = 'call'
            )
            select m.id
            from mentions m
            join ranked r on r.id = m.id
            where m.pinned = false
              and m.call_kind = 'call'
              and m.resolution_status = 'pending'
            order by r.call_rank asc, m.price_attempts asc, m.created_at asc
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
    const voiceIds = [...new Set(pending.map((mention) => mention.influencerId))]
    const voices = voiceIds.length
      ? await db
          .select({ id: influencers.id, chainBias: influencers.chainBias })
          .from(influencers)
          .where(inArray(influencers.id, voiceIds))
      : []
    const biasOf = new Map(voices.map((voice) => [voice.id, voice.chainBias]))

    // Group by what the resolver needs, so one network lookup resolves every mention of a token.
    type Pending = (typeof pending)[number]
    const groups = new Map<string, { hint: string | null; mentions: Pending[]; curated: ReturnType<typeof lookupOverride> }>()
    for (const mention of pending) {
      const bias = biasOf.get(mention.influencerId) ?? null
      const hint = mention.chain && mention.chain !== "unknown-evm" ? mention.chain : bias
      const curated = lookupOverride({
        symbol: mention.symbol,
        postedAt: mention.createdAt,
        chainHint: mention.chain,
        chainBias: bias,
      })
      const key = curated
        ? `o:${assetKeyOf(curated)}`
        : mention.contractAddress
          ? `c:${mention.contractAddress.toLowerCase()}|${hint ?? ""}`
          : mention.symbol
            ? `s:${mention.symbol.toUpperCase()}|${hint ?? ""}`
            : `x:${mention.id}`
      const group = groups.get(key) ?? { hint, mentions: [], curated }
      group.mentions.push(mention)
      groups.set(key, group)
    }
    phase("select", mark)
    mark = Date.now()
    const resolveBudgetMs = inline ? 20_000 : Math.round(budgetMs * 0.4)
    let resolvedGroups = 0
    let coingeckoLimited = false
    const resolveOne = async (group: (typeof groups extends Map<string, infer G> ? G : never)) => {
      const first = group.mentions[0]
      const ids = group.mentions.map((mention) => mention.id)
      try {
        const curated = group.curated
        const resolved = curated
          ? {
              symbol: curated.symbol,
              assetName: curated.assetName,
              assetKey: assetKeyOf(curated),
              coingeckoId: curated.coingeckoId,
              binanceSymbol: null,
              chain: curated.chain,
              contractAddress: curated.contractAddress,
              pairAddress: curated.pairAddress,
              dexscreenerUrl: curated.dexscreenerUrl,
              geckoterminalNetwork: curated.geckoterminalNetwork,
              confidence: curated.confidence,
              confidenceReason: curated.confidenceReason,
              resolutionConfidence: curated.resolutionConfidence,
              resolutionStatus: "resolved" as const,
              assetState: null,
            }
          : first.contractAddress
            ? await resolveContract(first.contractAddress, group.hint)
            : first.symbol
              ? await resolveSymbol(first.symbol, group.hint)
              : null
        if (!resolved) return
        const known = resolved.symbol ? canonicalBySymbol(resolved.symbol) : null
        const unresolvedEvm = resolved.chain === "unknown-evm" && resolved.resolutionStatus === "pending"
        await db
          .update(mentions)
          .set({
            symbol: resolved.symbol ?? first.symbol,
            assetName: resolved.assetName,
            assetKey: resolved.assetKey,
            coingeckoId: resolved.coingeckoId ?? known?.id ?? null,
            binanceSymbol: known?.binance ?? resolved.binanceSymbol,
            chain: resolved.chain ?? first.chain,
            contractAddress: resolved.contractAddress ?? first.contractAddress,
            pairAddress: resolved.pairAddress,
            dexscreenerUrl: resolved.dexscreenerUrl,
            geckoterminalNetwork: resolved.geckoterminalNetwork,
            confidence: resolved.confidence,
            confidenceReason: resolved.confidenceReason,
            resolutionConfidence: resolved.resolutionConfidence,
            resolutionStatus: resolved.resolutionStatus,
            assetState: resolved.assetState,
            ...(resolved.assetState === "dead" && !resolved.pairAddress
              ? { priceStatus: "unverifiable" }
              : resolved.resolutionStatus === "unresolved"
                ? { priceStatus: "unavailable" }
                : {}),
            ...(unresolvedEvm ? { priceAttempts: sql`${mentions.priceAttempts} + 1` } : {}),
            updatedAt: new Date(),
          })
          .where(inArray(mentions.id, ids))
        resolvedGroups += 1
        detail.resolved = Number(detail.resolved) + ids.length
        if (resolved.assetState === "dead") summary.dead += ids.length
        for (const mention of group.mentions) touched.add(mention.influencerId)
        dedupeIds.push(...group.mentions.map((mention) => mention.postId))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const source = sourceOf(message)
        summary.errorsBySource[source] = (summary.errorsBySource[source] ?? 0) + 1
        detail.failed = Number(detail.failed) + 1
        // Rate limits and timeouts are ours to retry. They do not count against the mention.
        const transient = /429|cooldown|abort|timeout|5\d\d from/i.test(message)
        await db
          .update(mentions)
          .set({
            priceError: message,
            ...(transient ? {} : { priceAttempts: sql`${mentions.priceAttempts} + 1` }),
            updatedAt: new Date(),
          })
          .where(inArray(mentions.id, ids))
        if (/429|cooldown/i.test(message) && source === "coingecko") coingeckoLimited = true
      }
    }
    // A few groups at once; each host still keeps its own spacing and 429 cooldown in fetchJson.
    const queue = [...groups.values()]
    await Promise.all(
      Array.from({ length: Math.min(RESOLVE_CONCURRENCY, queue.length) }, async () => {
        while (queue.length) {
          if (Date.now() - started.getTime() > resolveBudgetMs) return
          const group = queue.shift()!
          // Symbol lookups lean on CoinGecko; once it rate-limits, leave symbol groups for the next run.
          if (coingeckoLimited && !group.curated && !group.mentions[0].contractAddress) continue
          await resolveOne(group)
        }
      }),
    )
    summary.resolveGroups = resolvedGroups
    summary.resolveGroupsPending = groups.size - resolvedGroups
    if (dedupeIds.length) await dedupePosts([...new Set(dedupeIds)])
    phase("resolve", mark)
    mark = Date.now()

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
            eq(mentions.callKind, "call"),
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
            contractAddress: mention.contractAddress,
            geckoterminalNetwork: mention.geckoterminalNetwork,
          },
          from,
          to,
          postedAt,
        )
        if (candles.length < 2) throw new Error(`only ${candles.length} candles from ${source}`)
        const evaluated = applyAssetState(
          evaluateCall({ postedAt, now, candles }),
          mention.assetState === "dead" || mention.assetState === "rugged" ? mention.assetState : null,
        )
        const assetState =
          mention.assetState === "dead" && evaluated.priceAt != null ? "rugged" : mention.assetState
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
            series: candles,
            assetState,
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
        const unverifiable = isUnverifiable(error)
        await db
          .update(mentions)
          .set({
            priceError: error instanceof Error ? error.message : String(error),
            priceAttempts: attempts,
            priceStatus: unverifiable ? "unverifiable" : attempts >= 5 ? "unavailable" : mention.priceStatus,
            pricedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(mentions.id, mention.id))
      }
    }
    } else {
      await priceFromCache({
        limit,
        budgetMs,
        startedAt: started.getTime(),
        onStats: (stats) => {
          backlogStats = stats
        },
      })
    }
    phase("price", mark)
    }

    try {
      await beforeDeadline(work(), workDeadline)
    } catch (error) {
      if (!(error instanceof BudgetExceeded)) throw error
      // Abandoned work still checks the budget and winds down; every row write is independent.
      summary.stoppedBy = "budget"
    }
    const backlog = backlogStats as BacklogStats | null
    if (backlog) {
      detail.priced = Number(detail.priced) + backlog.priced
      detail.failed = Number(detail.failed) + backlog.failed
      detail.candleFetches = backlog.fetches
      summary.attempted = backlog.attempted
      summary.priced = backlog.priced
      summary.unverifiable += backlog.unverifiable
      summary.dead += backlog.dead
      summary.assets = backlog.assets
      summary.onchainAssets = backlog.onchainAssets
      summary.fetches = backlog.fetches
      for (const [source, count] of Object.entries(backlog.errorsBySource)) {
        summary.errorsBySource[source] = (summary.errorsBySource[source] ?? 0) + count
      }
      for (const id of backlog.touched) touched.add(id)
    }

    const finalize = async () => {
      let mark = Date.now()
      if (!options?.skipQuotes && hardDeadline - Date.now() > 6_000) {
        detail.quotes = await beforeDeadline(refreshQuotes(), hardDeadline - 4_000).catch(() => 0)
        phase("quotes", mark)
      }
      mark = Date.now()
      if (touched.size) {
        await beforeDeadline(recomputeInfluencers([...touched]), hardDeadline - 2_000).catch(() => {
          detail.statsDeferred = true
        })
        phase("stats", mark)
      }
      mark = Date.now()
      detail.progress = await beforeDeadline(getPricingProgress(), hardDeadline - 500).catch(() => null)
      phase("progress", mark)
    }
    await finalize()
    summary.rpcBatches = onchainCallCount() - rpcStart
    summary.durationMs = Date.now() - started.getTime()
    detail.summary = summary
    console.log(`price-run ${JSON.stringify(summary)}`)
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

async function dedupePosts(postIds: string[]) {
  const db = getDb()
  for (let start = 0; start < postIds.length; start += 500) {
    const slice = postIds.slice(start, start + 500)
    const rows = await db.select().from(mentions).where(inArray(mentions.postId, slice))
    const groups = new Map<string, typeof rows>()
    for (const row of rows) {
      const key = `${row.postId}|${row.assetKey ?? (row.symbol ? `sym:${row.symbol}` : row.matchKey)}`
      const group = groups.get(key) ?? []
      group.push(row)
      groups.set(key, group)
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue
      const ranked = [...group].sort((a, b) => scoreRow(b) - scoreRow(a))
      const keep = ranked[0]
      const drop = ranked.slice(1)
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
    if (asset.symbol === "HEX") continue
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
