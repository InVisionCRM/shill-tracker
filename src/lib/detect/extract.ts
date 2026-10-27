import { CASHTAG_DENY, NAME_TO_SYMBOL, canonicalBySymbol } from "./assets"
import { chainFromPrefix, contextFromText, isPersonDescriptor, nameIsTickerContext, HASHTAG_DENY } from "./context"
import type { CallKind } from "./kinds"
import { lookupOverride } from "./overrides"
import { dexUrl, pulseAsset } from "./pulse"

export type MatchType = "cashtag" | "hashtag" | "name" | "evm" | "solana"

export type RawMatch = {
  matchType: MatchType
  rawText: string
  symbol: string | null
  contractAddress: string | null
  matchKey: string
  chain?: string | null
}

const CASHTAG = /\$([A-Za-z][A-Za-z0-9]{1,14})\b/g
const HASHTAG = /#([A-Za-z][A-Za-z0-9]{1,20})\b/g
const PREFIXED = /\b([A-Za-z][A-Za-z0-9]{1,20}):(0x[a-fA-F0-9]{40})\b/g
const EVM = /\b0x[a-fA-F0-9]{40}\b/g
const SOLANA = /(?<![1-9A-HJ-NP-Za-km-z])[1-9A-HJ-NP-Za-km-z]{32,44}(?![1-9A-HJ-NP-Za-km-z])/g

const NAME_PATTERN = new RegExp(
  `\\b(?:${Object.keys(NAME_TO_SYMBOL)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|")})\\b`,
  "gi",
)

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function looksLikeSolanaAddress(value: string) {
  if (value.length < 32 || value.length > 44) return false
  const hasDigit = /[1-9]/.test(value)
  const hasUpper = /[A-Z]/.test(value)
  const hasLower = /[a-z]/.test(value)
  if (!hasDigit || !hasUpper || !hasLower) return false
  return true
}

export function extractMatches(text: string, extraNames?: Record<string, string>): RawMatch[] {
  const matches: RawMatch[] = []
  const seen = new Set<string>()

  const push = (match: RawMatch) => {
    if (seen.has(match.matchKey)) return
    seen.add(match.matchKey)
    matches.push(match)
  }

  for (const hit of text.matchAll(CASHTAG)) {
    const symbol = hit[1].toUpperCase()
    if (CASHTAG_DENY.has(symbol)) continue
    const index = hit.index ?? 0
    if (isPersonDescriptor(text, index, hit[0])) continue
    push({
      matchType: "cashtag",
      rawText: hit[0],
      symbol,
      contractAddress: null,
      matchKey: `cashtag:${symbol}`,
    })
  }

  for (const hit of text.matchAll(HASHTAG)) {
    const symbol = hit[1].toUpperCase()
    if (HASHTAG_DENY.has(symbol) || CASHTAG_DENY.has(symbol)) continue
    if (symbol.length < 3) continue
    push({
      matchType: "hashtag",
      rawText: hit[0],
      symbol,
      contractAddress: null,
      matchKey: `hashtag:${symbol}`,
    })
  }

  for (const hit of text.matchAll(NAME_PATTERN)) {
    const symbol = NAME_TO_SYMBOL[hit[0].toLowerCase()]
    if (!symbol) continue
    const index = hit.index ?? 0
    if (!nameIsTickerContext(text, index, hit[0])) continue
    if (isPersonDescriptor(text, index, hit[0])) continue
    push({
      matchType: "name",
      rawText: hit[0],
      symbol,
      contractAddress: null,
      matchKey: `name:${symbol}`,
    })
  }

  const aliasKeys = Object.keys(extraNames ?? {}).filter((key) => key && !NAME_TO_SYMBOL[key])
  if (aliasKeys.length && extraNames) {
    const aliasPattern = new RegExp(
      `\\b(?:${aliasKeys
        .sort((a, b) => b.length - a.length)
        .map(escapeRegExp)
        .join("|")})\\b`,
      "gi",
    )
    for (const hit of text.matchAll(aliasPattern)) {
      const symbol = extraNames[hit[0].toLowerCase()]?.toUpperCase()
      if (!symbol) continue
      const index = hit.index ?? 0
      if (!nameIsTickerContext(text, index, hit[0])) continue
      if (isPersonDescriptor(text, index, hit[0])) continue
      push({
        matchType: "name",
        rawText: hit[0],
        symbol,
        contractAddress: null,
        matchKey: `name:${symbol}`,
      })
    }
  }

  const evmSpans: { start: number; end: number }[] = []
  for (const hit of text.matchAll(PREFIXED)) {
    const address = hit[2].toLowerCase()
    const start = hit.index ?? 0
    evmSpans.push({ start, end: start + hit[0].length })
    push({
      matchType: "evm",
      rawText: hit[0],
      symbol: null,
      contractAddress: address,
      chain: chainFromPrefix(hit[1]),
      matchKey: `evm:${address}`,
    })
  }

  for (const hit of text.matchAll(EVM)) {
    const address = hit[0].toLowerCase()
    const start = hit.index ?? 0
    const end = start + hit[0].length
    if (evmSpans.some((span) => start < span.end && end > span.start)) continue
    evmSpans.push({ start, end })
    push({
      matchType: "evm",
      rawText: hit[0],
      symbol: null,
      contractAddress: address,
      matchKey: `evm:${address}`,
    })
  }

  for (const hit of text.matchAll(SOLANA)) {
    if (!looksLikeSolanaAddress(hit[0])) continue
    if (hit[0].startsWith("0x")) continue
    const start = hit.index ?? 0
    const end = start + hit[0].length
    // A `0` inside a hex address is a base58 boundary, so mixed-case 0x strings
    // can contain a 32–44 char slice. Those are not Solana mints.
    if (evmSpans.some((span) => start < span.end && end > span.start)) continue
    push({
      matchType: "solana",
      rawText: hit[0],
      symbol: null,
      contractAddress: hit[0],
      matchKey: `solana:${hit[0]}`,
    })
  }

  return matches
}

