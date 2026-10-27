import type { Candle } from "../scoring/evaluate"

const RPC_URL = process.env.PULSECHAIN_RPC_URL || "https://rpc.pulsechain.com"

/** Block 17,300,000. Used to estimate a block from a timestamp, then checked on chain. */
const ANCHOR_BLOCK = 17_300_000
const ANCHOR_TS = 1_684_459_865
const BLOCK_SECONDS = 10
const GENESIS_TS = Math.floor(Date.parse("2023-05-13T00:00:00Z") / 1000)

export const WPLS = "0xa1077a294dde1b09bb078844df40758a5d0f9a27"
/** WPLS/USDC on PulseX. USDC is token0, 6 decimals. */
export const WPLS_USDC_PAIR = "0x6753560538eca67617a9ce605178f788be7e524e"
export const USDC = "0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07"

const STABLES = new Set([
  "0x6b175474e89094c44da98b954eedeac495271d0f",
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  USDC,
  "0xdac17f958d2ee523a2206206994597c13d831ec7",
])

const FACTORIES = [
  "0x29ea7545def87022badc76323f373ea1e707c523",
  "0x1715a3e4a142d8b698131108995174f37aeba10d",
]

const SEL_TOKEN0 = "0x0dfe1681"
const SEL_TOKEN1 = "0xd21220a7"
const SEL_RESERVES = "0x0902f1ac"
const SEL_DECIMALS = "0x313ce567"

export class UnverifiablePriceError extends Error {
  readonly unverifiable = true
  constructor(message: string) {
    super(message)
    this.name = "UnverifiablePriceError"
  }
}

export function isUnverifiable(error: unknown) {
  return error instanceof UnverifiablePriceError || (error instanceof Error && error.name === "UnverifiablePriceError")
}

export function tokenPriceFromReserves(input: {
  target: string
  token0: string
  token1: string
  reserve0: bigint
  reserve1: bigint
  decimals0: number
  decimals1: number
  quoteUsd: number | null
}) {
  const target = input.target.toLowerCase()
  const token0 = input.token0.toLowerCase()
  const token1 = input.token1.toLowerCase()
  const targetIs0 = target === token0
  const targetIs1 = target === token1
  if (!targetIs0 && !targetIs1) return null
  const reserveT = targetIs0 ? input.reserve0 : input.reserve1
  const reserveQ = targetIs0 ? input.reserve1 : input.reserve0
  const decT = targetIs0 ? input.decimals0 : input.decimals1
  const decQ = targetIs0 ? input.decimals1 : input.decimals0
  const quote = targetIs0 ? token1 : token0
  if (reserveT === BigInt(0)) return 0
  const quotePerToken = amountRatio(reserveQ, decQ, reserveT, decT)
  if (STABLES.has(quote)) return quotePerToken
  if (quote === WPLS) {
    if (input.quoteUsd == null) return null
    return quotePerToken * input.quoteUsd
  }
  if (input.quoteUsd == null) return null
  return quotePerToken * input.quoteUsd
}

function amountRatio(reserveQuote: bigint, decQuote: number, reserveToken: bigint, decToken: number) {
  const scale = BigInt(10) ** BigInt(18)
  const numerator = reserveQuote * scale * BigInt(10) ** BigInt(decToken)
  const denominator = reserveToken * BigInt(10) ** BigInt(decQuote)
  if (denominator === BigInt(0)) return 0
  return Number(numerator / denominator) / 1e18
}

export async function fetchPulsexCandles(input: {
  token: string
  pair: string
  postedAt: number
  fromMs: number
  toMs: number
}): Promise<Candle[]> {
  const times = sampleTimes(input.postedAt, input.fromMs, input.toMs)
  const candles: Candle[] = []
  let sawEntry = false
  for (const time of times) {
    const seconds = Math.floor(time / 1000)
    if (seconds < GENESIS_TS) continue
    const block = await blockAt(seconds)
    if (block == null) continue
    const price = await priceTokenAtBlock(input.token, input.pair, block)
    if (price == null || price <= 0) continue
    if (Math.abs(time - input.postedAt) < 60 * 60 * 1000) sawEntry = true
    candles.push({ t: time, p: price, v: 0 })
  }
  if (!sawEntry) {
    throw new UnverifiablePriceError(
      "PulseX reserves at the post block did not yield a USD price. Not estimated.",
    )
  }
  return candles
}

function sampleTimes(postedAt: number, fromMs: number, toMs: number) {
  const hour = 60 * 60 * 1000
  const day = 24 * hour
  const points = [
    postedAt - 7 * day,
    postedAt - day,
    postedAt,
    postedAt + hour,
    postedAt + day,
    postedAt + 7 * day,
    postedAt + 30 * day,
    Math.min(Date.now(), toMs),
  ]
  const latest = Date.now() + 60_000
  return [...new Set(points.filter((time) => time >= fromMs - hour && time <= toMs + hour && time <= latest))].sort(
    (a, b) => a - b,
  )
}

const blockCache = new Map<number, number>()
const decimalsCache = new Map<string, number>()
let headBlock: { number: number; ts: number } | null = null

async function chainHead() {
  if (headBlock && Date.now() / 1000 - headBlock.ts < 30) return headBlock
  const numberHex = await rpc<string>("eth_blockNumber", [])
  if (!numberHex) return null
  const number = parseInt(numberHex, 16)
  const block = await rpc<{ timestamp?: string }>("eth_getBlockByNumber", [hex(number), false])
  if (!block?.timestamp) return null
  headBlock = { number, ts: parseInt(block.timestamp, 16) }
  return headBlock
}

