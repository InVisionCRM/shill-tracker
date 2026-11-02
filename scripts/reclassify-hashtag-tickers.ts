/**
 * One-time backfill: two detection fixes landed after a lot of mentions already shipped.
 *
 * 1. Hashtags (#STFU, #Nature, #FactsAfterMidnight, #HEXisKing, …) are community tags, not tickers.
 *    They only ever resolve through a curated override (#Teddybear, #HEX); everything else is now
 *    rejected outright instead of sitting "pending" as a speculative cashtag. Re-runs identifyFast
 *    (the exact same logic ingest.ts uses) against every non-rejected hashtag mention's original
 *    post, with the influencer's real chain bias, so the result matches what a fresh ingest would do.
 * 2. $Bitcoin, $Ethereum, $Pulsechain, $Pulsex, … style cashtags (the asset's full name instead of
 *    its ticker) now canonicalize to the real symbol and hit the majors blocklist. Existing rows
 *    stored the literal spelled-out symbol, so they are found by name and flipped straight to
 *    rejected without needing the post text.
 *
 * Finds candidates with two cheap queries (no API calls), reclassifies in memory or by name, writes
 * back only the rows that change, then recomputes stats for just the touched influencers.
 *
 *   DATABASE_URL=... pnpm tsx scripts/reclassify-hashtag-tickers.ts
 *   DB_DRIVER=neon-ws DATABASE_URL=... pnpm tsx scripts/reclassify-hashtag-tickers.ts   # Neon over 443
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

function chunk<T>(list: T[], size: number) {
  const out: T[][] = []
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size))
  return out
}

type HashtagCandidate = {
  id: string
  post_id: string
  raw_text: string
  symbol: string | null
  match_key: string
  contract_address: string | null
  chain: string | null
  post_text: string
  created_at: string
  influencer_id: string
  chain_bias: string | null
}

async function reclassifyHashtags(db: ReturnType<typeof import("../src/lib/db").getDb>) {
  const { identifyFast } = await import("../src/lib/detect/extract")

  const candidates = await db.execute(sql`
    select m.id, m.post_id, m.raw_text, m.symbol, m.match_key, m.contract_address, m.chain,
           p.text as post_text, p.created_at, p.influencer_id, i.chain_bias
    from mentions m
    join posts p on p.id = m.post_id
    join influencers i on i.id = m.influencer_id
    where m.match_type = 'hashtag' and m.resolution_status <> 'rejected'
  `)
  const rows = candidates.rows as HashtagCandidate[]
  console.log(`hashtag candidates ${rows.length}`)

  const toReject: string[] = []
  const affectedInfluencers = new Set<string>()
  for (const row of rows) {
    const identified = identifyFast(
      {
        matchType: "hashtag",
        rawText: row.raw_text,
        symbol: row.symbol,
        contractAddress: row.contract_address,
        matchKey: row.match_key,
        chain: row.chain,
      },
      { chainBias: row.chain_bias, text: row.post_text, postedAt: new Date(row.created_at) },
    )
    if (identified.resolutionStatus === "rejected") {
      toReject.push(row.id)
      affectedInfluencers.add(row.influencer_id)
    }
  }

  let changed = 0
  for (const part of chunk(toReject, 300)) {
    const { mentions } = await import("../src/lib/db/schema")
    const result = await db
      .update(mentions)
      .set({
        resolutionStatus: "rejected",
        priceStatus: sql`case when price_status = 'pending' then 'excluded' else price_status end`,
        updatedAt: new Date(),
      })
      .where(inArray(mentions.id, part))
    changed += (result as { rowCount?: number }).rowCount ?? part.length
  }

  console.log(`hashtag mentions rejected ${changed}`)
  return affectedInfluencers
}

/** $Bitcoin, $Ethereum, $Pulsechain, $Pulsex, … stored literally under the spelled-out name. */
const NAME_CASHTAGS_OF_MAJORS: Record<string, string> = {
  BITCOIN: "BTC",
  ETHEREUM: "ETH",
  SOLANA: "SOL",
  DOGECOIN: "DOGE",
  CARDANO: "ADA",
  RIPPLE: "XRP",
  POLKADOT: "DOT",
  AVALANCHE: "AVAX",
  CHAINLINK: "LINK",
  LITECOIN: "LTC",
  PULSECHAIN: "PLS",
  PULSEX: "PLSX",
}

async function reclassifyNameCashtags(db: ReturnType<typeof import("../src/lib/db").getDb>) {
  const { mentions } = await import("../src/lib/db/schema")
  const { eq, and, ne } = await import("drizzle-orm")
  const affectedInfluencers = new Set<string>()
  let changed = 0

  for (const [name, symbol] of Object.entries(NAME_CASHTAGS_OF_MAJORS)) {
    const touched = await db
      .update(mentions)
      .set({
        symbol,
        resolutionStatus: "rejected",
        priceStatus: sql`case when price_status = 'pending' then 'excluded' else price_status end`,
        confidenceReason: sql`${`$${symbol} is a major or stablecoin. Those never count as a shill, however it was mentioned.`}`,
        updatedAt: new Date(),
      })
      .where(and(eq(mentions.matchType, "cashtag"), eq(mentions.symbol, name), ne(mentions.resolutionStatus, "rejected")))
      .returning({ influencerId: mentions.influencerId })
    for (const row of touched) affectedInfluencers.add(row.influencerId)
    changed += touched.length
  }

  console.log(`name-cashtag mentions rejected ${changed}`)
  return affectedInfluencers
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set")
  await installPool()
  const { getDb, getPool } = await import("../src/lib/db")
  const { recomputeInfluencers } = await import("../src/lib/stats")

  const db = getDb()
  const hashtagInfluencers = await reclassifyHashtags(db)
  const nameCashtagInfluencers = await reclassifyNameCashtags(db)

  const affected = new Set([...hashtagInfluencers, ...nameCashtagInfluencers])
  if (affected.size) {
    const count = await recomputeInfluencers([...affected])
    console.log(`recomputed stats for ${count} influencer(s)`)
  }
  await getPool().end()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
