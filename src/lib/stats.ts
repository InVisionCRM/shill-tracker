import { getTableColumns, inArray } from "drizzle-orm"
import { getDb } from "./db"
import { influencerStats, mentions, posts } from "./db/schema"
import { aggregateInfluencer, type InfluencerAggregate, type StatMention } from "./scoring/aggregate"
import type { ScoreSnapshot } from "./types"

export async function recomputeInfluencers(influencerIds?: string[]) {
  const db = getDb()
  const { series: _series, ...mentionCols } = getTableColumns(mentions)
  const mentionRows = influencerIds?.length
    ? await db.select(mentionCols).from(mentions).where(inArray(mentions.influencerId, influencerIds))
    : await db.select(mentionCols).from(mentions)
  const postRows = influencerIds?.length
    ? await db
        .select({ influencerId: posts.influencerId })
        .from(posts)
        .where(inArray(posts.influencerId, influencerIds))
    : await db.select({ influencerId: posts.influencerId }).from(posts)

  const ids = new Set<string>(influencerIds ?? [])
  if (!influencerIds) {
    for (const row of mentionRows) ids.add(row.influencerId)
    for (const row of postRows) ids.add(row.influencerId)
  }

  const mentionsBy = new Map<string, StatMention[]>()
  for (const row of mentionRows) {
    const list = mentionsBy.get(row.influencerId) ?? []
    list.push({
      id: row.id,
      assetKey: row.assetKey,
      symbol: row.symbol,
      createdAt: row.createdAt.getTime(),
      roi1h: row.roi1h,
      roi24h: row.roi24h,
      roi7d: row.roi7d,
      roi30d: row.roi30d,
      roiNow: row.roiNow,
      pumpDumpFlag: row.pumpDumpFlag,
      pumpDumpScore: row.pumpDumpScore,
      priceAt: row.priceAt,
      callKind: row.callKind,
      resolutionStatus: row.resolutionStatus,
      priceStatus: row.priceStatus,
    })
    mentionsBy.set(row.influencerId, list)
  }

  const postCounts = new Map<string, number>()
  for (const row of postRows) {
    postCounts.set(row.influencerId, (postCounts.get(row.influencerId) ?? 0) + 1)
  }

  for (const influencerId of ids) {
    const rows = mentionsBy.get(influencerId) ?? []
    const aggregate = aggregateInfluencer(rows, "first")
    const allScores = scoreSnapshot(aggregateInfluencer(rows, "all"))
    const values = {
      influencerId,
      shillCount: aggregate.shillCount,
      postCount: postCounts.get(influencerId) ?? 0,
      uniqueTickers: aggregate.uniqueTickers,
      pricedCount: aggregate.pricedCount,
      winRate1h: aggregate.horizons["1h"].winRate,
      winRate24h: aggregate.horizons["24h"].winRate,
      winRate7d: aggregate.horizons["7d"].winRate,
      winRate30d: aggregate.horizons["30d"].winRate,
      winRateNow: aggregate.horizons.now.winRate,
      avgRoi1h: aggregate.horizons["1h"].avgRoi,
      avgRoi24h: aggregate.horizons["24h"].avgRoi,
      avgRoi7d: aggregate.horizons["7d"].avgRoi,
      avgRoi30d: aggregate.horizons["30d"].avgRoi,
      avgRoiNow: aggregate.horizons.now.avgRoi,
      medianRoi1h: aggregate.horizons["1h"].medianRoi,
      medianRoi24h: aggregate.horizons["24h"].medianRoi,
      medianRoi7d: aggregate.horizons["7d"].medianRoi,
      medianRoi30d: aggregate.horizons["30d"].medianRoi,
      medianRoiNow: aggregate.horizons.now.medianRoi,
      portfolio1h: aggregate.horizons["1h"].portfolio,
      portfolio24h: aggregate.horizons["24h"].portfolio,
      portfolio7d: aggregate.horizons["7d"].portfolio,
      portfolio30d: aggregate.horizons["30d"].portfolio,
      portfolioNow: aggregate.horizons.now.portfolio,
      portfolioN1h: aggregate.horizons["1h"].portfolioN,
      portfolioN24h: aggregate.horizons["24h"].portfolioN,
      portfolioN7d: aggregate.horizons["7d"].portfolioN,
      portfolioN30d: aggregate.horizons["30d"].portfolioN,
      portfolioNNow: aggregate.horizons.now.portfolioN,
      bestMentionId: aggregate.bestMentionId,
      worstMentionId: aggregate.worstMentionId,
      repeatAssets: aggregate.repeatAssets,
      pumpDumpCount: aggregate.pumpDumpCount,
      pumpDumpRate: aggregate.pumpDumpRate,
      avgPumpScore: aggregate.avgPumpScore,
      dumpRiskScore: aggregate.dumpRiskScore,
      credibilityScore: aggregate.credibilityScore,
      credibilityHorizon: aggregate.credibilityHorizon,
      sampleSize: aggregate.sampleSize,
      allScores,
      computedAt: new Date(),
    }
    await db
      .insert(influencerStats)
      .values(values)
      .onConflictDoUpdate({
        target: influencerStats.influencerId,
        set: values,
      })
  }

  return ids.size
}

export function scoreSnapshot(aggregate: InfluencerAggregate): ScoreSnapshot {
  return {
    pricedCount: aggregate.pricedCount,
    winRate1h: aggregate.horizons["1h"].winRate,
    winRate24h: aggregate.horizons["24h"].winRate,
    winRate7d: aggregate.horizons["7d"].winRate,
    winRate30d: aggregate.horizons["30d"].winRate,
    winRateNow: aggregate.horizons.now.winRate,
    avgRoi1h: aggregate.horizons["1h"].avgRoi,
    avgRoi24h: aggregate.horizons["24h"].avgRoi,
    avgRoi7d: aggregate.horizons["7d"].avgRoi,
    avgRoi30d: aggregate.horizons["30d"].avgRoi,
    avgRoiNow: aggregate.horizons.now.avgRoi,
    medianRoi1h: aggregate.horizons["1h"].medianRoi,
    medianRoi24h: aggregate.horizons["24h"].medianRoi,
    medianRoi7d: aggregate.horizons["7d"].medianRoi,
    medianRoi30d: aggregate.horizons["30d"].medianRoi,
    medianRoiNow: aggregate.horizons.now.medianRoi,
    portfolio1h: aggregate.horizons["1h"].portfolio,
    portfolio24h: aggregate.horizons["24h"].portfolio,
    portfolio7d: aggregate.horizons["7d"].portfolio,
    portfolio30d: aggregate.horizons["30d"].portfolio,
    portfolioNow: aggregate.horizons.now.portfolio,
    portfolioN1h: aggregate.horizons["1h"].portfolioN,
    portfolioN24h: aggregate.horizons["24h"].portfolioN,
    portfolioN7d: aggregate.horizons["7d"].portfolioN,
    portfolioN30d: aggregate.horizons["30d"].portfolioN,
    portfolioNNow: aggregate.horizons.now.portfolioN,
    bestMentionId: aggregate.bestMentionId,
    worstMentionId: aggregate.worstMentionId,
    pumpDumpCount: aggregate.pumpDumpCount,
    pumpDumpRate: aggregate.pumpDumpRate,
    avgPumpScore: aggregate.avgPumpScore,
    dumpRiskScore: aggregate.dumpRiskScore,
    credibilityScore: aggregate.credibilityScore,
    credibilityHorizon: aggregate.credibilityHorizon,
    sampleSize: aggregate.sampleSize,
  }
}
