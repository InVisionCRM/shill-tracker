import { and, eq, inArray, sql } from "drizzle-orm"
import { getDb } from "../db"
import { candleDays } from "../db/schema"
import type { Candle } from "../scoring/evaluate"

const DAY = 24 * 60 * 60 * 1000

export function dayKey(ms: number) {
  return new Date(ms).toISOString().slice(0, 10)
}

export function dayStart(day: string) {
  return Date.parse(`${day}T00:00:00.000Z`)
}

/** Inclusive UTC days from `fromMs` through `toMs`. */
export function daysCovering(fromMs: number, toMs: number) {
  const days: string[] = []
  let cursor = dayStart(dayKey(fromMs))
  const end = dayStart(dayKey(toMs))
  while (cursor <= end && days.length < 800) {
    days.push(dayKey(cursor))
    cursor += DAY
  }
  return days
}

export function windowDays(postedAt: number, now = Date.now()) {
  const from = postedAt - 8 * DAY
  const to = Math.min(now, postedAt + 30 * DAY)
  return daysCovering(from, to)
}

/** First contiguous run of missing days, capped so one API call stays inside rate limits. */
export function firstGap(missing: string[], maxDays: number) {
  if (!missing.length) return []
  const sorted = [...missing].sort()
  const gap = [sorted[0]]
  for (let index = 1; index < sorted.length && gap.length < maxDays; index += 1) {
    const prev = dayStart(sorted[index - 1])
    const next = dayStart(sorted[index])
    if (next - prev !== DAY) break
    gap.push(sorted[index])
  }
  return gap
}

export function splitByDay(candles: Candle[]) {
  const byDay = new Map<string, Candle[]>()
  for (const candle of candles) {
    const day = dayKey(candle.t)
    const list = byDay.get(day) ?? []
    list.push(candle)
    byDay.set(day, list)
  }
  return byDay
}

export async function cachedDays(assetKey: string, days: string[]) {
  if (!days.length) return new Set<string>()
  const db = getDb()
  const rows = await db
    .select({ day: candleDays.day })
    .from(candleDays)
    .where(and(eq(candleDays.assetKey, assetKey), inArray(candleDays.day, days)))
  return new Set(rows.map((row) => row.day))
}

export async function loadCandles(assetKey: string, days: string[]) {
  if (!days.length) return [] as Candle[]
  const db = getDb()
  const rows = await db
    .select({ candles: candleDays.candles })
    .from(candleDays)
    .where(and(eq(candleDays.assetKey, assetKey), inArray(candleDays.day, days)))
  const merged: Candle[] = []
  for (const row of rows) merged.push(...(row.candles ?? []))
  merged.sort((a, b) => a.t - b.t)
  return merged
}

export async function storeDays(
  assetKey: string,
  days: string[],
  candles: Candle[],
  source: string,
) {
  const db = getDb()
  const byDay = splitByDay(candles)
  const now = new Date()
  if (!days.length) return
  await db
    .insert(candleDays)
    .values(
      days.map((day) => ({
        assetKey,
        day,
        candles: byDay.get(day) ?? [],
        source,
        fetchedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [candleDays.assetKey, candleDays.day],
      set: { candles: sql`excluded.candles`, source, fetchedAt: now },
    })
}
