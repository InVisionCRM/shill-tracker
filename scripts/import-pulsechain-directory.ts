import { Client } from "pg"
import { loadLocalEnv } from "../src/lib/env"

loadLocalEnv()

const BATCH = 500
const PULSEX_FACTORIES = [
  "0x29ea7545def87022badc76323f373ea1e707c523",
  "0x1715a3e4a142d8b698131108995174f37aeba10d",
]

type SourceRow = {
  pair_address: string
  factory: string | null
  amm: string | null
  created_block: string | number | null
  dex_id: string | null
  label: string | null
  base_address: string
  base_symbol: string | null
  base_name: string | null
  quote_address: string | null
  quote_symbol: string | null
  image_url: string | null
  price_usd: string | number | null
  market_cap: string | number | null
  fdv: string | number | null
  liquidity_usd: string | number | null
  pair_created_at: Date | string | null
  listed: boolean | null
  missing_since: Date | string | null
  updated_at: Date | string | null
}

const SELECT_SQL = `
  select pair_address, factory, amm, created_block, dex_id, label,
         base_address, base_symbol, base_name, quote_address, quote_symbol,
         image_url, price_usd, market_cap, fdv, liquidity_usd,
         pair_created_at, listed, missing_since, updated_at
  from screener_pairs
  where base_address is not null
    and btrim(base_address) <> ''
    and pair_address > $1
  order by pair_address
  limit $2
`

async function neonClient(): Promise<typeof Client> {
  const { Client: NeonClient, neonConfig } = await import("@neondatabase/serverless")
  const { default: ws } = await import("ws")
  neonConfig.webSocketConstructor = ws
  return NeonClient as unknown as typeof Client
}

async function main() {
  const sourceUrl = process.env.SOURCE_DATABASE_URL
  const destUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!sourceUrl) {
    throw new Error("SOURCE_DATABASE_URL is required. The app never reads that database.")
  }
  if (!destUrl) {
    throw new Error("DATABASE_URL is required. Set DATABASE_URL_UNPOOLED to write migrations and this import on Neon.")
  }
  if (endpoint(sourceUrl) === endpoint(destUrl)) {
    throw new Error("SOURCE_DATABASE_URL and the app database are the same. Refusing to write the seed.")
  }

  // DB_DRIVER=neon-ws talks to Neon over WebSocket on 443, for hosts that cannot reach port 5432.
  const ClientImpl = process.env.DB_DRIVER === "neon-ws" ? await neonClient() : Client
  const source = new ClientImpl({ connectionString: sourceUrl })
  const dest = new ClientImpl({ connectionString: destUrl })
  await source.connect()
  await dest.connect()
  const started = new Date()
  let copied = 0
  let sourceUpdatedAt: Date | null = null

  try {
    await sourceQuery(source, "set default_transaction_read_only = on")
    await sourceQuery(source, "begin read only")
    await dest.query("begin")

    let cursor = ""
    for (;;) {
      const result = await sourceQuery<SourceRow>(source, SELECT_SQL, [cursor, BATCH])
      if (!result.rows.length) break
      cursor = result.rows[result.rows.length - 1].pair_address
      await upsertPairs(dest, result.rows, started)
      copied += result.rows.length
      for (const row of result.rows) {
        const updated = row.updated_at ? new Date(row.updated_at) : null
        if (updated && (!sourceUpdatedAt || updated > sourceUpdatedAt)) sourceUpdatedAt = updated
      }
      if (result.rows.length < BATCH) break
    }

    if (copied === 0) {
      await dest.query("rollback")
      throw new Error("Source returned no enriched pairs. The local directory was left unchanged.")
    }

    await dest.query("delete from pulse_pairs where imported_at < $1", [started])
    const tokens = await refreshTokens(dest, started)
    await dest.query(
      `insert into pulse_directory (id, imported_at, source_updated_at, pair_count, token_count)
       values (1, $1, $2, $3, $4)
       on conflict (id) do update set
         imported_at = excluded.imported_at,
         source_updated_at = excluded.source_updated_at,
         pair_count = excluded.pair_count,
         token_count = excluded.token_count`,
      [started, sourceUpdatedAt, copied, tokens],
    )
    await dest.query("commit")
    await sourceQuery(source, "commit")
    console.log(
      JSON.stringify({
        ok: true,
        pairs: copied,
        tokens,
        sourceUpdatedAt: sourceUpdatedAt?.toISOString() ?? null,
      }),
    )
  } catch (error) {
    await dest.query("rollback").catch(() => undefined)
    await sourceQuery(source, "rollback").catch(() => undefined)
    throw error
  } finally {
    await source.end().catch(() => undefined)
    await dest.end().catch(() => undefined)
  }
}

