import { and, desc, eq, getTableColumns, ilike, inArray, or, sql } from "drizzle-orm"
import { getDb } from "./db"
import { influencerStats, influencers, mentions, posts, pulseTokens, quotes } from "./db/schema"
import { assetPartition, callRankWindow } from "./scoring/call-rank"
import { downsample, type Candle } from "./scoring/evaluate"
import type { PositionDTO, PricingProgress, ScoreSnapshot } from "./types"

const PRICED_MARKETS: { symbol: string; chain: string | null; imageUrl: string | null }[] = [
  { symbol: "BTC", chain: null, imageUrl: null },
  { symbol: "ETH", chain: null, imageUrl: null },
  { symbol: "SOL", chain: null, imageUrl: null },
  { symbol: "HEX", chain: "pulsechain", imageUrl: null },
  { symbol: "PEPE", chain: null, imageUrl: null },
  { symbol: "DOGE", chain: null, imageUrl: null },
  { symbol: "BONK", chain: null, imageUrl: null },
  { symbol: "WIF", chain: null, imageUrl: null },
]

export async function getTapeLogos() {
  const db = getDb()
  const result = await db.execute(sql`
    select symbol, chain, image_url
    from (
      select
        upper(m.symbol) as symbol,
        m.chain,
        max(t.image_url) as image_url,
        max(m.created_at) as seen
      from mentions m
      left join pulse_tokens t on upper(t.symbol) = upper(m.symbol)
      where m.symbol is not null and char_length(m.symbol) between 2 and 12
      group by 1, 2
    ) logos
    order by seen desc
    limit 16
  `)
  const rows = resultRows<{ symbol: string; chain: string | null; image_url: string | null }>(result).map((row) => ({
    symbol: row.symbol,
    chain: row.chain,
    imageUrl: row.image_url,
  }))
  if (rows.length > 0) return { source: "tape" as const, logos: rows }
  return { source: "markets" as const, logos: PRICED_MARKETS }
}

export async function getOverview() {
  const db = getDb()
  const [counts] = await db
    .select({
      voices: sql<number>`count(*) filter (where ${influencers.tracked})::int`,
      demoVoices: sql<number>`count(*) filter (where ${influencers.isDemo} and ${influencers.tracked})::int`,
    })
    .from(influencers)
  const [postCount] = await db.select({ posts: sql<number>`count(*)::int` }).from(posts)
  const progress = await mentionProgress()
  return {
    voices: counts?.voices ?? 0,
    demoVoices: counts?.demoVoices ?? 0,
    posts: postCount?.posts ?? 0,
    shills: progress.allTotal,
    flagged: progress.firstFlagged,
    priced: progress.allPriced,
    pending: progress.phase === "first" ? progress.firstPending : progress.allPending,
    firstPriced: progress.firstPriced,
    firstTotal: progress.firstTotal,
    median7d: progress.median7d,
    progress,
  }
}

