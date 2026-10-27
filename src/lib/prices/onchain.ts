import type { Candle } from "../scoring/evaluate"

/**
 * Batched on-chain pricing through the free public PulseChain RPC.
 *
 * PulseChain forked Ethereum at block 17,233,000, and rpc.pulsechain.com keeps full archive state,
 * so blocks before the fork are real Ethereum mainnet state. That lets one free endpoint price:
 *   - PulseChain tokens from PulseX reserves (blocks after the fork), and
 *   - Ethereum tokens from Uniswap V2 reserves (blocks before the fork).
 * Every price is read from reserves at a real block. Nothing is interpolated or estimated.
 */

const RPC_URL = process.env.PULSECHAIN_RPC_URL || "https://rpc.pulsechain.com"
export const FORK_BLOCK = 17_233_000

export const WPLS = "0xa1077a294dde1b09bb078844df40758a5d0f9a27"
const WPLS_USDC_PAIR = "0x6753560538eca67617a9ce605178f788be7e524e"
export const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
/** Uniswap V2 USDC/WETH on Ethereum. Valid only for pre-fork blocks. */
const WETH_USDC_PAIR = "0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc"

/** Stablecoins that are worth $1 on Ethereum (pre-fork blocks). */
const ETH_STABLES = new Set([
  "0x6b175474e89094c44da98b954eedeac495271d0f",
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "0xdac17f958d2ee523a2206206994597c13d831ec7",
])
/**
 * Stablecoins that are worth $1 on PulseChain (post-fork blocks). These are the bridged
 * tokens. The forked copies of Ethereum DAI/USDC/USDT (pDAI and friends) are NOT $1.
 */
const PULSE_STABLES = new Set([
  "0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07",
  "0xefd766ccb38eaf1dfd701853bfce31359239f305",
  "0x0cb6f5a34ad42ec934882a05265a7d5f59b51a2f",
])

const PULSEX_FACTORIES = [
  "0x29ea7545def87022badc76323f373ea1e707c523",
  "0x1715a3e4a142d8b698131108995174f37aeba10d",
]
const UNISWAP_V2_FACTORY = "0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f"

const SEL_TOKEN0 = "0x0dfe1681"
const SEL_TOKEN1 = "0xd21220a7"
const SEL_RESERVES = "0x0902f1ac"
const SEL_DECIMALS = "0x313ce567"
const SEL_GET_PAIR = "0xe6a43905"

export type OnchainNet = "pulsechain" | "ethereum"

type Call = { method: string; params: unknown[] }

export function isStableAt(token: string, block: number) {
  return block < FORK_BLOCK ? ETH_STABLES.has(token) : PULSE_STABLES.has(token)
}

let rpcCalls = 0
export function onchainCallCount() {
  return rpcCalls
}

/** JSON-RPC batch with backoff on 429 and 5xx. Archive misses come back as null, never as a guess. */
export async function rpcBatch<T = unknown>(calls: Call[], chunk = 40): Promise<(T | null)[]> {
  const out: (T | null)[] = []
  for (let start = 0; start < calls.length; start += chunk) {
    const slice = calls.slice(start, start + chunk)
    const body = slice.map((call, index) => ({ jsonrpc: "2.0", id: index, method: call.method, params: call.params }))
    type Reply = { id: number; result?: T; error?: { message?: string } }
    let parsed: Reply[] | null = null
    let lastError = ""
    for (let attempt = 0; attempt < 4 && !parsed; attempt += 1) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 15_000)
      try {
        rpcCalls += 1
        const response = await fetch(RPC_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
        if (response.status === 429 || response.status >= 500) {
          lastError = `${response.status} from pulsechain rpc`
          await new Promise((resolve) => setTimeout(resolve, 600 * 2 ** attempt))
          continue
        }
        if (!response.ok) throw new Error(`${response.status} from pulsechain rpc`)
        const json = (await response.json()) as Reply[] | { error?: { message?: string } }
        if (!Array.isArray(json)) throw new Error(`pulsechain rpc: ${json?.error?.message ?? "bad batch reply"}`)
        parsed = json
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        if (attempt === 3) break
        await new Promise((resolve) => setTimeout(resolve, 600 * 2 ** attempt))
      } finally {
        clearTimeout(timer)
      }
    }
    if (!parsed) throw new Error(lastError || "pulsechain rpc failed")
    const byId = new Map(parsed.map((row) => [row.id, row]))
    for (let index = 0; index < slice.length; index += 1) {
      const row = byId.get(index)
      out.push(row && !row.error && row.result != null ? (row.result as T) : null)
    }
  }
  return out
}

