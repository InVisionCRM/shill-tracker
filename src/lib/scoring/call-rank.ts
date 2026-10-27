import { sql } from "drizzle-orm"

/** Same identity as assetGroupKey(): asset key, else uppercased symbol, else the mention id. */
export const assetPartition = sql.raw(`coalesce(
  asset_key,
  case
    when symbol is not null and symbol <> '' then 'sym:' || upper(symbol)
    else id::text
  end
)`)

/**
 * 1 = this voice's earliest mention of the asset.
 * The window runs over every mention, including ones that are already priced,
 * so a repeat does not become rank 1 after the first call leaves the queue.
 * Partition key matches assetGroupKey() in aggregate.ts.
 */
export const callRankWindow = sql.raw(`row_number() over (
  partition by influencer_id, coalesce(
    asset_key,
    case
      when symbol is not null and symbol <> '' then 'sym:' || upper(symbol)
      else id::text
    end
  )
  order by created_at asc, id asc
)`)