function sourceQuery<T extends Record<string, unknown> = Record<string, unknown>>(
  client: Client,
  text: string,
  values: unknown[] = [],
) {
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, "").trim()
  if (!/^(select|set|begin|commit|rollback|show)\b/i.test(stripped)) {
    throw new Error("Refusing a non-read statement against SOURCE_DATABASE_URL")
  }
  if (/\b(insert|update|delete|drop|alter|truncate|create|grant|copy)\b/i.test(stripped)) {
    throw new Error("Refusing a write against SOURCE_DATABASE_URL")
  }
  return client.query<T>(text, values)
}

async function upsertPairs(dest: Client, rows: SourceRow[], importedAt: Date) {
  const columns = [
    "pair_address",
    "factory",
    "amm",
    "created_block",
    "dex_id",
    "label",
    "base_address",
    "base_symbol",
    "base_name",
    "quote_address",
    "quote_symbol",
    "image_url",
    "price_usd",
    "market_cap",
    "fdv",
    "liquidity_usd",
    "pair_created_at",
    "listed",
    "missing_since",
    "source_updated_at",
    "imported_at",
  ]
  const values: unknown[] = []
  const tuples = rows.map((row, index) => {
    const fields = [
      textOrNull(row.pair_address)?.toLowerCase() ?? null,
      textOrNull(row.factory)?.toLowerCase() ?? null,
      textOrNull(row.amm),
      numberOrNull(row.created_block),
      textOrNull(row.dex_id),
      textOrNull(row.label),
      textOrNull(row.base_address)?.toLowerCase() ?? null,
      symbolOrNull(row.base_symbol),
      nameOrNull(row.base_name),
      textOrNull(row.quote_address)?.toLowerCase() ?? null,
      symbolOrNull(row.quote_symbol),
      textOrNull(row.image_url),
      numberOrNull(row.price_usd),
      numberOrNull(row.market_cap),
      numberOrNull(row.fdv),
      numberOrNull(row.liquidity_usd),
      row.pair_created_at,
      row.listed,
      row.missing_since,
      row.updated_at,
      importedAt,
    ]
    values.push(...fields)
    const offset = index * columns.length
    return `(${columns.map((_, column) => `$${offset + column + 1}`).join(", ")})`
  })
  await dest.query(
    `insert into pulse_pairs (${columns.join(", ")})
     values ${tuples.join(", ")}
     on conflict (pair_address) do update set
       factory = excluded.factory,
       amm = excluded.amm,
       created_block = excluded.created_block,
       dex_id = excluded.dex_id,
       label = excluded.label,
       base_address = excluded.base_address,
       base_symbol = excluded.base_symbol,
       base_name = excluded.base_name,
       quote_address = excluded.quote_address,
       quote_symbol = excluded.quote_symbol,
       image_url = excluded.image_url,
       price_usd = excluded.price_usd,
       market_cap = excluded.market_cap,
       fdv = excluded.fdv,
       liquidity_usd = excluded.liquidity_usd,
       pair_created_at = excluded.pair_created_at,
       listed = excluded.listed,
       missing_since = excluded.missing_since,
       source_updated_at = excluded.source_updated_at,
       imported_at = excluded.imported_at`,
    values,
  )
}

