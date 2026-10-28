import type { FeedDTO, LeaderRow, ScoreSnapshot } from "./types"

type FeedRow = {
  id: string
  symbol: string | null
  assetName: string | null
  assetKey: string | null
  rawText: string
  matchType: string
  confidence: string
  callKind?: string | null
  assetState?: string | null
  resolutionConfidence?: string | null
  priceAt: number | null
  priceNow: number | null
  roi1h: number | null
  roi24h: number | null
  roi7d: number | null
  roiNow: number | null
  pumpDumpFlag: boolean
  pumpDumpScore: number | null
  priceStatus: string
  priceSource: string | null
  priceMatch?: string | null
  priceAtTs?: Date | null
  repeatCount?: number | null
  pinned: boolean
  isDemo: boolean
  createdAt: Date
  postId: string
  text: string
  username: string
  name: string
  imageUrl?: string | null
  profileImageUrl: string | null
  followersCount: number
  influencerDemo: boolean
}

export function toFeed(row: FeedRow): FeedDTO {
  return { ...row, createdAt: row.createdAt.toISOString(), priceAtTs: row.priceAtTs ? row.priceAtTs.toISOString() : null }
}

type LeaderSource = {
  id: string
  username: string
  name: string
  profileImageUrl: string | null
  followersCount: number
  isDemo: boolean
  shillCount: number | null
  postCount: number | null
  uniqueTickers: number | null
  pricedCount: number | null
  winRate24h: number | null
  winRate7d: number | null
  medianRoi24h: number | null
  medianRoi7d: number | null
  portfolio7d: number | null
  portfolioN7d: number | null
  portfolioNow: number | null
  portfolioNNow: number | null
  pumpDumpCount: number | null
  pumpDumpRate: number | null
  dumpRiskScore: number | null
  credibilityScore: number | null
  credibilityHorizon: string | null
  sampleSize: number | null
  repeatAssets: number | null
  allScores: ScoreSnapshot | null
}

export function toLeader(row: LeaderSource): LeaderRow {
  return {
    ...row,
    shillCount: row.shillCount ?? 0,
    postCount: row.postCount ?? 0,
    uniqueTickers: row.uniqueTickers ?? 0,
    pricedCount: row.pricedCount ?? 0,
    portfolioN7d: row.portfolioN7d ?? 0,
    portfolioNNow: row.portfolioNNow ?? 0,
    pumpDumpCount: row.pumpDumpCount ?? 0,
    sampleSize: row.sampleSize ?? 0,
    repeatAssets: row.repeatAssets ?? 0,
    allScores: row.allScores ?? null,
  }
}
