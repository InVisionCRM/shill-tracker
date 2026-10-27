import { connection } from "next/server"
import { and, desc, eq, inArray, isNotNull, lt, ne, type SQL } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { influencers, mentions } from "@/lib/db/schema"

const MATCHES = ["exact", "nearest_candle", "nearest_daily_close"] as const

/**
 * Public read-only list of scored mentions, for audits.
 * Filters: username, symbol, status (price_status), match (exact | nearest_candle |
 * nearest_daily_close | approx = anything not exact), first (true = first call per ticker only),
 * before (ISO time cursor), limit (max 500).
 */
export async function GET(request: Request) {
  await connection()
  const url = new URL(request.url)
  const filters: SQL[] = [eq(mentions.pinned, false), eq(mentions.isDemo, false)]
  const username = url.searchParams.get("username")?.replace(/^@/, "").toLowerCase()
  if (username) filters.push(eq(influencers.username, username))
  const symbol = url.searchParams.get("symbol")?.replace(/^\$/, "").toUpperCase()
  if (symbol) filters.push(eq(mentions.symbol, symbol))
  const status = url.searchParams.get("status")
  if (status) filters.push(eq(mentions.priceStatus, status))
  const match = url.searchParams.get("match")
  if (match === "approx") {
    filters.push(isNotNull(mentions.priceMatch), ne(mentions.priceMatch, "exact"))
  } else if (match && (MATCHES as readonly string[]).includes(match)) {
    filters.push(eq(mentions.priceMatch, match))
  } else if (match) {
    return Response.json({ error: `match must be one of ${[...MATCHES, "approx"].join(", ")}` }, { status: 400 })
  }
  const kinds = url.searchParams.get("kind")
  if (kinds) filters.push(inArray(mentions.callKind, kinds.split(",")))
  const before = url.searchParams.get("before")
  if (before && !Number.isNaN(Date.parse(before))) filters.push(lt(mentions.createdAt, new Date(before)))
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 100) || 100, 1), 500)

  const rows = await getDb()
    .select({
      id: mentions.id,
      post_id: mentions.postId,
      username: influencers.username,
      symbol: mentions.symbol,
      asset_name: mentions.assetName,
      chain: mentions.chain,
      contract_address: mentions.contractAddress,
      call_kind: mentions.callKind,
      created_at: mentions.createdAt,
      price_status: mentions.priceStatus,
      price_source: mentions.priceSource,
      price_match: mentions.priceMatch,
      price_at_ts: mentions.priceAtTs,
      price_matches: mentions.priceMatches,
      asset_state: mentions.assetState,
      price_at: mentions.priceAt,
      price_1h: mentions.price1h,
      price_24h: mentions.price24h,
      price_7d: mentions.price7d,
      price_30d: mentions.price30d,
      price_now: mentions.priceNow,
      roi_1h: mentions.roi1h,
      roi_24h: mentions.roi24h,
      roi_7d: mentions.roi7d,
      roi_30d: mentions.roi30d,
      roi_now: mentions.roiNow,
      price_error: mentions.priceError,
    })
    .from(mentions)
    .innerJoin(influencers, eq(influencers.id, mentions.influencerId))
    .where(and(...filters))
    .orderBy(desc(mentions.createdAt))
    .limit(limit)
  const next = rows.length === limit ? rows[rows.length - 1].created_at.toISOString() : null
  return Response.json({ mentions: rows, next_before: next })
}
