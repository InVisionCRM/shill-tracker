/**
 * One-time backfill: re-run classifyPost's junk-list rule against posts that already carry 4+
 * distinct first-call tickers. The rule is new, so any post that already shipped as `call_kind =
 * 'call'` before this change never got a chance to be classified as a roll call. Finds candidates
 * with one cheap grouped query (no API calls), reclassifies in memory, writes back only the rows
 * that change, then recomputes stats for just the touched influencers.
 *
 *   DATABASE_URL=... pnpm tsx scripts/reclassify-junk-lists.ts
 *   DB_DRIVER=neon-ws DATABASE_URL=... pnpm tsx scripts/reclassify-junk-lists.ts   # Neon over 443
 */
import { inArray, sql } from "drizzle-orm"
import { loadLocalEnv } from "../src/lib/env"

loadLocalEnv()

async function installPool() {
  if (process.env.DB_DRIVER !== "neon-ws") return
  const { Pool: NeonPool, neonConfig } = await import("@neondatabase/serverless")
  const { default: ws } = await import("ws")
  neonConfig.webSocketConstructor = ws
  const pool = new NeonPool({ connectionString: process.env.DATABASE_URL, max: 5 })
  ;(globalThis as unknown as { pool?: unknown }).pool = pool
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set")
  await installPool()
  const { getDb, getPool } = await import("../src/lib/db")
  const { posts } = await import("../src/lib/db/schema")
  const { classifyPost } = await import("../src/lib/detect/context")
  const { recomputeInfluencers } = await import("../src/lib/stats")

  const db = getDb()
  const candidates = await db.execute(sql`
    select m.post_id
    from mentions m
    where m.call_kind = 'call' and m.symbol is not null
    group by m.post_id
    having count(distinct upper(m.symbol)) >= 4
  `)
  const postIds = (candidates.rows as { post_id: string }[]).map((row) => row.post_id)
  console.log(`candidates ${postIds.length}`)

  let postsChanged = 0
  let mentionsChanged = 0
  const affectedInfluencers = new Set<string>()

  for (const part of chunk(postIds, 300)) {
    const rows = await db
      .select({ id: posts.id, text: posts.text, influencerId: posts.influencerId })
      .from(posts)
      .where(inArray(posts.id, part))
    for (const post of rows) {
      const { kind } = classifyPost(post.text)
      if (kind === "call") continue
      const result = await db.execute(sql`
        update mentions
        set call_kind = ${kind},
            price_status = case when price_status = 'pending' then 'excluded' else price_status end,
            updated_at = now()
        where post_id = ${post.id} and call_kind = 'call'
      `)
      const changed = (result as { rowCount?: number }).rowCount ?? 0
      if (changed > 0) {
        postsChanged += 1
        mentionsChanged += changed
        affectedInfluencers.add(post.influencerId)
      }
    }
  }

  console.log(`posts reclassified ${postsChanged}, mentions touched ${mentionsChanged}`)
  if (affectedInfluencers.size) {
    const count = await recomputeInfluencers([...affectedInfluencers])
    console.log(`recomputed stats for ${count} influencer(s)`)
  }
  await getPool().end()
}

function chunk<T>(list: T[], size: number) {
  const out: T[][] = []
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size))
  return out
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
