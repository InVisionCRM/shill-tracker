import { sql } from "drizzle-orm"

/**
 * Ticker identity for "first call": the resolved asset (chain + contract, or a CoinGecko id for majors),
 * so 2020 Ethereum HEX and PulseChain HEX are separate tokens. Before resolution, the cashtag without its
 * $ and in upper case. Must match assetGroupKey() in aggregate.ts.
 */
function tickerKey(alias?: string) {
  const c = (column: string) => (alias ? `${alias}.${column}` : column)
  return `coalesce(
    nullif(${c("asset_key")}, ''),
    case when nullif(ltrim(btrim(${c("symbol")}), '$'), '') is not null then 'sym:' || upper(ltrim(btrim(${c("symbol")}), '$')) end,
    ${c("id")}::text
  )`
}

/** Same post time: a priced row, then a resolved one, then the smaller id, so the pick is stable. */
function tieBreak(alias?: string) {
  const c = (column: string) => (alias ? `${alias}.${column}` : column)
  return `${c("created_at")} asc, (${c("price_at")} is not null) desc, (${c("resolution_status")} = 'resolved') desc, ${c("id")} asc`
}

export const assetPartition = sql.raw(tickerKey())

/**
 * 1 = this voice's earliest call of the ticker. Callers rank over `call_kind = 'call'` rows only,
 * so retro brags never count as a first shill.
 */
export const callRankWindow = sql.raw(`row_number() over (
  partition by influencer_id, ${tickerKey()}
  order by ${tieBreak()}
)`)

/**
 * Ids of each voice's FIRST call of each ticker (earliest post; ties go to a priced, then resolved row). Retro brags and
 * other non-call mentions never count as a first shill and are not listed.
 * Every list and every score uses only these rows: a ticker shows once per voice, at its first shill.
 * Evaluated at query time, so later ingests and backfills of older posts re-rank automatically.
 * Use as `${mentions.id} in (${firstMentionIds})`.
 */
export const firstMentionIds = sql.raw(`select distinct on (fm.influencer_id, ${tickerKey("fm")})
  fm.id
  from mentions fm
  where fm.call_kind = 'call'
  order by fm.influencer_id, ${tickerKey("fm")}, ${tieBreak("fm")}`)

/** Later calls of the same (voice, ticker) as mention row `alias`; shown as "mentioned N more times". */
export function repeatCountFor(alias: string) {
  return sql.raw(`(select count(*)::int - 1 from mentions rm
    where rm.influencer_id = ${alias}.influencer_id and rm.call_kind = 'call'
      and ${tickerKey("rm")} = ${tickerKey(alias)})`)
}
