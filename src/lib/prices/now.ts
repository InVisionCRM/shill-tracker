import { sql } from "drizzle-orm"
import { getDb } from "../db"
import { firstMentionIds } from "../scoring/call-rank"
import { dexChainId, fetchBinanceTickers, fetchCoingeckoSimple, fetchDexTokensOnChain } from "./history"
import { onchainSeries } from "./onchain"

/** Price-now refresh: one current price per token, shared by every first call of that token. */

type Token = {
  assetKey: string
  chain: string | null
  contract: string | null
  pair: string | null
  binance: string | null
  coingecko: string | null
}

export type NowSummary = {
  tokens: number
  priced: number
  bySource: Record<string, number>
  missing: number
  rowsUpdated: number
  stoppedBy: "done" | "budget"
  ms: number
}

const ONCHAIN_CONCURRENCY = 4
const STALE_MINUTES = 20
/** DexScreener pairs below this are dust; their quote is not trusted as the token's price. */
const MIN_LIQUIDITY_USD = 100
/** A move above +5,000% is only shown when the quote comes from a pool with at least this liquidity. */
const IMPLAUSIBLE_MOVE = 50
const IMPLAUSIBLE_MIN_LIQUIDITY_USD = 50_000

function resultRows<T>(result: unknown): T[] {
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows as T[]
  return Array.isArray(result) ? (result as T[]) : []
}

function chunk<T>(list: T[], size: number) {
  const out: T[][] = []
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size))
  return out
}

/** Tokens behind first calls that have a price at the shill and no fresh price now; never-priced first. */
export async function nowTokens(limit: number): Promise<Token[]> {
  const db = getDb()
  const result = await db.execute(sql`
    select
      asset_key,
      max(chain) as chain,
      max(case when contract_address like '0x%' then lower(contract_address) else contract_address end) as contract,
      max(lower(pair_address)) as pair,
      max(binance_symbol) as binance,
      max(coingecko_id) as coingecko,
      bool_or(price_now is null) as missing
    from mentions
    where id in (${firstMentionIds})
      and pinned = false
      and asset_key is not null
    group by asset_key
    having bool_or(price_now is null)
      or max(updated_at) < now() - (${STALE_MINUTES} * interval '1 minute')
    order by bool_or(price_now is null) desc, random()
    limit ${limit}
  `)
  return resultRows<{ asset_key: string; chain: string | null; contract: string | null; pair: string | null; binance: string | null; coingecko: string | null }>(result).map((row) => ({
    assetKey: row.asset_key,
    chain: row.chain,
    contract: row.contract,
    pair: row.pair,
    binance: row.binance,
    coingecko: row.coingecko,
  }))
}

/**
 * Free sources only. DexScreener's keyless tokens/v1 endpoint first (30 addresses per call, most liquid
 * pair per token). Then on-chain PulseX reserves for PulseChain tokens DexScreener does not list, and
 * Binance / keyless CoinGecko for majors that have no contract.
 */