async function blockAt(targetTs: number) {
  const cached = blockCache.get(targetTs)
  if (cached != null) return cached
  const head = await chainHead()
  if (!head) return null
  if (targetTs >= head.ts) {
    blockCache.set(targetTs, head.number)
    return head.number
  }
  let guess = ANCHOR_BLOCK + Math.round((targetTs - ANCHOR_TS) / BLOCK_SECONDS)
  guess = Math.max(1, Math.min(head.number, guess))
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const block = await rpc<{ timestamp?: string }>("eth_getBlockByNumber", [hex(guess), false])
    if (!block?.timestamp) {
      guess = Math.max(1, guess - 50_000)
      continue
    }
    const ts = parseInt(block.timestamp, 16)
    const delta = targetTs - ts
    if (Math.abs(delta) < BLOCK_SECONDS * 3) {
      blockCache.set(targetTs, guess)
      return guess
    }
    guess += Math.round(delta / BLOCK_SECONDS)
    guess = Math.max(1, Math.min(head.number, guess))
  }
  blockCache.set(targetTs, guess)
  return guess
}

async function priceTokenAtBlock(token: string, pair: string, block: number) {
  const direct = await readPair(pair, block)
  if (!direct) return null
  const wplsUsd = await wplsUsdAt(block)
  const quote = otherToken(direct, token)
  let quoteUsd: number | null = null
  if (quote && STABLES.has(quote)) quoteUsd = 1
  else if (quote === WPLS) quoteUsd = wplsUsd
  else if (quote) quoteUsd = await hopUsd(quote, block, wplsUsd)
  return tokenPriceFromReserves({
    target: token,
    token0: direct.token0,
    token1: direct.token1,
    reserve0: direct.reserve0,
    reserve1: direct.reserve1,
    decimals0: direct.decimals0,
    decimals1: direct.decimals1,
    quoteUsd,
  })
}

async function hopUsd(quote: string, block: number, wplsUsd: number | null) {
  for (const anchor of [WPLS, ...STABLES]) {
    const pair = await findPair(quote, anchor)
    if (!pair) continue
    const reserves = await readPair(pair, block)
    if (!reserves) continue
    const price = tokenPriceFromReserves({
      target: quote,
      token0: reserves.token0,
      token1: reserves.token1,
      reserve0: reserves.reserve0,
      reserve1: reserves.reserve1,
      decimals0: reserves.decimals0,
      decimals1: reserves.decimals1,
      quoteUsd: anchor === WPLS ? wplsUsd : 1,
    })
    if (price != null && price > 0) return price
  }
  return null
}

async function wplsUsdAt(block: number) {
  const reserves = await readPair(WPLS_USDC_PAIR, block)
  if (!reserves) return null
  return tokenPriceFromReserves({
    target: WPLS,
    token0: reserves.token0,
    token1: reserves.token1,
    reserve0: reserves.reserve0,
    reserve1: reserves.reserve1,
    decimals0: reserves.decimals0,
    decimals1: reserves.decimals1,
    quoteUsd: 1,
  })
}

function otherToken(pair: { token0: string; token1: string }, token: string) {
  const target = token.toLowerCase()
  if (pair.token0 === target) return pair.token1
  if (pair.token1 === target) return pair.token0
  return null
}

async function findPair(a: string, b: string) {
  const data = "0xe6a43905" + padAddress(a) + padAddress(b)
  for (const factory of FACTORIES) {
    const result = await rpc<string>("eth_call", [{ to: factory, data }, "latest"])
    if (typeof result !== "string" || result.length < 42) continue
    const address = "0x" + result.slice(-40)
    if (!/^0x0+$/.test(address)) return address
  }
  return null
}

async function readPair(pair: string, block: number) {
  const tag = hex(block)
  const [token0, token1, reserves] = await Promise.all([
    rpc<string>("eth_call", [{ to: pair, data: SEL_TOKEN0 }, tag]),
    rpc<string>("eth_call", [{ to: pair, data: SEL_TOKEN1 }, tag]),
    rpc<string>("eth_call", [{ to: pair, data: SEL_RESERVES }, tag]),
  ])
  if (typeof token0 !== "string" || typeof token1 !== "string" || typeof reserves !== "string") return null
  if (reserves === "0x" || reserves.length < 2 + 64 * 2) return null
  const reserve0 = BigInt("0x" + reserves.slice(2, 66))
  const reserve1 = BigInt("0x" + reserves.slice(66, 130))
  const a = "0x" + token0.slice(-40).toLowerCase()
  const b = "0x" + token1.slice(-40).toLowerCase()
  const [decimals0, decimals1] = await Promise.all([decimals(a), decimals(b)])
  return { token0: a, token1: b, reserve0, reserve1, decimals0, decimals1 }
}

async function decimals(token: string) {
  const cached = decimalsCache.get(token)
  if (cached != null) return cached
  const result = await rpc<string>("eth_call", [{ to: token, data: SEL_DECIMALS }, "latest"])
  const value = typeof result === "string" && result !== "0x" ? Number(BigInt(result)) : 18
  const safe = Number.isFinite(value) && value >= 0 && value <= 36 ? value : 18
  decimalsCache.set(token, safe)
  return safe
}

function padAddress(address: string) {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0")
}

function hex(value: number) {
  return "0x" + Math.max(0, Math.floor(value)).toString(16)
}

async function rpc<T>(method: string, params: unknown[]): Promise<T | null> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  })
  if (!response.ok) {
    throw new Error(`${response.status} from pulsechain rpc`)
  }
  const body = (await response.json()) as { result?: T; error?: { message?: string } }
  if (body.error) {
    const message = body.error.message ?? "rpc error"
    if (/missing trie|historical state|archive/i.test(message)) return null
    throw new Error(message)
  }
  return body.result ?? null
}
