import { and, desc, eq, getTableColumns, ilike, inArray, or, sql } from "drizzle-orm"
import { getDb } from "./db"
import { influencerStats, influencers, mentions, posts, quotes } from "./db/schema"
import { downsample, type Candle } from "./scoring/evaluate"

export async function getOverview() {
  const db = getDb()
  const [counts] = await db
    .select({
      voices: sql<number>`count(*) filter (where ${influencers.tracked})::int`,
      demoVoices: sql<number>`count(*) filter (where ${influencers.isDemo} and ${influencers.tracked})::int`,
    })
    .from(influencers)
  const [postCount] = await db.select({ posts: sql<number>`count(*)::int` }).from(posts)
  const [mentionCount] = await db
    .select({
      shills: sql<number>`count(*)::int`,
      flagged: sql<number>`count(*) filter (where ${mentions.pumpDumpFlag})::int`,
      priced: sql<number>`count(*) filter (where ${mentions.priceAt} is not null)::int`,
      pending: sql<number>`count(*) filter (where ${mentions.priceStatus} in ('pending', 'partial') and ${mentions.pinned} = false)::int`,
    })
    .from(mentions)
  const [medianRow] = await db
    .select({
      median7d: sql<number | null>`percentile_cont(0.5) within group (order by ${mentions.roi7d})::float8`,
    })
    .from(mentions)
    .where(sql`${mentions.roi7d} is not null`)
  return {
    voices: counts?.voices ?? 0,
    demoVoices: counts?.demoVoices ?? 0,
    posts: postCount?.posts ?? 0,
    shills: mentionCount?.shills ?? 0,
    flagged: mentionCount?.flagged ?? 0,
    priced: mentionCount?.priced ?? 0,
    pending: mentionCount?.pending ?? 0,
    median7d: medianRow?.median7d == null ? null : Number(medianRow.median7d),
  }
}

export async function getPricingProgress() {
  const overview = await getOverview()
  return { priced: overview.priced, total: overview.shills, pending: overview.pending }
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
    select to_char(date_trunc('week', created_at), 'YYYY-MM-DD') as week, avg(roi_7d)::float8 as roi
    from mentions
    where influencer_id = ${influencer.id} and roi_7d is not null
    group by 1
    order by 1 desc
    limit 16
  `)
  const mixRows = resultRows<{ symbol: string; chain: string | null; n: number }>(mixResult)
  const weekRows = resultRows<{ week: string; roi: number | null }>(weekResult).reverse()
  return {
    influencer,
    stats,
    mentions: mentionRows,
    posts: postRows,
    mentionTotal,
    postTotal: postCount?.n ?? postRows.length,
    mix: mixRows.map((row) => ({ symbol: row.symbol, chain: row.chain, count: Number(row.n) })),
    weeks: weekRows.map((row) => ({ week: row.week, roi: row.roi == null ? null : Number(row.roi) })),
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
  const rows = await db
    .select()
    .from(mentions)
    .innerJoin(influencers, eq(influencers.id, mentions.influencerId))
    .innerJoin(posts, eq(posts.id, mentions.postId))
    .where(
      or(
        sql`upper(${mentions.symbol}) = upper(${normalized})`,
        eq(mentions.contractAddress, normalized),
        eq(mentions.coingeckoId, normalized.toLowerCase()),
      ),
    )
    .orderBy(desc(mentions.createdAt))
    .limit(40)
  const [count] = await db
    .select({
      n: sql<number>`count(*)::int`,
      avg: sql<number | null>`avg(${mentions.roi7d})::float8`,
    })
    .from(mentions)
    .where(
      or(
        sql`upper(${mentions.symbol}) = upper(${normalized})`,
        eq(mentions.contractAddress, normalized),
        eq(mentions.coingeckoId, normalized.toLowerCase()),
      ),
    )
  return {
    query: normalized,
    rows,
    total: count?.n ?? rows.length,
    avg7d: count?.avg == null ? null : Number(count.avg),
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
      profileImageUrl: influencers.profileImageUrl,
      followersCount: influencers.followersCount,
      influencerDemo: influencers.isDemo,
    })
    .from(mentions)
    .innerJoin(posts, eq(posts.id, mentions.postId))
    .innerJoin(influencers, eq(influencers.id, mentions.influencerId))
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
      from mentions
      where roi_7d is not null
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
