import type { CallKind } from "./kinds"

/** PulseChain fork. Posts before this instant are still on Ethereum. */
export const PULSE_FORK_MS = Date.parse("2023-05-13T00:00:00Z")

const CHAIN_NAMES = new Set([
  "solana",
  "ethereum",
  "eth",
  "base",
  "bsc",
  "bnb",
  "polygon",
  "arbitrum",
  "avalanche",
  "optimism",
  "pulsechain",
  "pulse",
])

/** Community tags, not tickers. #Pulsechain is a chain hint, not a coin. */
export const HASHTAG_DENY = new Set([
  "PULSECHAIN",
  "PULSE",
  "CRYPTO",
  "CRYPTOCURRENCY",
  "BITCOIN",
  "ETHEREUM",
  "ETH",
  "SOLANA",
  "SOL",
  "BASE",
  "BSC",
  "DEFI",
  "NFT",
  "WEB3",
  "NFA",
  "DYOR",
  "MEMECOIN",
  "ALTSEASON",
  "ALTCOIN",
  "GEM",
  "GEMS",
  "MOON",
  "WAGMI",
  "NGMI",
  "HODL",
  "FUD",
  "ALPHA",
  "AIRDROP",
  "GIVEAWAY",
  "BLOCKCHAIN",
  "BINANCE",
  "TRADING",
  "TRADER",
  "FINANCE",
  "BULLISH",
  "BEARISH",
  "MEME",
  "MEMES",
  "100X",
])

const BUYISH =
  /\b(buy|bought|buying|ape|aping|aped|long|entry|bid|bidding|load|loading|loaded|accumulat\w*|swap|swapping|hold|holding|bag|bags|breaking out)\b/i

const PERSON_TAIL =
  /^\s+(maxi|maxis|holder|holders|army|gang|community|believer|believers|fan|fans|guy|guys|dude|account|bro|bros)\b/i

const CHAIN_PREFIX: Record<string, string> = {
  eth: "ethereum",
  ethereum: "ethereum",
  base: "base",
  bsc: "bsc",
  bnb: "bsc",
  sol: "solana",
  solana: "solana",
  arb: "arbitrum",
  arbitrum: "arbitrum",
  op: "optimism",
  optimism: "optimism",
  matic: "polygon",
  polygon: "polygon",
  avax: "avalanche",
  avalanche: "avalanche",
  pulse: "pulsechain",
  pulsechain: "pulsechain",
  pls: "pulsechain",
}

export function chainFromPrefix(prefix: string) {
  const key = prefix.toLowerCase()
  return CHAIN_PREFIX[key] ?? key
}

/** Bare chain names need a buy-ish verb. "on Solana" and "spending eth" are not calls. */
export function nameIsTickerContext(text: string, index: number, raw: string) {
  const word = raw.toLowerCase()
  if (!CHAIN_NAMES.has(word)) return true
  const before = text.slice(Math.max(0, index - 16), index)
  if (/\b(on|via|of|than|for)\s+$/i.test(before)) return false
  if (/\b(spending|spent|using|used|paying|paid)\s+$/i.test(before)) return false
  const window = text.slice(Math.max(0, index - 48), index + raw.length + 48)
  return BUYISH.test(window)
}

/** "$HEX maxi" is a person, not a ticker. */
export function isPersonDescriptor(text: string, index: number, raw: string) {
  return PERSON_TAIL.test(text.slice(index + raw.length))
}

export type PostContext = {
  chainHint: string | null
  ethereumHex: boolean
}