function hex(value: number) {
  return "0x" + Math.max(0, Math.floor(value)).toString(16)
}

function pad(address: string) {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0")
}

function call(to: string, data: string, block: number | "latest"): Call {
  return { method: "eth_call", params: [{ to, data }, block === "latest" ? "latest" : hex(block)] }
}

// ---------- blocks ----------

type Anchor = { block: number; ts: number }
let anchors: Anchor[] | null = null
let anchorsAt = 0

async function loadAnchors() {
  if (anchors && Date.now() - anchorsAt < 60_000) return anchors
  const [head] = await rpcBatch<string>([{ method: "eth_blockNumber", params: [] }])
  const headNumber = head ? parseInt(head, 16) : 23_000_000
  const numbers = [1, 4_000_000, 7_000_000, 10_000_000, 12_000_000, 15_537_394, FORK_BLOCK - 1, FORK_BLOCK + 50_000, headNumber]
  const headers = await rpcBatch<{ timestamp?: string }>(
    numbers.map((number) => ({ method: "eth_getBlockByNumber", params: [hex(number), false] })),
  )
  const next: Anchor[] = []
  numbers.forEach((block, index) => {
    const ts = headers[index]?.timestamp
    if (ts) next.push({ block, ts: parseInt(ts, 16) })
  })
  next.sort((a, b) => a.block - b.block)
  anchors = next
  anchorsAt = Date.now()
  return next
}

function estimate(list: Anchor[], ts: number) {
  if (!list.length) return null
  if (ts <= list[0].ts) return list[0].block
  for (let index = 1; index < list.length; index += 1) {
    const a = list[index - 1]
    const b = list[index]
    if (ts <= b.ts) {
      return Math.round(a.block + ((ts - a.ts) / Math.max(1, b.ts - a.ts)) * (b.block - a.block))
    }
  }
  return list[list.length - 1].block
}

const blockCache = new Map<number, number>()
/** Real chain timestamp (seconds) of the block chosen for each target time. Candles use this, never the target. */
const blockTimeCache = new Map<number, number>()

export function blockTimeFor(ts: number) {
  return blockTimeCache.get(ts) ?? null
}

/** Block at or just before each unix timestamp, found with two batched correction rounds. */
export async function blocksAt(timestamps: number[]) {
  const list = await loadAnchors()
  const head = list[list.length - 1]
  const result = new Map<number, number>()
  let todo = [...new Set(timestamps)].filter((ts) => {
    const cached = blockCache.get(ts)
    if (cached != null) result.set(ts, cached)
    return cached == null
  })
  const guesses = new Map<number, number>()
  for (const ts of todo) {
    if (head && ts >= head.ts) {
      result.set(ts, head.block)
      blockTimeCache.set(ts, head.ts)
      continue
    }
    const guess = estimate(list, ts)
    if (guess != null) guesses.set(ts, guess)
  }
  todo = [...guesses.keys()]
  for (let round = 0; round < 3 && todo.length; round += 1) {
    const headers = await rpcBatch<{ timestamp?: string }>(
      todo.map((ts) => ({ method: "eth_getBlockByNumber", params: [hex(guesses.get(ts)!), false] })),
    )
    const again: number[] = []
    todo.forEach((ts, index) => {
      const guess = guesses.get(ts)!
      const stamp = headers[index]?.timestamp
      if (!stamp) return
      const actual = parseInt(stamp, 16)
      const delta = ts - actual
      const spacing = guess < 15_537_394 ? 13 : guess < FORK_BLOCK ? 12 : 10
      if (Math.abs(delta) <= spacing * 2 || round === 2) {
        // Use the block we actually fetched, with its real timestamp. When the last round is still far
        // off, the gap shows up in the candle time and the evaluator labels it nearest_candle, not exact.
        result.set(ts, guess)
        blockCache.set(ts, guess)
        blockTimeCache.set(ts, actual)
      } else {
        guesses.set(ts, Math.max(1, guess + Math.round(delta / spacing)))
        again.push(ts)
      }
    })
    todo = again
  }
  return result
}

// ---------- pairs ----------

type PairMeta = { pair: string; token0: string; token1: string; decimals0: number; decimals1: number }
const pairMetaCache = new Map<string, PairMeta | null>()
const findPairCache = new Map<string, string | null>()

