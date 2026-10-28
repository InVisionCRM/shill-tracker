import { loadLocalEnv } from "../src/lib/env"
import { fetchBinanceTickers, fetchCoingeckoSimple, fetchDexTokenPrices, fetchHistory } from "../src/lib/prices/history"
import { resolveContract } from "../src/lib/prices/resolve"

loadLocalEnv()

const PEPE = "0x6982508145454Ce325dDbE47a25d4ec3d2311933"

async function main() {
  const lines: string[] = []
  const binance = await fetchBinanceTickers(["BTCUSDT", "ETHUSDT"])
  for (const row of binance) {
    lines.push(`binance ${row.symbol} ${row.price} 24h ${((row.change24h ?? 0) * 100).toFixed(2)}%`)
  }
  const gecko = await fetchCoingeckoSimple(["bitcoin", "ethereum"])
  for (const row of gecko) {
    lines.push(`coingecko ${row.id} ${row.price} 24h ${((row.change24h ?? 0) * 100).toFixed(2)}%`)
  }
  const btcB = binance.find((row) => row.symbol === "BTCUSDT")?.price
  const btcG = gecko.find((row) => row.id === "bitcoin")?.price
  if (btcB && btcG) {
    const gap = Math.abs(btcB - btcG) / btcB
    lines.push(`btc binance vs coingecko gap ${(gap * 100).toFixed(2)}%`)
    if (gap > 0.03) lines.push("warning: BTC prices diverged by more than 3%")
  } else {
    lines.push("warning: missing a BTC print from one source")
  }

  const now = Date.now()
  const candles = await fetchHistory(
    { binanceSymbol: "ETHUSDT", coingeckoId: "ethereum" },
    now - 3 * 24 * 60 * 60 * 1000,
    now,
  )
  lines.push(`eth hourly candles ${candles.candles.length} via ${candles.source}, last ${candles.candles.at(-1)?.p}`)

  // PulseChain tickers only: this just checks the resolver still runs end to end. The Ethereum PEPE
  // contract itself is expected to come back dead (no PulseChain pair), not an error.
  const pepe = await resolveContract(PEPE)
  lines.push(
    `pepe contract ${pepe.resolutionStatus} ${pepe.symbol} ${pepe.chain} liq-pair ${pepe.pairAddress} confidence ${pepe.confidence}`,
  )
  lines.push(pepe.confidenceReason)
  const dex = await fetchDexTokenPrices([PEPE])
  lines.push(`dexscreener pepe price ${dex[0]?.price ?? "missing"}`)

  if (pepe.geckoterminalNetwork && pepe.pairAddress) {
    const ohlcv = await fetchHistory(
      {
        chain: pepe.chain,
        pairAddress: pepe.pairAddress,
        geckoterminalNetwork: pepe.geckoterminalNetwork,
      },
      now - 2 * 24 * 60 * 60 * 1000,
      now,
    )
    lines.push(`geckoterminal pepe candles ${ohlcv.candles.length} via ${ohlcv.source}`)
  } else {
    lines.push("warning: no geckoterminal network for the PEPE pair")
  }

  console.log(lines.join("\n"))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
