import { average, median } from "../format"
import { countsTowardScore } from "../detect/kinds"
import { WEIGHTS, ramp } from "./evaluate"

export type ScoreMode = "first" | "all"

export type StatMention = {
  id: string
  assetKey: string | null
  symbol: string | null
  createdAt: number
  roi1h: number | null
  roi24h: number | null
  roi7d: number | null
  roi30d: number | null
  roiNow: number | null
  pumpDumpFlag: boolean
  pumpDumpScore: number | null
  priceAt: number | null
  callKind?: string | null
  resolutionStatus?: string | null
  priceStatus?: string | null
}

/** Asset identity for "first call" grouping. Nameless rows stay their own group. */
export function assetGroupKey(mention: {
  id: string
  assetKey: string | null
  symbol: string | null
}) {
  if (mention.assetKey) return mention.assetKey
  if (mention.symbol) return `sym:${mention.symbol.toUpperCase()}`
  return mention.id
}

/** Earliest mention of each asset. Same timestamp breaks toward the smaller id. */
export function firstCalls<T extends { id: string; assetKey: string | null; symbol: string | null; createdAt: number }>(
  mentions: T[],
): T[] {
  const best = new Map<string, T>()
  for (const mention of mentions) {
    const key = assetGroupKey(mention)
    const current = best.get(key)
    if (
      !current ||
      mention.createdAt < current.createdAt ||
      (mention.createdAt === current.createdAt && mention.id < current.id)
    ) {
      best.set(key, mention)
    }
  }
  return [...best.values()]
}

export type HorizonStats = {
  winRate: number | null
  avgRoi: number | null
  medianRoi: number | null
  portfolio: number | null
  portfolioN: number
}

export type InfluencerAggregate = {
  shillCount: number
  uniqueTickers: number
  pricedCount: number
  horizons: Record<"1h" | "24h" | "7d" | "30d" | "now", HorizonStats>
  bestMentionId: string | null
  worstMentionId: string | null
  repeatAssets: number
  pumpDumpCount: number
  pumpDumpRate: number | null
  avgPumpScore: number | null
  dumpRiskScore: number | null
  credibilityScore: number | null
  credibilityHorizon: "1h" | "24h" | "7d" | "30d" | "now" | null
  sampleSize: number
}

const HORIZON_KEYS = ["1h", "24h", "7d", "30d", "now"] as const

function roiFor(mention: StatMention, horizon: (typeof HORIZON_KEYS)[number]) {
  if (horizon === "1h") return mention.roi1h
  if (horizon === "24h") return mention.roi24h
  if (horizon === "7d") return mention.roi7d
  if (horizon === "30d") return mention.roi30d
  return mention.roiNow
}

function horizonStats(values: number[]): HorizonStats {
  const wins = values.filter((value) => value > 0).length
  return {
    winRate: values.length ? wins / values.length : null,
    avgRoi: average(values),
    medianRoi: median(values),
    portfolio: values.length ? values.reduce((sum, value) => sum + 100 * (1 + value), 0) : null,
    portfolioN: values.length,
  }
}

function primaryRoi(mention: StatMention) {
  return mention.roi7d ?? mention.roi24h ?? mention.roiNow ?? mention.roi1h ?? mention.roi30d
}