async function mentionProgress(): Promise<PricingProgress & { firstFlagged: number; firstPending: number; allPending: number; median7d: number | null }> {
  const db = getDb()
  const result = await db.execute(sql`
    with ranked as (
      select
        price_at,
        price_status,
        pinned,
        pump_dump_flag,
        roi_7d,
        ${callRankWindow} as call_rank
      from mentions
      where call_kind = 'call'
    )
    select
      count(*)::int as all_total,
      count(*) filter (where price_at is not null)::int as all_priced,
      count(*) filter (where price_status in ('pending', 'partial') and pinned = false)::int as all_pending,
      count(*) filter (where call_rank = 1)::int as first_total,
      count(*) filter (where call_rank = 1 and price_at is not null)::int as first_priced,
      count(*) filter (where call_rank = 1 and price_status in ('pending', 'partial') and pinned = false)::int as first_pending,
      count(*) filter (where call_rank = 1 and pump_dump_flag)::int as first_flagged,
      percentile_cont(0.5) within group (order by roi_7d)
        filter (where call_rank = 1 and roi_7d is not null)::float8 as median_7d
    from ranked
  `)
  const row = resultRows<{
    all_total: number
    all_priced: number
    all_pending: number
    first_total: number
    first_priced: number
    first_pending: number
    first_flagged: number
    median_7d: number | null
  }>(result)[0]
  const allTotal = Number(row?.all_total ?? 0)
  const allPriced = Number(row?.all_priced ?? 0)
  const allPending = Number(row?.all_pending ?? 0)
  const firstTotal = Number(row?.first_total ?? 0)
  const firstPriced = Number(row?.first_priced ?? 0)
  const firstPending = Number(row?.first_pending ?? 0)
  const phase: PricingProgress["phase"] =
    firstTotal > 0 && firstPriced < firstTotal ? "first" : allPriced < allTotal ? "repeat" : "done"
  const headlinePriced = phase === "first" ? firstPriced : phase === "repeat" ? allPriced - firstPriced : allPriced
  const headlineTotal = phase === "first" ? firstTotal : phase === "repeat" ? allTotal - firstTotal : allTotal
  return {
    priced: headlinePriced,
    total: headlineTotal,
    pending: phase === "first" ? firstPending : allPending,
    phase,
    firstPriced,
    firstTotal,
    allPriced,
    allTotal,
    firstFlagged: Number(row?.first_flagged ?? 0),
    firstPending,
    allPending,
    median7d: row?.median_7d == null ? null : Number(row.median_7d),
  }
}

export async function getPricingProgress(): Promise<PricingProgress> {
  const progress = await mentionProgress()
  return {
    priced: progress.priced,
    total: progress.total,
    pending: progress.pending,
    phase: progress.phase,
    firstPriced: progress.firstPriced,
    firstTotal: progress.firstTotal,
    allPriced: progress.allPriced,
    allTotal: progress.allTotal,
  }
}

export async function getLeaderboard() {
  const db = getDb()
  return db
    .select({
      id: influencers.id,
      username: influencers.username,
      name: influencers.name,
      profileImageUrl: influencers.profileImageUrl,
      followersCount: influencers.followersCount,
      tracked: influencers.tracked,
      isDemo: influencers.isDemo,
      shillCount: influencerStats.shillCount,
      postCount: influencerStats.postCount,
      uniqueTickers: influencerStats.uniqueTickers,
      pricedCount: influencerStats.pricedCount,
      winRate24h: influencerStats.winRate24h,
      winRate7d: influencerStats.winRate7d,
      medianRoi24h: influencerStats.medianRoi24h,
      medianRoi7d: influencerStats.medianRoi7d,
      avgRoi7d: influencerStats.avgRoi7d,
      portfolio7d: influencerStats.portfolio7d,
      portfolioN7d: influencerStats.portfolioN7d,
      portfolioNow: influencerStats.portfolioNow,
      portfolioNNow: influencerStats.portfolioNNow,
      pumpDumpCount: influencerStats.pumpDumpCount,
      pumpDumpRate: influencerStats.pumpDumpRate,
      dumpRiskScore: influencerStats.dumpRiskScore,
      credibilityScore: influencerStats.credibilityScore,
      credibilityHorizon: influencerStats.credibilityHorizon,
      sampleSize: influencerStats.sampleSize,
      repeatAssets: influencerStats.repeatAssets,
      allScores: influencerStats.allScores,
    })
    .from(influencers)
    .leftJoin(influencerStats, eq(influencerStats.influencerId, influencers.id))
    .where(eq(influencers.tracked, true))
    .orderBy(sql`${influencerStats.credibilityScore} desc nulls last`)
}