async function refreshTokens(dest: Client, importedAt: Date) {
  await dest.query("delete from pulse_tokens")
  const factories = PULSEX_FACTORIES.map((factory) => `'${factory}'`).join(", ")
  const result = await dest.query(
    `insert into pulse_tokens (
       address, symbol, name, image_url, liquidity_usd, pair_count, live_pair_count,
       best_pair_address, best_pair_created_block, pulsex_pair_address, pulsex_created_block,
       missing_since, asset_state, source_updated_at, imported_at
     )
     select
       g.base_address,
       g.symbol,
       g.name,
       g.image_url,
       g.liquidity_usd,
       g.pair_count,
       g.live_pair_count,
       g.best_pair_address,
       g.best_pair_created_block,
       px.pair_address,
       px.created_block,
       case when g.live_pair_count = 0 then g.missing_since else null end,
       case when g.live_pair_count = 0 then 'dead' else null end,
       g.source_updated_at,
       $1
     from (
       select
         base_address,
         (array_agg(base_symbol order by coalesce(liquidity_usd, 0) desc, pair_address)
           filter (where base_symbol is not null and base_symbol <> ''))[1] as symbol,
         (array_agg(base_name order by coalesce(liquidity_usd, 0) desc, pair_address)
           filter (where base_name is not null and btrim(base_name) <> ''))[1] as name,
         (array_agg(image_url order by coalesce(liquidity_usd, 0) desc, pair_address)
           filter (where image_url is not null and image_url <> ''))[1] as image_url,
         coalesce(max(liquidity_usd) filter (where missing_since is null), 0) as liquidity_usd,
         count(*)::int as pair_count,
         count(*) filter (where missing_since is null and coalesce(liquidity_usd, 0) > 0)::int as live_pair_count,
         (array_agg(pair_address order by coalesce(liquidity_usd, 0) desc, pair_address)
           filter (where missing_since is null))[1] as best_pair_address,
         (array_agg(created_block order by coalesce(liquidity_usd, 0) desc, pair_address)
           filter (where missing_since is null))[1] as best_pair_created_block,
         min(missing_since) as missing_since,
         max(source_updated_at) as source_updated_at
       from pulse_pairs
       group by base_address
     ) g
     left join lateral (
       select p.pair_address, p.created_block
       from pulse_pairs p
       where p.base_address = g.base_address
         and lower(coalesce(p.amm, '')) = 'v2'
         and (
           lower(coalesce(p.dex_id, '')) = 'pulsex'
           or lower(coalesce(p.factory, '')) in (${factories})
         )
       order by
         case when p.missing_since is null and coalesce(p.liquidity_usd, 0) > 0 then 0 else 1 end,
         case when lower(coalesce(p.quote_symbol, '')) in ('wpls', 'pls', 'dai', 'usdc', 'usdt') then 0 else 1 end,
         coalesce(p.liquidity_usd, 0) desc,
         p.created_block asc nulls last
       limit 1
     ) px on true`,
    [importedAt],
  )
  return result.rowCount ?? 0
}

function endpoint(raw: string) {
  let url: URL
  try {
    url = new URL(raw.replace(/^postgres(ql)?:\/\//i, "http://"))
  } catch {
    throw new Error("A database URL could not be parsed. Nothing was copied.")
  }
  return `${url.host}${url.pathname}`.toLowerCase()
}

function textOrNull(value: unknown) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/** Spam tokens carry multi-kilobyte "symbols"; those are not tickers, and they break the btree index. */
function symbolOrNull(value: unknown) {
  const text = textOrNull(value)
  return text && text.length <= 32 ? text.toUpperCase() : null
}

function nameOrNull(value: unknown) {
  const text = textOrNull(value)
  return text ? text.slice(0, 200) : null
}

function numberOrNull(value: unknown) {
  if (value == null || value === "") return null
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