async function pairMeta(pairs: string[]) {
  const missing = [...new Set(pairs.map((pair) => pair.toLowerCase()))].filter((pair) => !pairMetaCache.has(pair))
  if (missing.length) {
    const tokens = await rpcBatch<string>(
      missing.flatMap((pair) => [call(pair, SEL_TOKEN0, "latest"), call(pair, SEL_TOKEN1, "latest")]),
    )
    const addrs = new Set<string>()
    const raw = missing.map((pair, index) => {
      const t0 = tokens[index * 2]
      const t1 = tokens[index * 2 + 1]
      const token0 = typeof t0 === "string" && t0.length >= 42 ? "0x" + t0.slice(-40).toLowerCase() : null
      const token1 = typeof t1 === "string" && t1.length >= 42 ? "0x" + t1.slice(-40).toLowerCase() : null
      if (token0) addrs.add(token0)
      if (token1) addrs.add(token1)
      return { pair, token0, token1 }
    })
    const decs = await tokenDecimals([...addrs])
    for (const row of raw) {
      if (!row.token0 || !row.token1) {
        pairMetaCache.set(row.pair, null)
        continue
      }
      pairMetaCache.set(row.pair, {
        pair: row.pair,
        token0: row.token0,
        token1: row.token1,
        decimals0: decs.get(row.token0) ?? 18,
        decimals1: decs.get(row.token1) ?? 18,
      })
    }
  }
  return new Map(pairs.map((pair) => [pair.toLowerCase(), pairMetaCache.get(pair.toLowerCase()) ?? null]))
}

const decimalsCache = new Map<string, number>()
async function tokenDecimals(tokens: string[]) {
  const missing = tokens.filter((token) => !decimalsCache.has(token))
  if (missing.length) {
    const rows = await rpcBatch<string>(missing.map((token) => call(token, SEL_DECIMALS, "latest")))
    missing.forEach((token, index) => {
      const value = rows[index]
      const parsed = typeof value === "string" && value !== "0x" ? Number(BigInt(value)) : 18
      decimalsCache.set(token, Number.isFinite(parsed) && parsed >= 0 && parsed <= 36 ? parsed : 18)
    })
  }
  return new Map(tokens.map((token) => [token, decimalsCache.get(token) ?? 18]))
}

/** First existing pair for token against the anchors, across the given factories. */
async function findPairs(token: string, anchorsList: string[], factories: string[]) {
  const key = `${token}|${anchorsList.join(",")}|${factories.join(",")}`
  if (findPairCache.has(key)) return findPairCache.get(key) ?? null
  const calls = factories.flatMap((factory) =>
    anchorsList.map((anchor) => call(factory, SEL_GET_PAIR + pad(token) + pad(anchor), "latest")),
  )
  const rows = await rpcBatch<string>(calls)
  let found: string | null = null
  for (const row of rows) {
    if (typeof row !== "string" || row.length < 42) continue
    const address = "0x" + row.slice(-40).toLowerCase()
    if (!/^0x0+$/.test(address)) {
      found = address
      break
    }
  }
  findPairCache.set(key, found)
  return found
}

function ratio(numerator: bigint, decN: number, denominator: bigint, decD: number) {
  if (denominator === BigInt(0)) return null
  // price of 1 unit of denominator token in numerator token units
  const scale = BigInt(10) ** BigInt(18)
  const num = numerator * BigInt(10) ** BigInt(decD) * scale
  const den = denominator * BigInt(10) ** BigInt(decN)
  return Number(num / den) / 1e18
}

function decodeReserves(raw: string | null) {
  if (typeof raw !== "string" || raw.length < 2 + 64 * 2) return null
  return { r0: BigInt("0x" + raw.slice(2, 66)), r1: BigInt("0x" + raw.slice(66, 130)) }
}

/** Price of `target` in units of the other token of the pair. */
function sidePrice(meta: PairMeta, reserves: { r0: bigint; r1: bigint }, target: string) {
  if (meta.token0 === target) return ratio(reserves.r1, meta.decimals1, reserves.r0, meta.decimals0)
  if (meta.token1 === target) return ratio(reserves.r0, meta.decimals0, reserves.r1, meta.decimals1)
  return null
}

export class OnchainUnverifiable extends Error {
  readonly unverifiable = true
  constructor(message: string) {
    super(message)
    this.name = "UnverifiablePriceError"
  }
}

/**
 * USD prices for one token at many timestamps, read from reserves in batched RPC calls.
 * `net` decides which blocks are valid: Ethereum is only priced before the fork.
 */
