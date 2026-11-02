/**
 * Live, no-DB diagnostic for why resolved PulseChain first calls aren't getting a price at the shill.
 * Runs the real fetchHistory / onchainSeries / geckoEntry code paths against real pools and timestamps.
 *
 *   pnpm tsx scripts/diagnose-prices.ts
 */
import { fetchHistory } from "../src/lib/prices/history"
import { onchainSeries, blocksAt, blockTimeFor } from "../src/lib/prices/onchain"
import { geckoEntry } from "../src/lib/prices/entry"

const DAY = 24 * 60 * 60 * 1000
const now = Date.now()

type Case = {
  label: string
  contract: string
  pair: string
  daysAgo: number
}

const CASES: Case[] = [
  // GT minute candle should work: recent pool, recent shill.
  { label: "MGOAT/GUSD (pool 43d old, shill 30d ago)", contract: "0x1c8a72c923391013516f095a94fc5b6325fde7af", pair: "0x1d1e372c15998e6e6dadfe1ec36d9701266f2988", daysAgo: 30 },
  // GT minute candle, mid-range inside the 180d window.
  { label: "CODA/WPLS (pool 154d old, shill 120d ago)", contract: "0x9f8d74df6dd3145e858578b0be1d9b11f41e0a28", pair: "0xaa73ad940094d0453ae547f1acb7eb00a49f729e", daysAgo: 120 },
  // Pool itself is now older than 180d, so GT refuses; PulseX reserves should take over.
  { label: "PRVX/WPLS (pool 233d old, shill 120d ago)", contract: "0xf6f8db0aba00007681f8faf16a0fda1c9b030b11", pair: "0x62f7d076c92db76cf84223b6309801ea461d7afe", daysAgo: 120 },
  // Far outside the GT window either way; PulseX reserves only.
  { label: "HEX/WPLS (shill 400d ago)", contract: "0x57fde0a71132198bbec939b98976993d8d89d225", pair: "0xf0ea3efe42c11c8819948ec2d3179f4084863d3f", daysAgo: 400 },
  { label: "DAI/WPLS bridged (shill 400d ago)", contract: "0xefd766ccb38eaf1dfd701853bfce31359239f305", pair: "0xe56043671df55de5cdf8459710433c10324de0ae", daysAgo: 400 },
]

async function main() {
  for (const testCase of CASES) {
    const postedAt = now - testCase.daysAgo * DAY
    console.log(`\n=== ${testCase.label} — postedAt ${new Date(postedAt).toISOString()} ===`)

    // 1. geckoEntry: the minute-candle path entry.ts uses for "price at the shill".
    try {
      const hit = await geckoEntry("pulsechain", testCase.pair, testCase.contract, postedAt)
      console.log(`geckoEntry -> ${hit ? `price=${hit.price} match=${hit.match} ts=${new Date(hit.ts).toISOString()}` : "null (no candle)"}`)
    } catch (error) {
      console.log(`geckoEntry -> THROW ${error instanceof Error ? error.message : error}`)
    }

    // 2. onchainSeries: the PulseX reserves path, at exactly the shill timestamp.
    try {
      const blocks = await blocksAt([Math.floor(postedAt / 1000)])
      const block = blocks.get(Math.floor(postedAt / 1000))
      const candles = await onchainSeries({ token: testCase.contract, net: "pulsechain", pair: testCase.pair, times: [postedAt] })
      const real = blockTimeFor(Math.floor(postedAt / 1000))
      console.log(
        `onchainSeries -> block=${block} realBlockTs=${real != null ? new Date(real * 1000).toISOString() : "?"} candles=${candles.length}` +
          (candles[0] ? ` price=${candles[0].p} candleTs=${new Date(candles[0].t).toISOString()}` : ""),
      )
    } catch (error) {
      console.log(`onchainSeries -> THROW ${error instanceof Error ? error.message : error}`)
    }

    // 3. fetchHistory with skipOnchain: the API fallback backlog.ts's runApi calls when a row falls
    //    out of the on-chain path (onchainNoMatch, or a transient RPC error). No DB needed: skipOnchain
    //    bypasses the local directory lookup (pulsePairsFor), which is the only DB-backed step.
    try {
      const from = postedAt - 2 * DAY
      const to = postedAt + 2 * DAY
      const result = await fetchHistory(
        { chain: "pulsechain", pairAddress: testCase.pair, contractAddress: testCase.contract, geckoterminalNetwork: "pulsechain" },
        from,
        to,
        postedAt,
        { skipOnchain: true },
      )
      console.log(`fetchHistory(skipOnchain) -> source=${result.source} candles=${result.candles.length}`)
    } catch (error) {
      console.log(`fetchHistory(skipOnchain) -> THROW ${error instanceof Error ? error.message : error}`)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
