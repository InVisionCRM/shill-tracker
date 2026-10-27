import { WEIGHTS } from "@/lib/scoring/evaluate"

export const metadata = { title: "Method" }

export default function MethodologyPage() {
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-8">
      <header>
        <p className="font-mono text-xs tracking-[0.18em] text-phosphor uppercase">Method</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">How a call gets a score</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          The numbers on this page are the constants the scorer uses. A flag is not a legal finding and not proof
          that someone meant to dump. It is a pattern on public prices around a public post.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">1. What counts as a mention</h2>
        <p className="text-sm leading-6">
          Cashtags like $SOL, a short list of unmistakable coin names (bitcoin, ethereum, solana, dogwifhat…),
          EVM contracts (0x plus 40 hex characters), and Solana mints (32–44 base58 characters with mixed case and a
          digit). Dollar amounts and words like $NFA are ignored. Near, link, and atom are cashtag-only so ordinary
          sentences do not become trades.
        </p>
        <p className="text-sm leading-6">
          Mentions in one post that resolve to the same asset collapse into a single call. A post that names two
          different assets is two calls, and the $100 simulation stakes both.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">2. Which asset</h2>
        <p className="text-sm leading-6">
          Canonical large caps resolve immediately to a CoinGecko id and, where one exists, a Binance USDT pair.
          Everything else waits for CoinGecko search plus market cap, then DexScreener liquidity. The biggest market
          cap wins. Confidence is high when the leader is at least 5× the runner-up and above $5M, medium when the
          lead is at least 2× and above $1M, and low when the field is crowded. Contracts take the DexScreener pair
          with the most liquidity. A thin book stays low confidence and is badged in the UI. A PulseChain-focused
          voice resolves HEX, PLS, PLSX, INC, and PDAI to PulseChain pools instead of the same symbol on another
          chain. HEX on every other voice is the Ethereum listing. The chain is shown next to the ticker.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">3. Price at the post, and after</h2>
        <p className="text-sm leading-6">
          The entry is the last candle at or before the post. If that candle is more than 36 hours away, the print
          is missing rather than guessed. The same rule fills +1h, +24h, +7d, and +30d once those clocks have
          passed. Horizons that are not due yet stay blank. Max gain and max drawdown use candles strictly after
          the post until 30 days later or now, whichever comes first. Current marks refresh from Binance 24h
          tickers, CoinGecko simple price, or DexScreener, and they can extend the excursion only inside that 30
          day window.
        </p>
        <p className="text-sm leading-6">
          Majors use Binance 1h klines, then CoinGecko range if Binance has no pair. Contracts use GeckoTerminal
          hourly pool OHLCV. Returns are exit / entry − 1. There is no fee and no slippage model.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">4. Pump-then-dump score</h2>
        <p className="text-sm leading-6">
          The score is 0–100 and needs a pre-call window. Without a price 24h or 7d before the post, the score is
          blank.
        </p>
        <ul className="list-disc pl-5 text-sm leading-6">
          <li>
            Pre-pump, up to {WEIGHTS.prePump24hPoints} points: the 24h run-up ramps from{" "}
            {pct(WEIGHTS.prePump24hFloor)} to {pct(WEIGHTS.prePump24hCeil)}.
          </li>
          <li>
            Pre-pump, up to {WEIGHTS.prePump7dPoints} points: the 7d run-up ramps from {pct(WEIGHTS.prePump7dFloor)}{" "}
            to {pct(WEIGHTS.prePump7dCeil)}. The higher of the two pre-pump readings is kept.
          </li>
          <li>
            Post-dump, up to {WEIGHTS.postDumpPoints} points: the worst of the 24h and 7d returns, ramped from{" "}
            {pct(WEIGHTS.postDumpFloor)} down to {pct(WEIGHTS.postDumpCeil)}. If only the 1h print exists, that
            leg is capped at {WEIGHTS.earlyDumpPoints}.
          </li>
          <li>
            Volume, {WEIGHTS.volumeDistributePoints} points if the chart had already run, the post-call return is
            negative, and 24h volume after is at least {WEIGHTS.volumeDistributeRatio}× the 24h before.{" "}
            {WEIGHTS.volumeVanishPoints} points if that volume instead falls to {pct(WEIGHTS.volumeVanishRatio)} or
            less.
          </li>
        </ul>
        <p className="text-sm leading-6">
          A call is flagged when the score reaches {WEIGHTS.flagScore}, or when the 24h run-up was at least{" "}
          {pct(WEIGHTS.flagRunup24h)} and the 24h return is {pct(WEIGHTS.flagRoi24h)} or worse, or when the 7d
          run-up was at least {pct(WEIGHTS.flagRunup7d)} and the later return is {pct(WEIGHTS.flagRoiAfter)} or
          worse.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">5. Voice scores</h2>
        <p className="text-sm leading-6">
          Credibility uses the longest horizon that has at least {WEIGHTS.minSampleForPreferredHorizon} settled
          calls, in the order 7d, then 24h, then 1h. It is the win rate times {WEIGHTS.credibilityWinPoints}, plus
          the median return ramped from {pct(WEIGHTS.credibilityMedianFloor)} to {pct(WEIGHTS.credibilityMedianCeil)}{" "}
          for up to {WEIGHTS.credibilityMedianPoints} points, plus a cleanliness term worth up to{" "}
          {WEIGHTS.credibilityCleanPoints} as the pump-flag rate falls, plus up to {WEIGHTS.credibilitySamplePoints}{" "}
          for sample size with a prior of {WEIGHTS.credibilitySamplePrior}.
        </p>
        <p className="text-sm leading-6">
          Dump risk is the flag rate times {WEIGHTS.dumpRatePoints}, plus the average pump score scaled to{" "}
          {WEIGHTS.dumpAvgScorePoints}, plus up to {WEIGHTS.dumpPainPoints} when the median return is negative.
          Samples shrink toward {WEIGHTS.dumpPriorScore} with a prior of {WEIGHTS.dumpSamplePrior}, so three ugly
          calls do not automatically read as 100.
        </p>
        <p className="text-sm leading-6">
          The $100 book buys one stake per call at the entry candle and holds to the horizon you pick. Missing
          prints are left out of that horizon and counted in the “n of m” line. Repeat shills are assets named more
          than once by the same voice.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">6. What the labels mean</h2>
        <p className="text-sm leading-6">
          SEED is an illustrative path shipped with the demo voices. BINANCE, COINGECKO, and GECKOTERMINAL are live
          or historical prints from those public APIs. Pinned demo calls are not overwritten by the price cron.
          Pending calls are waiting on a lookup. Low confidence means the symbol was ambiguous and the winner was
          not obvious.
        </p>
      </section>
    </article>
  )
}

function pct(value: number) {
  const shown = Math.abs(value * 100)
  const sign = value < 0 ? "−" : ""
  return `${sign}${shown % 1 === 0 ? shown.toFixed(0) : shown.toFixed(0)}%`
}
