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
  pinned: boolean
  isDemo: boolean
  createdAt: string
  postId: string
  text: string
  username: string
  name: string
  profileImageUrl: string | null
  followersCount: number
  influencerDemo: boolean
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
}