export type IdentifiedMatch = RawMatch & {
  assetName: string | null
  coingeckoId: string | null
  binanceSymbol: string | null
  chain?: string | null
  pairAddress?: string | null
  dexscreenerUrl?: string | null
  geckoterminalNetwork?: string | null
  confidence: "high" | "medium" | "low"
  confidenceReason: string
  resolutionConfidence?: "high" | "medium" | "low" | "ambiguous"
  resolutionStatus: "pending" | "resolved"
  callKind?: CallKind
  callReason?: string
}

export function identifyFast(
  match: RawMatch,
  options?: { chainBias?: string | null; text?: string | null; postedAt?: number | Date | null; chainHint?: string | null } | number,
): IdentifiedMatch {
  const chainBias = typeof options === "number" ? null : options?.chainBias
  const text = typeof options === "number" ? "" : (options?.text ?? "")
  const postedAt = typeof options === "number" ? null : options?.postedAt
  const hinted = typeof options === "number" ? null : options?.chainHint
  const context = contextFromText(text)
  const chainHint = match.chain ?? hinted ?? context.chainHint

  const override = lookupOverride({
    symbol: match.symbol,
    text,
    postedAt,
    chainHint,
    chainBias,
  })
  if (override) {
    return {
      ...match,
      symbol: override.symbol,
      assetName: override.assetName,
      coingeckoId: override.coingeckoId,
      binanceSymbol: null,
      chain: override.chain,
      contractAddress: override.contractAddress,
      pairAddress: override.pairAddress,
      geckoterminalNetwork: override.geckoterminalNetwork,
      dexscreenerUrl: override.dexscreenerUrl,
      confidence: override.confidence,
      resolutionConfidence: override.resolutionConfidence,
      confidenceReason: override.confidenceReason,
      resolutionStatus: "resolved",
    }
  }

  if (chainBias === "pulsechain" && match.symbol) {
    const pulse = pulseAsset(match.symbol)
    if (pulse && pulse.symbol !== "HEX" && pulse.symbol !== "PDAI") {
      return {
        ...match,
        symbol: pulse.symbol,
        assetName: pulse.name,
        coingeckoId: null,
        binanceSymbol: null,
        chain: "pulsechain",
        contractAddress: pulse.contract,
        pairAddress: pulse.pair,
        geckoterminalNetwork: "pulsechain",
        dexscreenerUrl: dexUrl(pulse.pair),
        confidence: "high",
        confidenceReason: pulse.reason,
        resolutionStatus: "resolved",
      }
    }
  }

  if (match.symbol) {
    const known = canonicalBySymbol(match.symbol)
    if (known) {
      return {
        ...match,
        symbol: known.symbol,
        assetName: known.name,
        coingeckoId: known.id,
        binanceSymbol: known.binance,
        confidence: "high",
        confidenceReason:
          match.matchType === "name"
            ? `Coin name “${match.rawText}” maps to the canonical ${known.symbol} asset.`
            : `$${known.symbol} is on the canonical large-cap map.`,
        resolutionStatus: "resolved",
      }
    }
    return {
      ...match,
      assetName: null,
      coingeckoId: null,
      binanceSymbol: null,
      chain: match.chain ?? chainHint,
      confidence: "low",
      confidenceReason:
        match.matchType === "hashtag"
          ? `#${match.symbol} is a candidate ticker. It counts only if it resolves to a known or listed asset.`
          : `$${match.symbol} is not on the canonical map. Waiting on CoinGecko market cap or DexScreener liquidity to pick an asset.`,
      resolutionStatus: "pending",
    }
  }

  return {
    ...match,
    assetName: null,
    coingeckoId: null,
    binanceSymbol: null,
    confidence: "low",
    confidenceReason: match.chain
      ? `Contract is prefixed ${match.chain}. The chain is stored and the pair lookup stays on that chain.`
      : match.matchType === "solana"
        ? "Solana mint detected. Waiting on DexScreener for the most liquid pair."
        : "EVM contract detected. Chain stays unknown-evm until a pair lookup checks PulseChain, then Ethereum, Base, and BSC.",
    chain:
      match.chain ??
      (match.matchType === "solana" ? "solana" : match.matchType === "evm" ? (chainHint ?? "unknown-evm") : chainHint),
    resolutionStatus: "pending",
  }
}