export function aggregateInfluencer(
  mentions: StatMention[],
  mode: ScoreMode = "first",
): InfluencerAggregate {
  const eligible = mentions.filter((mention) => countsTowardScore(mention))
  const scored = mode === "all" ? eligible : firstCalls(eligible)
  const horizons = {
    "1h": horizonStats(nums(scored, "1h")),
    "24h": horizonStats(nums(scored, "24h")),
    "7d": horizonStats(nums(scored, "7d")),
    "30d": horizonStats(nums(scored, "30d")),
    now: horizonStats(nums(scored, "now")),
  }

  const chosen = chooseCredibilityHorizon(horizons)
  const sample = chosen ? horizons[chosen] : null
  const n = sample?.portfolioN ?? 0

  const pumpScored = scored.filter((mention) => mention.pumpDumpScore != null)
  const pumpDumpCount = scored.filter((mention) => mention.pumpDumpFlag).length
  const pumpDumpRate = pumpScored.length ? pumpDumpCount / pumpScored.length : null
  const avgPumpScore = average(
    pumpScored.map((mention) => mention.pumpDumpScore).filter((value): value is number => value != null),
  )

  let credibilityScore: number | null = null
  let dumpRiskScore: number | null = null
  if (sample && n > 0 && sample.winRate != null && sample.medianRoi != null) {
    const winPts = sample.winRate * WEIGHTS.credibilityWinPoints
    const medPts =
      ramp(sample.medianRoi, WEIGHTS.credibilityMedianFloor, WEIGHTS.credibilityMedianCeil) *
      WEIGHTS.credibilityMedianPoints
    const cleanPts = (1 - (pumpDumpRate ?? 0.35)) * WEIGHTS.credibilityCleanPoints
    const samplePts = (n / (n + WEIGHTS.credibilitySamplePrior)) * WEIGHTS.credibilitySamplePoints
    credibilityScore = clampScore(winPts + medPts + cleanPts + samplePts)

    const ratePts = (pumpDumpRate ?? 0) * WEIGHTS.dumpRatePoints
    const avgPts = ((avgPumpScore ?? 0) / 100) * WEIGHTS.dumpAvgScorePoints
    const painPts =
      ramp(-sample.medianRoi, WEIGHTS.dumpPainFloor, WEIGHTS.dumpPainCeil) * WEIGHTS.dumpPainPoints
    const raw = ratePts + avgPts + painPts
    const weight = n / (n + WEIGHTS.dumpSamplePrior)
    dumpRiskScore = clampScore(
      raw * weight + WEIGHTS.dumpPriorScore * (1 - weight),
    )
  }

  const ranked = scored
    .map((mention) => ({ mention, roi: primaryRoi(mention) }))
    .filter((row): row is { mention: StatMention; roi: number } => row.roi != null)
    .sort((a, b) => b.roi - a.roi)

  const keys = new Map<string, number>()
  for (const mention of eligible) {
    if (!mention.assetKey && !mention.symbol) continue
    const key = assetGroupKey(mention)
    keys.set(key, (keys.get(key) ?? 0) + 1)
  }

  return {
    shillCount: eligible.length,
    uniqueTickers: keys.size,
    pricedCount: scored.filter((mention) => mention.priceAt != null).length,
    horizons,
    bestMentionId: ranked[0]?.mention.id ?? null,
    worstMentionId: ranked.at(-1)?.mention.id ?? null,
    repeatAssets: [...keys.values()].filter((count) => count > 1).length,
    pumpDumpCount,
    pumpDumpRate,
    avgPumpScore,
    dumpRiskScore,
    credibilityScore,
    credibilityHorizon: chosen,
    sampleSize: n,
  }
}

function chooseCredibilityHorizon(
  horizons: InfluencerAggregate["horizons"],
): InfluencerAggregate["credibilityHorizon"] {
  for (const key of ["7d", "24h", "1h"] as const) {
    if (horizons[key].portfolioN >= WEIGHTS.minSampleForPreferredHorizon) return key
  }
  const ranked = (["7d", "24h", "1h"] as const).slice().sort(
    (a, b) => horizons[b].portfolioN - horizons[a].portfolioN,
  )
  if (horizons[ranked[0]].portfolioN > 0) return ranked[0]
  if (horizons.now.portfolioN > 0) return "now"
  return null
}

function nums(mentions: StatMention[], horizon: (typeof HORIZON_KEYS)[number]) {
  return mentions
    .map((mention) => roiFor(mention, horizon))
    .filter((value): value is number => value != null && Number.isFinite(value))
}

function clampScore(value: number) {
  return Math.round(Math.max(0, Math.min(100, value)) * 10) / 10
}

export function equityCurve(
  mentions: { createdAt: number; roi: number | null }[],
) {
  const stake = 100
  let equity = 0
  let deployed = 0
  const points: { t: number; equity: number; deployed: number }[] = []
  const ordered = [...mentions]
    .filter((mention) => mention.roi != null)
    .sort((a, b) => a.createdAt - b.createdAt)
  for (const mention of ordered) {
    deployed += stake
    equity += stake * (mention.roi as number)
    points.push({ t: mention.createdAt, equity, deployed })
  }
  return { points, equity, deployed, positions: ordered.length }
}