export async function onchainSeries(input: {
  token: string
  net: OnchainNet
  pair?: string | null
  times: number[]
}): Promise<Candle[]> {
  const token = input.token.toLowerCase()
  const seconds = [...new Set(input.times.map((time) => Math.floor(time / 1000)))]
  const blocks = await blocksAt(seconds)
  const usable = seconds
    .map((ts) => ({ ts, block: blocks.get(ts) }))
    .filter((row): row is { ts: number; block: number } => row.block != null)
    .filter((row) => (input.net === "ethereum" ? row.block < FORK_BLOCK : row.block >= FORK_BLOCK))
  if (!usable.length) return []

  const native = input.net === "ethereum" ? WETH : WPLS
  const nativeUsdPair = input.net === "ethereum" ? WETH_USDC_PAIR : WPLS_USDC_PAIR
  const factories = input.net === "ethereum" ? [UNISWAP_V2_FACTORY] : PULSEX_FACTORIES
  const stables = input.net === "ethereum" ? [...ETH_STABLES] : [...PULSE_STABLES]
  let pair = input.pair?.toLowerCase() ?? null
  if (pair) {
    const meta = (await pairMeta([pair])).get(pair)
    if (!meta || (meta.token0 !== token && meta.token1 !== token)) pair = null
  }
  if (!pair) pair = await findPairs(token, [native, ...stables], factories)
  if (!pair) throw new OnchainUnverifiable(`No ${input.net === "ethereum" ? "Uniswap V2" : "PulseX"} pair for this token. Not estimated.`)
  const meta = (await pairMeta([pair, nativeUsdPair])).get(pair)
  const nativeMeta = pairMetaCache.get(nativeUsdPair) ?? null
  if (!meta || !nativeMeta) throw new Error("pair metadata unavailable from pulsechain rpc")
  const quote = meta.token0 === token ? meta.token1 : meta.token0
  let hopPair: string | null = null
  let hopMeta: PairMeta | null = null
  const quoteIsStable = input.net === "ethereum" ? ETH_STABLES.has(quote) : PULSE_STABLES.has(quote)
  if (!quoteIsStable && quote !== native) {
    hopPair = await findPairs(quote, [native, ...stables], factories)
    if (hopPair) hopMeta = (await pairMeta([hopPair])).get(hopPair) ?? null
  }

  const calls: Call[] = []
  for (const row of usable) {
    calls.push(call(pair, SEL_RESERVES, row.block))
    calls.push(call(nativeUsdPair, SEL_RESERVES, row.block))
    if (hopPair) calls.push(call(hopPair, SEL_RESERVES, row.block))
  }
  const results = await rpcBatch<string>(calls)
  const per = hopPair ? 3 : 2
  const candles: Candle[] = []
  usable.forEach((row, index) => {
    const main = decodeReserves(results[index * per])
    const nativeRes = decodeReserves(results[index * per + 1])
    if (!main) return
    const inQuote = sidePrice(meta, main, token)
    if (inQuote == null) return
    const nativeUsd = nativeRes ? sidePrice(nativeMeta, nativeRes, native) : null
    let quoteUsd: number | null = null
    if (quoteIsStable) quoteUsd = 1
    else if (quote === native) quoteUsd = nativeUsd
    else if (hopMeta) {
      const hopRes = decodeReserves(results[index * per + 2])
      if (hopRes) {
        const hopOther = hopMeta.token0 === quote ? hopMeta.token1 : hopMeta.token0
        const inOther = sidePrice(hopMeta, hopRes, quote)
        const otherUsd = isStableAt(hopOther, row.block) ? 1 : hopOther === native ? nativeUsd : null
        quoteUsd = inOther != null && otherUsd != null ? inOther * otherUsd : null
      }
    }
    if (quoteUsd == null) return
    const price = inQuote * quoteUsd
    if (!Number.isFinite(price) || price <= 0) return
    const real = blockTimeFor(row.ts)
    if (real == null) return
    candles.push({ t: real * 1000, p: price, v: 0 })
  })
  return candles.sort((a, b) => a.t - b.t)
}

export function sampleTimes(postedAt: number, now = Date.now()) {
  const hour = 60 * 60 * 1000
  const day = 24 * hour
  return [
    postedAt - 7 * day,
    postedAt - day,
    postedAt,
    postedAt + hour,
    postedAt + day,
    postedAt + 7 * day,
    postedAt + 30 * day,
    now,
  ].filter((time) => time <= now)
}
