/**
 * PulseChain tickers only applies to voices too: a tracked account whose shills are overwhelmingly off
 * PulseChain should stop being polled, the same way an off-chain mention gets rejected. This is the
 * "first check" that runs once a voice has enough chain-determined mentions to judge, so a handle that
 * turns out to be a general-crypto, Ethereum, Solana, or stock-trading account doesn't keep spending the
 * X read budget forever.
 */

export type ChainSample = { chain: string | null }

/** Below this many chain-determined mentions, there isn't enough signal yet to judge. */
const MIN_DETERMINED_SAMPLE = 15
/** Below this share of determined mentions being PulseChain, the voice reads as off-chain. */
const MIN_PULSECHAIN_SHARE = 0.1

/**
 * True once a voice has posted enough chain-determined mentions to show it is not a PulseChain shiller.
 * "unknown-evm" (a bare contract address, chain not yet matched) is excluded from the sample: PulseChain
 * is itself an EVM chain, so an unmatched EVM address is not evidence either way.
 */
export function failsPulseChainCheck(mentions: ChainSample[]): boolean {
  const determined = mentions.filter((mention) => mention.chain != null && mention.chain !== "unknown-evm")
  if (determined.length < MIN_DETERMINED_SAMPLE) return false
  const pulse = determined.filter((mention) => mention.chain === "pulsechain").length
  return pulse / determined.length < MIN_PULSECHAIN_SHARE
}