export async function fetchNowPrices(tokens: Token[], deadline: number) {
  const prices = new Map<string, { price: number; source: string; liquidity: number | null }>()
  const left = () => deadline - Date.now()

  const byChain = new Map<string, Token[]>()
  for (const token of tokens) {
    const chainId = dexChainId(token.chain)
    if (!chainId || !token.contract) continue
    byChain.set(chainId, [...(byChain.get(chainId) ?? []), token])
  }
  for (const [chainId, list] of byChain) {
    for (const part of chunk(list, 30)) {
      if (left() < 3_000) break
      try {
        const best = await fetchDexTokensOnChain(chainId, [...new Set(part.map((token) => token.contract!))])
        for (const token of part) {
          const hit = best.get(token.contract!)
          // A dust pool is not a price (ROI Auditor C9); those fall through to on-chain or stay pending.
          if (hit && hit.liquidity >= MIN_LIQUIDITY_USD) prices.set(token.assetKey, { price: hit.price, source: "dexscreener", liquidity: hit.liquidity })
        }
      } catch {
        // 429s put the host in cooldown (fetchJson); the rest fall through to the sources below.
      }
    }
  }

  const pulse = tokens.filter((token) => !prices.has(token.assetKey) && token.chain === "pulsechain" && token.contract)
  const queue = [...pulse]
  const at = Date.now() - 60_000
  await Promise.all(
    Array.from({ length: Math.min(ONCHAIN_CONCURRENCY, queue.length) }, async () => {
      while (queue.length && left() > 4_000) {
        const token = queue.shift()!
        try {
          const candles = await onchainSeries({ token: token.contract!, net: "pulsechain", pair: token.pair, times: [at] })
          const last = candles.at(-1)
          if (last && last.p > 0) prices.set(token.assetKey, { price: last.p, source: "pulsex", liquidity: null })
        } catch {
          // No pair or RPC trouble: it stays pending.
        }
      }
    }),
  )

  const binance = tokens.filter((token) => !prices.has(token.assetKey) && token.binance)
  for (const part of chunk(binance, 100)) {
    if (left() < 3_000) break
    try {
      const rows = await fetchBinanceTickers(part.map((token) => token.binance!))
      const bySymbol = new Map<string, Token[]>()
      for (const token of part) bySymbol.set(token.binance!, [...(bySymbol.get(token.binance!) ?? []), token])
      for (const row of rows) {
        if (!Number.isFinite(row.price) || !(row.price > 0)) continue
        for (const token of bySymbol.get(row.symbol) ?? []) prices.set(token.assetKey, { price: row.price, source: "binance", liquidity: Number.POSITIVE_INFINITY })
      }
    } catch {
      // One unknown symbol fails the whole Binance batch; those tokens fall through to CoinGecko.
    }
  }

  const cg = tokens.filter((token) => !prices.has(token.assetKey) && token.coingecko)
  for (const part of chunk(cg, 100)) {
    if (left() < 3_000) break
    try {
      const rows = await fetchCoingeckoSimple(part.map((token) => token.coingecko!))
      const byId = new Map<string, Token[]>()
      for (const token of part) byId.set(token.coingecko!, [...(byId.get(token.coingecko!) ?? []), token])
      for (const row of rows) {
        if (row.price == null || !(row.price > 0)) continue
        for (const token of byId.get(row.id) ?? []) prices.set(token.assetKey, { price: row.price, source: "coingecko", liquidity: Number.POSITIVE_INFINITY })
      }
    } catch {
      // Keyless CoinGecko rate limits; the next pass retries.
    }
  }
  return prices
}

/** Writes price_now (and roi_now = price_now / price_at - 1) on every priced call of each token. */
export async function writeNowPrices(prices: Map<string, { price: number; liquidity?: number | null }>) {
  if (!prices.size) return 0
  const db = getDb()
  // ROI Auditor C9: a huge move off a thin pool is more likely the wrong token than a real move. Show
  // "price pending" for it instead of the number.
  const implausible = sql.raw(
    `(m.price_at > 0 and v.price / m.price_at - 1 > ${IMPLAUSIBLE_MOVE} and v.liquidity < ${IMPLAUSIBLE_MIN_LIQUIDITY_USD})`,
  )
  let updated = 0
  for (const part of chunk([...prices.entries()], 200)) {
    const values = sql.join(
      part.map(([key, row]) => {
        const liquidity = row.liquidity == null ? 0 : Number.isFinite(row.liquidity) ? row.liquidity : 1e15
        return sql`(${key}::text, ${row.price}::float8, ${liquidity}::float8)`
      }),
      sql`, `,
    )
    const result = await db.execute(sql`
      update mentions m
      set price_now = case when ${implausible} then null else v.price end,
          roi_now = case when ${implausible} then null when m.price_at > 0 then v.price / m.price_at - 1 else null end,
          updated_at = now()
      from (values ${values}) as v(asset_key, price, liquidity)
      where m.asset_key = v.asset_key
        and m.pinned = false
    `)
    updated += (result as { rowCount?: number }).rowCount ?? 0
  }
  return updated
}

export async function refreshNowPrices(options?: { budgetMs?: number; limit?: number }): Promise<NowSummary> {
  const started = Date.now()
  const deadline = started + (options?.budgetMs ?? 40_000)
  const tokens = await nowTokens(options?.limit ?? 600)
  const prices = await fetchNowPrices(tokens, deadline - 3_000)
  const rowsUpdated = await writeNowPrices(prices)
  const bySource: Record<string, number> = {}
  for (const row of prices.values()) bySource[row.source] = (bySource[row.source] ?? 0) + 1
  return {
    tokens: tokens.length,
    priced: prices.size,
    bySource,
    missing: tokens.length - prices.size,
    rowsUpdated,
    stoppedBy: Date.now() >= deadline - 3_500 ? "budget" : "done",
    ms: Date.now() - started,
  }
}
