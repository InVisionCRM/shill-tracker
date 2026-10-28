import { clamp } from "../format"

/**
 * Weights are the methodology. The /methodology page renders these numbers.
 * Do not duplicate them in the UI as literals.
 */
export const WEIGHTS = {
  prePump24hFloor: 0.05,
  prePump24hCeil: 0.8,
  prePump24hPoints: 45,
  prePump7dFloor: 0.15,
  prePump7dCeil: 2,
  prePump7dPoints: 40,
  postDumpFloor: 0.05,
  postDumpCeil: 0.55,
  postDumpPoints: 40,
  earlyDumpPoints: 20,
  volumeDistributeRatio: 1.4,
  volumeDistributePoints: 15,
  volumeVanishRatio: 0.55,
  volumeVanishPoints: 10,
  volumePreRunup24h: 0.1,
  volumePreRunup7d: 0.3,
  volumePostRoi: -0.05,
  flagScore: 62,
  flagRunup24h: 0.25,
  flagRoi24h: -0.15,
  flagRunup7d: 0.6,
  flagRoiAfter: -0.2,
  candleGapMs: 36 * 60 * 60 * 1000,
  excursionWindowMs: 30 * 24 * 60 * 60 * 1000,
  credibilityWinPoints: 40,
  credibilityMedianPoints: 30,
  credibilityCleanPoints: 20,
  credibilitySamplePoints: 10,
  credibilityMedianFloor: -0.4,
  credibilityMedianCeil: 0.4,
  credibilitySamplePrior: 8,
  dumpRatePoints: 55,
  dumpAvgScorePoints: 25,
  dumpPainPoints: 20,
  dumpPainFloor: -0.05,
  dumpPainCeil: 0.35,
  dumpSamplePrior: 3,
  dumpPriorScore: 35,
  minSampleForPreferredHorizon: 3,
} as const

export type Candle = { t: number; p: number; v: number }

export type EvaluatedCall = {
  priceAt: number | null
  price1h: number | null
  price24h: number | null
  price7d: number | null
  price30d: number | null
  priceNow: number | null
  price24hBefore: number | null
  price7dBefore: number | null
  roi1h: number | null
  roi24h: number | null
  roi7d: number | null
  roi30d: number | null
  roiNow: number | null
  maxGain: number | null
  maxDrawdown: number | null
  maxPriceAfter: number | null
  minPriceAfter: number | null
  volumeBefore24h: number | null
  volumeAfter24h: number | null
  runup24h: number | null
  runup7d: number | null
  pumpDumpScore: number | null
  pumpDumpFlag: boolean
  pumpDumpReasons: string[]
  priceStatus: "partial" | "ready" | "unavailable" | "unverifiable"
  /** Worst match among the entry and settled horizons. Null when no price was found. */
  priceMatch: PriceMatch | null
  /** Timestamp (ms) of the candle actually used as the entry price. */
  priceAtTs: number | null
  priceMatches: Partial<Record<MatchSlot, { m: PriceMatch; ts: number }>>
}

export type PriceMatch = "exact" | "nearest_candle" | "nearest_daily_close"
export type MatchSlot = "at" | "1h" | "24h" | "7d" | "30d" | "now"
const MATCH_RANK: Record<PriceMatch, number> = { exact: 0, nearest_candle: 1, nearest_daily_close: 2 }

/** Within 65 minutes of the target is the hourly candle that covers it. 12h or more is a daily close. */
export function matchTypeFor(gapMs: number): PriceMatch {
  const abs = Math.abs(gapMs)
  if (abs <= 65 * 60 * 1000) return "exact"
  if (abs >= 12 * 60 * 60 * 1000) return "nearest_daily_close"
  return "nearest_candle"
}

