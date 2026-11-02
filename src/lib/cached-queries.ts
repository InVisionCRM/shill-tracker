import { cacheLife } from "next/cache"
import * as q from "./queries"

/**
 * Read-side queries for pages and public APIs, cached for a few minutes per server instance.
 * The first-call `distinct on` scans are the heaviest work this site does. Running them on every
 * page load and every live poll kept the free Neon compute awake and used up its monthly quota.
 * /api/live reads ./queries directly behind a 2-minute CDN cache.
 * Ingest, cron, and scripts import ./queries directly and always read fresh data.
 */
const PROFILE = { stale: 60, revalidate: 300, expire: 3600 }

export async function getFeed(limit = 40) {
  "use cache"
  cacheLife(PROFILE)
  return q.getFeed(limit)
}

export async function getLeaderboard() {
  "use cache"
  cacheLife(PROFILE)
  return q.getLeaderboard()
}

export async function getInfluencer(username: string) {
  "use cache"
  cacheLife(PROFILE)
  return q.getInfluencer(username)
}

export async function getTicker(symbol: string) {
  "use cache"
  cacheLife(PROFILE)
  return q.getTicker(symbol)
}

export async function getMention(id: string) {
  "use cache"
  cacheLife(PROFILE)
  return q.getMention(id)
}

export async function getDockTokens(limit = 300) {
  "use cache"
  cacheLife(PROFILE)
  return q.getDockTokens(limit)
}
