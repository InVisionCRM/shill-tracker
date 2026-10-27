import { connection } from "next/server"
import { desc, eq, sql } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { cronRuns } from "@/lib/db/schema"
import { requireBearer } from "@/lib/http"

export const maxDuration = 20

const TABLES = [
  "influencers",
  "posts",
  "mentions",
  "influencer_stats",
  "candle_days",
  "quotes",
  "api_cache",
  "pulse_pairs",
  "pulse_tokens",
  "cron_runs",
] as const

function rowsOf<T>(result: unknown): T[] {
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows as T[]
  return Array.isArray(result) ? (result as T[]) : []
}

/** Operational health. Bearer CRON_SECRET. Returns counts and sizes only, never connection details. */
export async function GET(request: Request) {
  await connection()
  const denied = requireBearer(request, "CRON_SECRET")
  if (denied) return denied
  const db = getDb()
  const [size] = rowsOf<{ bytes: string | number }>(
    await db.execute(sql`select pg_database_size(current_database()) as bytes`),
  )
  const counts: Record<string, number> = {}
  for (const table of TABLES) {
    const [row] = rowsOf<{ n: string | number }>(await db.execute(sql.raw(`select count(*)::bigint as n from "${table}"`)))
    counts[table] = Number(row?.n ?? 0)
  }
  const queue = rowsOf<{ price_status: string; resolution_status: string; n: string | number }>(
    await db.execute(sql`
      select price_status, resolution_status, count(*)::bigint as n
      from mentions
      where call_kind = 'call' and pinned = false
      group by 1, 2
    `),
  )
  const pricing = { pending_resolution: 0, pending_price: 0, priced: 0, partial: 0, unverifiable: 0, unavailable: 0, dead: 0 }
  for (const row of queue) {
    const n = Number(row.n)
    if (row.price_status === "ready") pricing.priced += n
    else if (row.price_status === "partial") pricing.partial += n
    else if (row.price_status === "unverifiable") pricing.unverifiable += n
    else if (row.price_status === "unavailable") pricing.unavailable += n
    else if (row.resolution_status === "pending") pricing.pending_resolution += n
    else pricing.pending_price += n
  }
  const [dead] = rowsOf<{ n: string | number }>(
    await db.execute(sql`select count(*)::bigint as n from mentions where asset_state in ('dead', 'rugged') and call_kind = 'call'`),
  )
  pricing.dead = Number(dead?.n ?? 0)
  const matches = rowsOf<{ price_match: string | null; n: string | number }>(
    await db.execute(sql`select price_match, count(*)::bigint as n from mentions where price_at is not null group by 1`),
  )
  const [last] = await db
    .select({ startedAt: cronRuns.startedAt, finishedAt: cronRuns.finishedAt, ok: cronRuns.ok, detail: cronRuns.detail })
    .from(cronRuns)
    .where(eq(cronRuns.job, "prices"))
    .orderBy(desc(cronRuns.startedAt))
    .limit(1)
  const detail = (last?.detail ?? null) as Record<string, unknown> | null
  return Response.json({
    now: new Date().toISOString(),
    database_bytes: Number(size?.bytes ?? 0),
    database_mb: Math.round((Number(size?.bytes ?? 0) / 1024 / 1024) * 10) / 10,
    rows: counts,
    pricing,
    price_match: Object.fromEntries(matches.map((row) => [row.price_match ?? "unknown", Number(row.n)])),
    last_price_run: last
      ? {
          started_at: last.startedAt,
          finished_at: last.finishedAt,
          ok: last.ok,
          summary: detail?.summary ?? null,
          error: typeof detail?.error === "string" ? detail.error.slice(0, 300) : null,
        }
      : null,
  })
}