/** A dead or rugged asset is -100% from the first real entry. No entry means unverifiable. */
export function applyAssetState(
  evaluated: EvaluatedCall,
  assetState: "dead" | "rugged" | null | undefined,
): EvaluatedCall {
  if (assetState !== "dead" && assetState !== "rugged") return evaluated
  if (evaluated.priceAt == null) {
    return {
      ...evaluated,
      priceNow: null,
      roiNow: null,
      pumpDumpScore: null,
      pumpDumpFlag: false,
      pumpDumpReasons: [],
      priceStatus: "unverifiable",
    }
  }
  return {
    ...evaluated,
    priceNow: 0,
    roiNow: -1,
    priceStatus: evaluated.priceStatus === "unavailable" ? "partial" : evaluated.priceStatus,
  }
}

const HOUR = 60 * 60 * 1000

export function ramp(value: number, floor: number, ceil: number) {
  if (value <= floor) return 0
  if (value >= ceil) return 1
  return (value - floor) / (ceil - floor)
}

export function priceAt(candles: Candle[], time: number) {
  return priceAtDetail(candles, time)?.p ?? null
}

export function priceAtDetail(candles: Candle[], time: number): { p: number; t: number } | null {
  if (!candles.length) return null
  let low = 0
  let high = candles.length - 1
  let found = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (candles[mid].t <= time) {
      found = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  if (found < 0) return null
  if (time - candles[found].t > WEIGHTS.candleGapMs) return null
  return { p: candles[found].p, t: candles[found].t }
}

/**
 * Entry price at the post time. Candles carry their close, so the open of the candle that contains the
 * post is the previous candle's close. A post in the last sixth of its candle takes that candle's close.
 * Exact means minute-level data; hourly candles are nearest_candle and daily ones nearest_daily_close.
 */
export function entryAtDetail(candles: Candle[], time: number): { p: number; t: number; m: PriceMatch } | null {
  if (!candles.length) return null
  let low = 0
  let high = candles.length - 1
  let found = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (candles[mid].t <= time) {
      found = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  if (found < 0) return null
  const containing = candles[found]
  const next = candles[found + 1]
  const prev = candles[found - 1]
  const spacing = next ? next.t - containing.t : prev ? containing.t - prev.t : null
  if (spacing == null || spacing <= 0) return null
  const offset = time - containing.t
  // A gap: no candle we have contains the post.
  if (offset >= spacing) return null
  const m: PriceMatch = spacing <= 2 * 60 * 1000 ? "exact" : spacing < 12 * 60 * 60 * 1000 ? "nearest_candle" : "nearest_daily_close"
  if (offset >= (spacing * 5) / 6) return { p: containing.p, t: containing.t + spacing, m }
  if (!prev || containing.t - prev.t > spacing * 1.5) return null
  return { p: prev.p, t: containing.t, m }
}

function roi(entry: number | null, exit: number | null) {
  if (entry == null || exit == null || entry === 0) return null
  return exit / entry - 1
}

function sumVolume(candles: Candle[], from: number, to: number) {
  let total = 0
  let any = false
  for (const candle of candles) {
    if (candle.t > from && candle.t <= to) {
      total += candle.v
      any = true
    }
  }
  return any ? total : null
}

export function pumpDumpFromMoves(input: {
  runup24h: number | null
  runup7d: number | null
  roi1h: number | null
  roi24h: number | null
  roi7d: number | null
  volumeBefore24h: number | null
  volumeAfter24h: number | null
}) {
  const reasons: string[] = []
  if (input.runup24h == null && input.runup7d == null) {
    return {
      score: null as number | null,
      flag: false,
      reasons: ["Not enough pre-call history to judge whether the chart was already pumped."],
    }
  }

  const pre24 =
    input.runup24h == null
      ? 0
      : ramp(input.runup24h, WEIGHTS.prePump24hFloor, WEIGHTS.prePump24hCeil) *
        WEIGHTS.prePump24hPoints
  const pre7 =
    input.runup7d == null
      ? 0
      : ramp(input.runup7d, WEIGHTS.prePump7dFloor, WEIGHTS.prePump7dCeil) *
        WEIGHTS.prePump7dPoints
  const pre = Math.max(pre24, pre7)
  if (pre >= 12) {
    const lead = (input.runup24h ?? 0) >= (input.runup7d ?? 0) / 3 ? input.runup24h : input.runup7d
    const window = lead === input.runup24h ? "24h" : "7d"
    reasons.push(
      `Price had already run ${formatPct(lead)} in the ${window} before the post.`,
    )
  }

  const later = [input.roi24h, input.roi7d].filter((value): value is number => value != null)
  let dumpPoints = 0
  if (later.length) {
    const worst = Math.min(...later)
    dumpPoints = ramp(-worst, WEIGHTS.postDumpFloor, WEIGHTS.postDumpCeil) * WEIGHTS.postDumpPoints
    if (worst < -0.08) {
      reasons.push(`After the post the worst settled horizon was ${formatPct(worst)}.`)
    }
  } else if (input.roi1h != null && input.roi1h < 0) {
    dumpPoints =
      ramp(-input.roi1h, WEIGHTS.postDumpFloor, WEIGHTS.postDumpCeil) * WEIGHTS.earlyDumpPoints
    if (input.roi1h < -0.05) {
      reasons.push(`Only the 1h print is in, and it is already ${formatPct(input.roi1h)}.`)
    }
  }

  let volumePoints = 0
  if (
    input.volumeBefore24h != null &&
    input.volumeAfter24h != null &&
    input.volumeBefore24h > 0
  ) {
    const ratio = input.volumeAfter24h / input.volumeBefore24h
    const prePositive =
      (input.runup24h ?? 0) > WEIGHTS.volumePreRunup24h ||
      (input.runup7d ?? 0) > WEIGHTS.volumePreRunup7d
    const postNegative = Math.min(input.roi24h ?? 0, input.roi7d ?? 0) < WEIGHTS.volumePostRoi
    if (prePositive && postNegative && ratio >= WEIGHTS.volumeDistributeRatio) {
      volumePoints = WEIGHTS.volumeDistributePoints
      reasons.push("Volume stayed elevated while price gave back the move (distribution).")
    } else if (prePositive && postNegative && ratio <= WEIGHTS.volumeVanishRatio) {
      volumePoints = WEIGHTS.volumeVanishPoints
      reasons.push("Volume dried up after the post and price slipped (air pocket).")
    }
  }

  const score = Math.round(clamp(pre + dumpPoints + volumePoints, 0, 100))
  const classic24 =
    input.runup24h != null &&
    input.roi24h != null &&
    input.runup24h >= WEIGHTS.flagRunup24h &&
    input.roi24h <= WEIGHTS.flagRoi24h
  const after = input.roi7d ?? input.roi24h
  const classic7 =
    input.runup7d != null &&
    after != null &&
    input.runup7d >= WEIGHTS.flagRunup7d &&
    after <= WEIGHTS.flagRoiAfter
  const flag = score >= WEIGHTS.flagScore || classic24 || classic7
  if (flag && reasons.length === 0) {
    reasons.push("Pre-call run-up plus a negative post-call return cleared the flag threshold.")
  }
  if (!flag && reasons.length === 0) {
    reasons.push("No classic pump-then-dump signature on the horizons that have printed.")
  }
  return { score, flag, reasons }
}

function formatPct(value: number | null) {
  if (value == null) return "n/a"
  const pct = value * 100
  const sign = pct > 0 ? "+" : ""
  return `${sign}${pct.toFixed(0)}%`
}

export function evaluateCall(input: {
  postedAt: number
  now?: number
  candles: Candle[]
}): EvaluatedCall {
  const now = input.now ?? Date.now()
  const postedAt = input.postedAt
  const candles = [...input.candles].sort((a, b) => a.t - b.t)
  const priceMatches: EvaluatedCall["priceMatches"] = {}
  const detail = (slot: MatchSlot, time: number) => {
    const hit = priceAtDetail(candles, time)
    if (!hit) return null
    priceMatches[slot] = { m: matchTypeFor(time - hit.t), ts: hit.t }
    return hit.p
  }
  const entryHit = entryAtDetail(candles, postedAt)
  if (entryHit) priceMatches.at = { m: entryHit.m, ts: entryHit.t }
  const entry = entryHit?.p ?? null

  const due = (ms: number) => now >= postedAt + ms
  const at = (slot: MatchSlot, ms: number) => (due(ms) ? detail(slot, postedAt + ms) : null)

  const price1h = at("1h", HOUR)
  const price24h = at("24h", 24 * HOUR)
  const price7d = at("7d", 7 * 24 * HOUR)
  const price30d = at("30d", 30 * 24 * HOUR)
  const priceNow = detail("now", now)
  const price24hBefore = priceAt(candles, postedAt - 24 * HOUR)
  const price7dBefore = priceAt(candles, postedAt - 7 * 24 * HOUR)

  const roi1h = roi(entry, price1h)
  const roi24h = roi(entry, price24h)
  const roi7d = roi(entry, price7d)
  const roi30d = roi(entry, price30d)
  const roiNow = roi(entry, priceNow)
  const runup24h = roi(price24hBefore, entry)
  const runup7d = roi(price7dBefore, entry)

  const excursionEnd = Math.min(now, postedAt + WEIGHTS.excursionWindowMs)
  const after = candles.filter((candle) => candle.t > postedAt && candle.t <= excursionEnd)
  let maxPriceAfter: number | null = null
  let minPriceAfter: number | null = null
  for (const candle of after) {
    maxPriceAfter = maxPriceAfter == null ? candle.p : Math.max(maxPriceAfter, candle.p)
    minPriceAfter = minPriceAfter == null ? candle.p : Math.min(minPriceAfter, candle.p)
  }
  const maxGain = roi(entry, maxPriceAfter)
  const maxDrawdown = roi(entry, minPriceAfter)

  const volumeBefore24h = sumVolume(candles, postedAt - 24 * HOUR, postedAt)
  const volumeAfter24h = due(24 * HOUR)
    ? sumVolume(candles, postedAt, postedAt + 24 * HOUR)
    : null

  const pump = pumpDumpFromMoves({
    runup24h,
    runup7d,
    roi1h,
    roi24h,
    roi7d,
    volumeBefore24h,
    volumeAfter24h,
  })

  const dueChecks: Array<[boolean, number | null]> = [
    [due(HOUR), price1h],
    [due(24 * HOUR), price24h],
    [due(7 * 24 * HOUR), price7d],
    [due(30 * 24 * HOUR), price30d],
  ]
  let priceStatus: EvaluatedCall["priceStatus"] = "ready"
  if (entry == null) priceStatus = "unavailable"
  else if (dueChecks.some(([isDue, price]) => isDue && price == null)) priceStatus = "partial"

  return {
    priceAt: entry,
    price1h,
    price24h,
    price7d,
    price30d,
    priceNow,
    price24hBefore,
    price7dBefore,
    roi1h,
    roi24h,
    roi7d,
    roi30d,
    roiNow,
    maxGain,
    maxDrawdown,
    maxPriceAfter,
    minPriceAfter,
    volumeBefore24h,
    volumeAfter24h,
    runup24h,
    runup7d,
    pumpDumpScore: pump.score,
    pumpDumpFlag: pump.flag,
    pumpDumpReasons: pump.reasons,
    priceStatus,
    priceMatch: worstMatch(priceMatches),
    priceAtTs: priceMatches.at?.ts ?? null,
    priceMatches,
  }
}

function worstMatch(matches: EvaluatedCall["priceMatches"]): PriceMatch | null {
  let worst: PriceMatch | null = null
  for (const slot of ["at", "1h", "24h", "7d", "30d"] as const) {
    const hit = matches[slot]
    if (!hit) continue
    if (worst == null || MATCH_RANK[hit.m] > MATCH_RANK[worst]) worst = hit.m
  }
  return worst
}

export function downsample(candles: Candle[], max = 220) {
  if (candles.length <= max) return candles
  const step = (candles.length - 1) / (max - 1)
  const out: Candle[] = []
  for (let index = 0; index < max; index += 1) {
    out.push(candles[Math.round(index * step)])
  }
  return out
}
