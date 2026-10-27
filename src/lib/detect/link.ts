import type { RawMatch } from "./extract"

const NEARBY_MS = 12 * 60 * 60 * 1000

type Linkable = RawMatch & { chain?: string | null }

/** One cashtag and one chain-prefixed contract in the same post are one asset. */
export function linkSamePost<T extends Linkable>(matches: T[]): T[] {
  const contracts = matches.filter((match) => match.contractAddress && match.chain && !match.symbol)
  const cashtags = matches.filter((match) => match.symbol && (match.matchType === "cashtag" || match.matchType === "hashtag"))
  if (contracts.length !== 1 || cashtags.length !== 1) return matches
  const [contract] = contracts
  const [cashtag] = cashtags
  contract.symbol = cashtag.symbol
  cashtag.contractAddress = contract.contractAddress
  cashtag.chain = contract.chain
  return matches
}

export type NearbyPost<T> = {
  id: string
  createdAt: number
  matches: T[]
}

/**
 * A post that is only `chain:0x…` takes the single cashtag from a post within 12 hours.
 * $PRIORS in one post and robinhood:0x… in the next become one asset.
 */
export function linkNearbyPosts<T extends Linkable>(posts: NearbyPost<T>[]): NearbyPost<T>[] {
  const ordered = [...posts].sort((a, b) => a.createdAt - b.createdAt)
  for (const post of ordered) {
    const contracts = post.matches.filter((match) => match.contractAddress && match.chain && !match.symbol)
    const ownCashtags = post.matches.filter((match) => match.symbol)
    if (contracts.length !== 1 || ownCashtags.length > 0) continue
    const symbols = new Set<string>()
    const donors: T[] = []
    for (const other of ordered) {
      if (other.id === post.id) continue
      if (Math.abs(other.createdAt - post.createdAt) > NEARBY_MS) continue
      for (const match of other.matches) {
        if (!match.symbol) continue
        if (match.matchType !== "cashtag" && match.matchType !== "hashtag") continue
        symbols.add(match.symbol.toUpperCase())
        donors.push(match)
      }
    }
    if (symbols.size !== 1) continue
    const symbol = [...symbols][0]
    const [contract] = contracts
    contract.symbol = symbol
    for (const donor of donors) {
      if (donor.symbol?.toUpperCase() !== symbol) continue
      donor.contractAddress = contract.contractAddress
      donor.chain = contract.chain ?? donor.chain
    }
  }
  return ordered
}