const SPECIFICITY: Record<MatchType, number> = {
  evm: 3,
  solana: 3,
  cashtag: 2,
  hashtag: 2,
  name: 1,
}

const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 }

export type CollapseInput = IdentifiedMatch & {
  chain?: string | null
  pairAddress?: string | null
  dexscreenerUrl?: string | null
  geckoterminalNetwork?: string | null
}

/** Merge mentions in one post that point at the same asset. */
export function collapseMatches<T extends CollapseInput>(matches: T[]): T[] {
  if (matches.length < 2) return matches
  const parent = matches.map((_, index) => index)
  const find = (index: number): number => {
    let cursor = index
    while (parent[cursor] !== cursor) cursor = parent[cursor]
    parent[index] = cursor
    return cursor
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }

  const firstByKey = new Map<string, number>()
  matches.forEach((match, index) => {
    const keys: string[] = []
    if (match.contractAddress) keys.push(`c:${match.contractAddress.toLowerCase()}`)
    if (match.coingeckoId) keys.push(`g:${match.coingeckoId}`)
    if (match.symbol) keys.push(`s:${match.symbol.toUpperCase()}`)
    for (const key of keys) {
      const other = firstByKey.get(key)
      if (other == null) firstByKey.set(key, index)
      else union(index, other)
    }
  })

  const groups = new Map<number, T[]>()
  matches.forEach((match, index) => {
    const root = find(index)
    const group = groups.get(root) ?? []
    group.push(match)
    groups.set(root, group)
  })

  return [...groups.values()].map((group) => mergeGroup(group))
}

function mergeGroup<T extends CollapseInput>(group: T[]): T {
  const ranked = [...group].sort((a, b) => {
    const spec = SPECIFICITY[b.matchType] - SPECIFICITY[a.matchType]
    if (spec) return spec
    return CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence]
  })
  const winner = { ...ranked[0] }
  for (const item of group) {
    winner.symbol = winner.symbol ?? item.symbol
    winner.assetName = winner.assetName ?? item.assetName
    winner.coingeckoId = winner.coingeckoId ?? item.coingeckoId
    winner.binanceSymbol = winner.binanceSymbol ?? item.binanceSymbol
    winner.contractAddress = winner.contractAddress ?? item.contractAddress
    winner.chain = winner.chain ?? item.chain
    winner.pairAddress = winner.pairAddress ?? item.pairAddress
    winner.dexscreenerUrl = winner.dexscreenerUrl ?? item.dexscreenerUrl
    winner.geckoterminalNetwork =
      winner.geckoterminalNetwork ?? item.geckoterminalNetwork
    if (item.resolutionStatus === "resolved") winner.resolutionStatus = "resolved"
    if (CONFIDENCE_RANK[item.confidence] > CONFIDENCE_RANK[winner.confidence]) {
      winner.confidence = item.confidence
      winner.confidenceReason = item.confidenceReason
    }
  }
  if (group.length > 1) {
    const extras = group
      .filter((item) => item.matchKey !== winner.matchKey)
      .map((item) => item.rawText)
    winner.confidenceReason = `${winner.confidenceReason} Also matched ${extras.join(", ")} in the same post.`
  }
  return winner
}
