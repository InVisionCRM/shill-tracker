export type QuoteDTO = {
  assetKey: string
  symbol: string
  name: string | null
  price: number
  change24h: number | null
  source: string
  updatedAt?: string
}

export type FeedDTO = {
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
  priceAtTs?: string | null
  pinned: boolean
  isDemo: boolean
  createdAt: string
  postId: string
  text: string
  username: string
  name: string
  imageUrl?: string | null
  profileImageUrl: string | null
  followersCount: number
  influencerDemo: boolean
}

/** All-mention score snapshot. Column scores on influencer_stats are first calls. */
export type ScoreSnapshot = {
  pricedCount: number
  winRate1h: number | null
  winRate24h: number | null
  winRate7d: number | null
  winRate30d: number | null
  winRateNow: number | null
  avgRoi1h: number | null
  avgRoi24h: number | null
  avgRoi7d: number | null
  avgRoi30d: number | null
  avgRoiNow: number | null
  medianRoi1h: number | null
  medianRoi24h: number | null
  medianRoi7d: number | null
  medianRoi30d: number | null
  medianRoiNow: number | null
  portfolio1h: number | null
  portfolio24h: number | null
  portfolio7d: number | null
  portfolio30d: number | null
  portfolioNow: number | null
  portfolioN1h: number
  portfolioN24h: number
  portfolioN7d: number
  portfolioN30d: number
  portfolioNNow: number
  bestMentionId: string | null
  worstMentionId: string | null
  pumpDumpCount: number
  pumpDumpRate: number | null
  avgPumpScore: number | null
  dumpRiskScore: number | null
  credibilityScore: number | null
  credibilityHorizon: string | null
  sampleSize: number
}

export type LeaderRow = {
  id: string
  username: string
  name: string
  profileImageUrl: string | null
  followersCount: number
  isDemo: boolean
  shillCount: number
  postCount: number
  uniqueTickers: number
  pricedCount: number
  winRate24h: number | null
  winRate7d: number | null
  medianRoi24h: number | null
  medianRoi7d: number | null
  portfolio7d: number | null
  portfolioN7d: number
  portfolioNow: number | null
  portfolioNNow: number
  pumpDumpCount: number
  pumpDumpRate: number | null
  dumpRiskScore: number | null
  credibilityScore: number | null
  credibilityHorizon: string | null
  sampleSize: number
  repeatAssets: number
  allScores: ScoreSnapshot | null
  sparkline?: number[]
}

export type PricingProgress = {
  /** Headline counts: first calls while any first call is still unpriced, then repeats. */
  priced: number
  total: number
  pending: number
  phase: "first" | "repeat" | "done"
  firstPriced: number
  firstTotal: number
  allPriced: number
  allTotal: number
}

export type PositionDTO = {
  id: string
  symbol: string | null
  assetName: string | null
  assetKey: string | null
  createdAt: string
  priceAt: number | null
  pinned: boolean
  priceSource: string | null
  pumpDumpFlag: boolean
  roi1h: number | null
  roi24h: number | null
  roi7d: number | null
  roi30d: number | null
  roiNow: number | null
  isFirstCall?: boolean
}
