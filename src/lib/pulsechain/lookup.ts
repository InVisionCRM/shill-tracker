import { desc, eq, inArray } from "drizzle-orm"
import { getDb } from "../db"
import { pulsePairs, pulseTokens } from "../db/schema"
import type { DirectoryPair, TokenCandidate } from "./rank"

function missingTable(error: unknown) {
  const seen = new Set<unknown>()
  let current: unknown = error
  while (current && !seen.has(current)) {
    seen.add(current)
    const code = (current as { code?: string }).code
    const message = current instanceof Error ? current.message : String(current)
    if (code === "42P01" || /pulse_(pairs|tokens).*does not exist/i.test(message)) return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}

export async function pulseSymbolCandidates(symbol: string): Promise<TokenCandidate[]> {
  const normalized = symbol.trim().toUpperCase()
  if (!normalized) return []
  try {
    const db = getDb()
    const rows = await db
      .select()
      .from(pulseTokens)
      .where(eq(pulseTokens.symbol, normalized))
      .orderBy(desc(pulseTokens.liquidityUsd))
      .limit(12)
    return rows.map((row) => ({
      address: row.address,
      symbol: row.symbol ?? normalized,
      name: row.name,
      imageUrl: httpUrl(row.imageUrl),
      liquidityUsd: row.liquidityUsd ?? 0,
      pairAddress: row.bestPairAddress,
      createdBlock: row.bestPairCreatedBlock,
      pulsexPairAddress: row.pulsexPairAddress,
      pulsexCreatedBlock: row.pulsexCreatedBlock,
      missingSince: row.missingSince?.toISOString() ?? null,
      assetState: row.assetState === "dead" ? "dead" : null,
    }))
  } catch (error) {
    if (missingTable(error)) return []
    throw error
  }
}

export async function pulsePairsFor(address: string): Promise<DirectoryPair[]> {
  const normalized = address.toLowerCase()
  try {
    const db = getDb()
    const rows = await db.select().from(pulsePairs).where(eq(pulsePairs.baseAddress, normalized))
    return rows.map((row) => ({
      pairAddress: row.pairAddress,
      factory: row.factory,
      amm: row.amm,
      createdBlock: row.createdBlock,
      dexId: row.dexId,
      baseAddress: row.baseAddress,
      baseSymbol: row.baseSymbol,
      baseName: row.baseName,
      quoteSymbol: row.quoteSymbol,
      imageUrl: httpUrl(row.imageUrl),
      liquidityUsd: row.liquidityUsd,
      missingSince: row.missingSince?.toISOString() ?? null,
    }))
  } catch (error) {
    if (missingTable(error)) return []
    throw error
  }
}

export async function logosForAddresses(addresses: string[]) {
  const keys = [...new Set(addresses.map((address) => address.toLowerCase()).filter(Boolean))]
  const logos = new Map<string, string>()
  if (!keys.length) return logos
  try {
    const db = getDb()
    const rows = await db
      .select({ address: pulseTokens.address, imageUrl: pulseTokens.imageUrl })
      .from(pulseTokens)
      .where(inArray(pulseTokens.address, keys))
    for (const row of rows) {
      const url = httpUrl(row.imageUrl)
      if (url) logos.set(row.address, url)
    }
  } catch (error) {
    if (!missingTable(error)) throw error
  }
  return logos
}

export async function logosForSymbols(symbols: string[]) {
  const keys = [...new Set(symbols.map((symbol) => symbol.toUpperCase()).filter(Boolean))]
  const logos = new Map<string, string>()
  if (!keys.length) return logos
  try {
    const db = getDb()
    const rows = await db
      .select({
        symbol: pulseTokens.symbol,
        imageUrl: pulseTokens.imageUrl,
        liquidityUsd: pulseTokens.liquidityUsd,
      })
      .from(pulseTokens)
      .where(inArray(pulseTokens.symbol, keys))
      .orderBy(desc(pulseTokens.liquidityUsd))
    for (const row of rows) {
      if (!row.symbol || logos.has(row.symbol)) continue
      const url = httpUrl(row.imageUrl)
      if (url) logos.set(row.symbol, url)
    }
  } catch (error) {
    if (!missingTable(error)) throw error
  }
  return logos
}

export function httpUrl(value: string | null | undefined) {
  if (!value) return null
  if (value.startsWith("https://") || value.startsWith("http://")) return value
  return null
}
