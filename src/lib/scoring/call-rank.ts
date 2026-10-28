import { sql } from "drizzle-orm"

/**
 * Ticker identity for "first call": the uppercased cashtag when there is one, else the resolved asset key,
 * else the mention itself. Symbol comes first on purpose: resolution can attach an asset key to one row and
 * not another, and a key-first identity would then split one ticker into two "first calls".
 * Must match assetGroupKey() in aggregate.ts.
 */
function tickerKey(alias?: string) {
  const c = (column: string) => (alias ? `${alias}.${column}` : column)
  return `coalesce(
    case when ${c("symbol")} is not null and ${c("symbol")} <> '' then 'sym:' || upper(${c("symbol")}) end,
    ${c("asset_key")},
    ${c("id")}::text
  )`
}

export const assetPartition = sql.raw(tickerKey())

/**
 * 1 = this voice's earliest call of the ticker. Callers rank over `call_kind = 'call'` rows only,
 * so retro brags never count as a first shill.
 */
export const callRankWindow = sql.raw(`row_number() over (
  partition by influencer_id, ${tickerKey()}
  order by created_at asc, id asc
)`)

/**
 * Ids of each voice's FIRST call of each ticker (earliest post, ties to the smaller id). Retro brags and
 * other non-call mentions never count as a first shill and are not listed.
 * Every list and every score uses only these rows: a ticker shows once per voice, at its first shill.
 * Evaluated at query time, so later ingests and backfills of older posts re-rank automatically.
 * Use as `${mentions.id} in (${firstMentionIds})`.
 */
export const firstMentionIds = sql.raw(`select distinct on (fm.influencer_id, ${tickerKey("fm")})
  fm.id
  from mentions fm
  where fm.call_kind = 'call'
  order by fm.influencer_id, ${tickerKey("fm")}, fm.created_at asc, fm.id asc`)

/** Later calls of the same (voice, ticker) as mention row `alias`; shown as "mentioned N more times". */
export function repeatCountFor(alias: string) {
  return sql.raw(`(select count(*)::int - 1 from mentions rm
    where rm.influencer_id = ${alias}.influencer_id and rm.call_kind = 'call'
      and ${tickerKey("rm")} = ${tickerKey(alias)})`)
}