export function contextFromText(text: string): PostContext {
  const rules: Array<[RegExp, string]> = [
    [/#pulsechain\b|#pulse\b|\bon\s+pulse(chain)?\b|scan\.pulsechain\.com|dexscreener\.com\/pulsechain|geckoterminal\.com\/pulsechain|pulsex\.(com|finance)/i, "pulsechain"],
    [/#base\b|\bon\s+base\b|basescan\.org|dexscreener\.com\/base|geckoterminal\.com\/base/i, "base"],
    [/#solana\b|\bon\s+sol(ana)?\b|solscan\.io|dexscreener\.com\/solana/i, "solana"],
    [/#bsc\b|\bon\s+bsc\b|bscscan\.com|dexscreener\.com\/bsc/i, "bsc"],
    [/#ethereum\b|\bon\s+eth(ereum)?\b|etherscan\.io|dexscreener\.com\/ethereum/i, "ethereum"],
  ]
  let chainHint: string | null = null
  for (const [pattern, chain] of rules) {
    if (pattern.test(text)) {
      chainHint = chain
      break
    }
  }
  const ethereumHex = /\behex\b/i.test(text) || /(^|[^A-Za-z0-9$])ETH([^A-Za-z0-9]|$)/.test(text) || /\$ETH\b/.test(text)
  return { chainHint, ethereumHex }
}

export function classifyPost(text: string): { kind: CallKind; reason: string } {
  const pastMultiple =
    /\b\d{1,3}(?:,\d{3})+x\b/i.test(text) ||
    /\b\d{3,}x\b/i.test(text)
  const forward = /\b(can|could|will|gonna|going to|target|from here|upside)\b/i.test(text)
  if (
    /\bfrom my call\b/i.test(text) ||
    /\bwhen i called\b/i.test(text) ||
    /\bwas\b[^.\n]{0,48}\bmc\b/i.test(text) ||
    (pastMultiple && !forward)
  ) {
    return {
      kind: "retro_brag",
      reason: "Past multiple, “from my call”, or “was … mc” — this is a recap, not a new entry.",
    }
  }
  if (/\b(do not buy|don't buy|dont buy|stay away|this is a scam|exit liquidity|not a buy)\b/i.test(text)) {
    return { kind: "negative", reason: "The post warns against the trade." }
  }
  if (/\b(just kidding|this is a joke|\bjk\b|satire)\b/i.test(text)) {
    return { kind: "joke", reason: "The post marks itself as a joke." }
  }
  if (
    /\b(i wonder|didn.?t want to debate|why are you|debate)\b/i.test(text) &&
    !BUYISH.test(text)
  ) {
    return { kind: "commentary", reason: "Commentary without a buy, entry, or breakout." }
  }
  return { kind: "call", reason: "No retro, warning, or joke marker. Counted as a call." }
}

/**
 * Optional second pass. Rules always run. An LLM only replaces them when
 * CLASSIFY_WITH_LLM=1 and OPENAI_API_KEY or CALL_CLASSIFIER_API_KEY is set.
 */
export async function classifyPostMaybeLlm(text: string): Promise<{ kind: CallKind; reason: string }> {
  const rules = classifyPost(text)
  if (process.env.CLASSIFY_WITH_LLM !== "1") return rules
  const key = process.env.CALL_CLASSIFIER_API_KEY || process.env.OPENAI_API_KEY
  if (!key) return rules
  const base = process.env.CALL_CLASSIFIER_BASE_URL || "https://api.openai.com/v1"
  const model = process.env.CALL_CLASSIFIER_MODEL || "gpt-4o-mini"
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "Classify a crypto post as one of: call, retro_brag, commentary, negative, joke. Reply with only the label.",
          },
          { role: "user", content: text.slice(0, 2000) },
        ],
      }),
    })
    if (!response.ok) return rules
    const body = (await response.json()) as { choices?: { message?: { content?: string } }[] }
    const label = body.choices?.[0]?.message?.content?.trim().toLowerCase().replace(/[\s-]+/g, "_")
    if (label === "call" || label === "retro_brag" || label === "commentary" || label === "negative" || label === "joke") {
      return { kind: label, reason: `${rules.reason} LLM label: ${label}.` }
    }
  } catch {
    return rules
  }
  return rules
}