export async function getInfluencer(username: string) {
  const db = getDb()
  const rows = await db
    .select()
    .from(influencers)
    .leftJoin(influencerStats, eq(influencerStats.influencerId, influencers.id))
    .where(eq(influencers.username, username.toLowerCase()))
    .limit(1)
  if (!rows[0]) return null
  const influencer = rows[0].influencers
  const stats = rows[0].influencer_stats
  const { series: _series, ...mentionCols } = getTableColumns(mentions)
  const [mentionCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(mentions)
    .where(eq(mentions.influencerId, influencer.id))
  const mentionTotal = mentionCount?.n ?? 0
  const mentionRows = await db
    .select(mentionCols)
    .from(mentions)
    .where(eq(mentions.influencerId, influencer.id))
    .orderBy(desc(mentions.createdAt))
    .limit(mentionTotal > 400 ? 80 : 400)
  const extraIds = [stats?.bestMentionId, stats?.worstMentionId].filter((id): id is string => Boolean(id))
  const missing = extraIds.filter((id) => !mentionRows.some((row) => row.id === id))
  if (missing.length) {
    const extra = await db.select(mentionCols).from(mentions).where(inArray(mentions.id, missing))
    mentionRows.push(...extra)
  }
  const [postCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(posts)
    .where(eq(posts.influencerId, influencer.id))
  const postRows = await db
    .select()
    .from(posts)
    .where(eq(posts.influencerId, influencer.id))
    .orderBy(desc(posts.createdAt))
    .limit(30)
  const mixResult = await db.execute(sql`
    select symbol, chain, count(*)::int as n
    from mentions
    where influencer_id = ${influencer.id} and symbol is not null
    group by symbol, chain
    order by n desc
    limit 8
  `)
  const weekResult = await db.execute(sql`
    with ranked as (
      select created_at, roi_7d, ${callRankWindow} as call_rank
      from mentions
      where influencer_id = ${influencer.id} and call_kind = 'call'
    )
    select to_char(date_trunc('week', created_at), 'YYYY-MM-DD') as week, avg(roi_7d)::float8 as roi
    from ranked
    where call_rank = 1 and roi_7d is not null
    group by 1
    order by 1 desc
    limit 16
  `)
  const firstResult = await db.execute(sql`
    select
      id, symbol, asset_name, asset_key, chain, created_at, price_at,
      roi_1h, roi_24h, roi_7d, roi_30d, roi_now,
      pump_dump_flag, pinned, price_source, price_now
    from (
      select distinct on (${assetPartition})
        id, symbol, asset_name, asset_key, chain, created_at, price_at,
        roi_1h, roi_24h, roi_7d, roi_30d, roi_now,
        pump_dump_flag, pinned, price_source, price_now
      from mentions
      where influencer_id = ${influencer.id}
        and call_kind = 'call'
        and resolution_status <> 'unresolved'
        and price_status is distinct from 'unverifiable'
      order by ${assetPartition}, created_at asc, id asc
    ) firsts
    order by created_at desc
  `)
  const repeatResult = await db.execute(sql`
    select
      ${assetPartition} as key,
      max(symbol) as symbol,
      count(*)::int as n,
      avg(roi_7d)::float8 as roi
    from mentions
    where influencer_id = ${influencer.id} and symbol is not null
    group by 1
    having count(*) > 1
    order by n desc
    limit 8
  `)
  const mixRows = resultRows<{ symbol: string; chain: string | null; n: number }>(mixResult)
  const weekRows = resultRows<{ week: string; roi: number | null }>(weekResult).reverse()
  const firstRows = resultRows<FirstCallRow>(firstResult).map(mapFirstCall)
  const allSnapshot = (stats?.allScores ?? null) as ScoreSnapshot | null
  const extraScoreIds = [allSnapshot?.bestMentionId, allSnapshot?.worstMentionId].filter(
    (id): id is string => Boolean(id) && !mentionRows.some((row) => row.id === id),
  )
  if (extraScoreIds.length) {
    const extra = await db.select(mentionCols).from(mentions).where(inArray(mentions.id, extraScoreIds))
    mentionRows.push(...extra)
  }
  return {
    influencer,
    stats,
    mentions: mentionRows,
    posts: postRows,
    mentionTotal,
    postTotal: postCount?.n ?? postRows.length,
    mix: mixRows.map((row) => ({ symbol: row.symbol, chain: row.chain, count: Number(row.n) })),
    weeks: weekRows.map((row) => ({ week: row.week, roi: row.roi == null ? null : Number(row.roi) })),
    firstCalls: firstRows,
    repeats: resultRows<{ key: string; symbol: string; n: number; roi: number | null }>(repeatResult).map((row) => ({
      key: row.key,
      symbol: row.symbol,
      count: Number(row.n),
      avg: row.roi == null ? null : Number(row.roi),
    })),
  }
}

type FirstCallRow = {
  id: string
  symbol: string | null
  asset_name: string | null
  asset_key: string | null
  chain: string | null
  created_at: Date | string
  price_at: number | null
  roi_1h: number | null
  roi_24h: number | null
  roi_7d: number | null
  roi_30d: number | null
  roi_now: number | null
  pump_dump_flag: boolean
  pinned: boolean
  price_source: string | null
  price_now: number | null
}

function mapFirstCall(row: FirstCallRow) {
  const createdAt = row.created_at instanceof Date ? row.created_at : new Date(row.created_at)
  return {
    id: row.id,
    symbol: row.symbol,
    assetName: row.asset_name,
    assetKey: row.asset_key,
    chain: row.chain,
    createdAt,
    priceAt: row.price_at == null ? null : Number(row.price_at),
    roi1h: num(row.roi_1h),
    roi24h: num(row.roi_24h),
    roi7d: num(row.roi_7d),
    roi30d: num(row.roi_30d),
    roiNow: num(row.roi_now),
    pumpDumpFlag: row.pump_dump_flag,
    pinned: row.pinned,
    priceSource: row.price_source,
    priceNow: num(row.price_now),
  }
}

function num(value: number | null) {
  return value == null ? null : Number(value)
}

export function toPosition(row: {
  id: string
  symbol: string | null
  assetName: string | null
  assetKey: string | null
  createdAt: Date
  priceAt: number | null
  pinned: boolean
  priceSource: string | null
  pumpDumpFlag: boolean
  roi1h: number | null
  roi24h: number | null
  roi7d: number | null
  roi30d: number | null
  roiNow: number | null
}, isFirstCall = false): PositionDTO {
  return {
    id: row.id,
    symbol: row.symbol,
    assetName: row.assetName,
    assetKey: row.assetKey,
    createdAt: row.createdAt.toISOString(),
    priceAt: row.priceAt,
    pinned: row.pinned,
    priceSource: row.priceSource,
    pumpDumpFlag: row.pumpDumpFlag,
    roi1h: row.roi1h,
    roi24h: row.roi24h,
    roi7d: row.roi7d,
    roi30d: row.roi30d,
    roiNow: row.roiNow,
    isFirstCall,
  }
}

function resultRows<T>(result: unknown): T[] {
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) {
    return result.rows as T[]
  }
  return Array.isArray(result) ? (result as T[]) : []
}

export async function getMention(id: string) {
  const db = getDb()
  const rows = await db
    .select()
    .from(mentions)
    .innerJoin(posts, eq(posts.id, mentions.postId))
    .innerJoin(influencers, eq(influencers.id, mentions.influencerId))
    .where(eq(mentions.id, id))
    .limit(1)
  if (!rows[0]) return null
  const series = downsample((rows[0].mentions.series ?? []) as Candle[], 240)
  return { ...rows[0], series }
}

export async function getTicker(symbol: string) {
  const db = getDb()
  const normalized = decodeURIComponent(symbol).replace(/^\$/, "").trim()
  const match = or(
    sql`upper(${mentions.symbol}) = upper(${normalized})`,
    eq(mentions.contractAddress, normalized),
    eq(mentions.coingeckoId, normalized.toLowerCase()),
  )
  const rows = await db
    .select()
    .from(mentions)
    .innerJoin(influencers, eq(influencers.id, mentions.influencerId))
    .innerJoin(posts, eq(posts.id, mentions.postId))
    .where(match)
    .orderBy(desc(mentions.createdAt))
    .limit(40)
  const [count] = await db
    .select({
      n: sql<number>`count(*)::int`,
      avg: sql<number | null>`avg(${mentions.roi7d}) filter (where ${mentions.callKind} = 'call' and ${mentions.priceStatus} is distinct from 'unverifiable')::float8`,
    })
    .from(mentions)
    .where(match)
  const firstResult = await db.execute(sql`
    select
      m.id,
      m.symbol,
      m.asset_name,
      m.asset_key,
      m.chain,
      m.contract_address,
      m.created_at,
      m.price_at,
      m.roi_7d,
      m.roi_now,
      m.price_now,
      m.pump_dump_flag,
      m.confidence,
      m.call_kind,
      m.price_status,
      m.asset_state,
      m.resolution_confidence,
      m.pinned,
      m.price_source,
      i.username,
      i.name,
      counts.n as mention_count
    from (
      select distinct on (influencer_id)
        id
      from mentions
      where call_kind = 'call'
        and resolution_status <> 'unresolved'
        and price_status is distinct from 'unverifiable'
        and (
          upper(symbol) = upper(${normalized})
          or contract_address = ${normalized}
          or coingecko_id = ${normalized.toLowerCase()}
        )
      order by influencer_id, created_at asc, id asc
    ) firsts
    join mentions m on m.id = firsts.id
    join influencers i on i.id = m.influencer_id
    join (
      select influencer_id, count(*)::int as n
      from mentions
      where upper(symbol) = upper(${normalized})
        or contract_address = ${normalized}
        or coingecko_id = ${normalized.toLowerCase()}
      group by influencer_id
    ) counts on counts.influencer_id = m.influencer_id
    order by m.created_at asc
  `)
  const firstCalls = resultRows<{
    id: string
    symbol: string | null
    asset_name: string | null
    asset_key: string | null
    chain: string | null
    contract_address: string | null
    created_at: Date | string
    price_at: number | null
    roi_7d: number | null
    roi_now: number | null
    price_now: number | null
    pump_dump_flag: boolean
    confidence: string
    call_kind: string | null
    price_status: string | null
    asset_state: string | null
    resolution_confidence: string | null
    pinned: boolean
    price_source: string | null
    username: string
    name: string
    mention_count: number
  }>(firstResult).map((row) => ({
    id: row.id,
    symbol: row.symbol,
    assetName: row.asset_name,
    assetKey: row.asset_key,
    chain: row.chain,
    contractAddress: row.contract_address,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    priceAt: num(row.price_at),
    roi7d: num(row.roi_7d),
    roiNow: num(row.roi_now),
    priceNow: num(row.price_now),
    pumpDumpFlag: row.pump_dump_flag,
    confidence: row.confidence,
    callKind: row.call_kind,
    priceStatus: row.price_status,
    assetState: row.asset_state,
    resolutionConfidence: row.resolution_confidence,
    pinned: row.pinned,
    priceSource: row.price_source,
    username: row.username,
    name: row.name,
    mentionCount: Number(row.mention_count),
  }))
  const settled = firstCalls.map((row) => row.roi7d).filter((value): value is number => value != null)
  const avgFirst = settled.length ? settled.reduce((sum, value) => sum + value, 0) / settled.length : null
  return {
    query: normalized,
    rows,
    total: count?.n ?? rows.length,
    avg7d: count?.avg == null ? null : Number(count.avg),
    avgFirst7d: avgFirst,
    firstCalls,
  }
}

export async function getFeed(limit = 40) {
  const db = getDb()
  return db
    .select({
      id: mentions.id,
      symbol: mentions.symbol,
      assetName: mentions.assetName,
      assetKey: mentions.assetKey,
      rawText: mentions.rawText,
      matchType: mentions.matchType,
      confidence: mentions.confidence,
      callKind: mentions.callKind,
      assetState: mentions.assetState,
      resolutionConfidence: mentions.resolutionConfidence,
      priceAt: mentions.priceAt,
      priceNow: mentions.priceNow,
      roi1h: mentions.roi1h,
      roi24h: mentions.roi24h,
      roi7d: mentions.roi7d,
      roiNow: mentions.roiNow,
      pumpDumpFlag: mentions.pumpDumpFlag,
      pumpDumpScore: mentions.pumpDumpScore,
      priceStatus: mentions.priceStatus,
      priceSource: mentions.priceSource,
      pinned: mentions.pinned,
      isDemo: mentions.isDemo,
      createdAt: mentions.createdAt,
      postId: posts.id,
      text: posts.text,
      username: influencers.username,
      name: influencers.name,
      imageUrl: pulseTokens.imageUrl,
      profileImageUrl: influencers.profileImageUrl,
      followersCount: influencers.followersCount,
      influencerDemo: influencers.isDemo,
    })
    .from(mentions)
    .innerJoin(posts, eq(posts.id, mentions.postId))
    .innerJoin(influencers, eq(influencers.id, mentions.influencerId))
    .leftJoin(pulseTokens, sql`lower(${mentions.contractAddress}) = ${pulseTokens.address}`)
    .orderBy(desc(mentions.createdAt))
    .limit(limit)
}

export async function getQuotes() {
  const db = getDb()
  return db.select().from(quotes).orderBy(desc(quotes.updatedAt))
}

export async function searchAll(query: string) {
  const db = getDb()
  const q = query.trim().replace(/^[@$]/, "")
  if (!q) return { influencers: [], mentions: [] }
  const voiceRows = await db
    .select()
    .from(influencers)
    .where(or(ilike(influencers.username, `%${q}%`), ilike(influencers.name, `%${q}%`)))
    .limit(8)
  const mentionRows = await db
    .select({
      id: mentions.id,
      symbol: mentions.symbol,
      assetName: mentions.assetName,
      createdAt: mentions.createdAt,
      roi7d: mentions.roi7d,
      roiNow: mentions.roiNow,
      username: influencers.username,
      name: influencers.name,
    })
    .from(mentions)
    .innerJoin(influencers, eq(influencers.id, mentions.influencerId))
    .where(
      or(
        ilike(mentions.symbol, `%${q}%`),
        ilike(mentions.assetName, `%${q}%`),
        eq(mentions.contractAddress, q),
      ),
    )
    .orderBy(desc(mentions.createdAt))
    .limit(12)
  return { influencers: voiceRows, mentions: mentionRows }
}

export async function listTrackedForBot() {
  const db = getDb()
  return db
    .select({
      id: influencers.id,
      x_user_id: influencers.xUserId,
      username: influencers.username,
      name: influencers.name,
      profile_image_url: influencers.profileImageUrl,
      followers_count: influencers.followersCount,
      tracked: influencers.tracked,
      is_demo: influencers.isDemo,
      latest_post_id: influencers.latestPostId,
    })
    .from(influencers)
    .where(and(eq(influencers.tracked, true), eq(influencers.isDemo, false)))
    .orderBy(influencers.username)
}

export async function getSparklines() {
  const db = getDb()
  const result = await db.execute(sql`
    select influencer_id, roi_7d
    from (
      select influencer_id, roi_7d, created_at,
        row_number() over (partition by influencer_id order by created_at desc) as rn
      from (
        select influencer_id, roi_7d, created_at,
          ${callRankWindow} as call_rank
        from mentions
        where roi_7d is not null and call_kind = 'call' and price_status is distinct from 'unverifiable'
      ) firsts
      where call_rank = 1
    ) ranked
    where rn <= 18
    order by influencer_id, created_at asc
  `)
  const map = new Map<string, number[]>()
  for (const row of resultRows<{ influencer_id: string; roi_7d: number }>(result)) {
    const list = map.get(row.influencer_id) ?? []
    list.push(Number(row.roi_7d))
    map.set(row.influencer_id, list)
  }
  return map
}
