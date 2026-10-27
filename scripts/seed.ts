import { eq } from "drizzle-orm"
import { canonicalBySymbol } from "../src/lib/detect/assets"
import { collapseMatches, extractMatches, identifyFast, type IdentifiedMatch } from "../src/lib/detect/extract"
import { getDb, getPool } from "../src/lib/db"
import { influencers, mentions, posts, quotes } from "../src/lib/db/schema"
import { loadLocalEnv } from "../src/lib/env"
import { assetKeyOf, postUrl } from "../src/lib/format"
import { textHash } from "../src/lib/http"
import { evaluateCall, type Candle } from "../src/lib/scoring/evaluate"
import { recomputeInfluencers } from "../src/lib/stats"

loadLocalEnv()

const HOUR = 60 * 60 * 1000
const NOW = Date.now()

const EPOCH = BigInt("1288834974657")
function snowflake(date: Date, seq: number) {
  const ms = BigInt(date.getTime()) - EPOCH
  return ((ms << BigInt(22)) + BigInt(seq)).toString()
}

function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SHAPES = {
  rally: [
    { h: -168, m: 0.9 },
    { h: -24, m: 0.97 },
    { h: 0, m: 1 },
    { h: 1, m: 1.012 },
    { h: 24, m: 1.08 },
    { h: 168, m: 1.22 },
    { h: 720, m: 1.34 },
  ],
  dump: [
    { h: -168, m: 0.42 },
    { h: -24, m: 0.74 },
    { h: 0, m: 1 },
    { h: 1, m: 1.05 },
    { h: 24, m: 0.62 },
    { h: 168, m: 0.35 },
    { h: 720, m: 0.27 },
  ],
  late: [
    { h: -168, m: 0.55 },
    { h: -24, m: 0.88 },
    { h: 0, m: 1 },
    { h: 1, m: 0.99 },
    { h: 24, m: 0.92 },
    { h: 168, m: 0.83 },
    { h: 720, m: 0.79 },
  ],
  fade: [
    { h: -168, m: 1.05 },
    { h: -24, m: 1.02 },
    { h: 0, m: 1 },
    { h: 1, m: 0.99 },
    { h: 24, m: 0.9 },
    { h: 168, m: 0.76 },
    { h: 720, m: 0.7 },
  ],
  chop: [
    { h: -168, m: 0.98 },
    { h: -24, m: 1.03 },
    { h: 0, m: 1 },
    { h: 1, m: 1.004 },
    { h: 24, m: 1.01 },
    { h: 168, m: 0.99 },
    { h: 720, m: 1.05 },
  ],
  rip: [
    { h: -168, m: 0.8 },
    { h: -24, m: 0.94 },
    { h: 0, m: 1 },
    { h: 1, m: 1.04 },
    { h: 24, m: 1.26 },
    { h: 168, m: 1.72 },
    { h: 720, m: 1.48 },
  ],
} as const

type ShapeName = keyof typeof SHAPES

type CallPlan = {
  shape?: ShapeName
  pinned?: boolean
  pending?: boolean
  lowConfidence?: boolean
  base?: number
  symbol?: string
  chain?: string
}

const voices = [
  { username: "macro_moon", name: "Macro Moon", followers: 542000, following: 410, tweets: 12880, listed: 4102 },
  { username: "northstar_nfa", name: "Northstar", followers: 418200, following: 890, tweets: 22140, listed: 2660 },
  { username: "wendy_wagmi", name: "Wendy Wagmi", followers: 207450, following: 1204, tweets: 34002, listed: 980 },
  { username: "sol_psychic", name: "Sol Psychic", followers: 96400, following: 640, tweets: 8900, listed: 410 },
  { username: "exit_lou", name: "Exit Liquidity Lou", followers: 63820, following: 2100, tweets: 17550, listed: 220 },
  { username: "vega_dump", name: "Vega Dump", followers: 186900, following: 455, tweets: 6400, listed: 1330 },
]

const tape: {
  voice: string
  hoursAgo: number
  text: string
  likes: number
  reposts: number
  replies: number
  views: number
  book?: Record<string, CallPlan>
}[] = [
  {
    voice: "macro_moon",
    hoursAgo: 900,
    text: "Still adding bitcoin on red days. The demo book does not trade the timeline.",
    likes: 4200,
    reposts: 610,
    replies: 188,
    views: 890000,
    book: { BTC: { shape: "rally", pinned: true } },
  },
  {
    voice: "macro_moon",
    hoursAgo: 520,
    text: "$ETH holding the weekly range. If this is the local low I want it written down.",
    likes: 2100,
    reposts: 240,
    replies: 96,
    views: 410000,
    book: { ETH: { shape: "rally", pinned: true } },
  },
  {
    voice: "macro_moon",
    hoursAgo: 240,
    text: "solana relative strength is back. Throughput, not a mascot.",
    likes: 1660,
    reposts: 190,
    replies: 74,
    views: 250000,
    book: { SOL: { shape: "rally", pinned: true } },
  },
  {
    voice: "macro_moon",
    hoursAgo: 40,
    text: "Office hours. Reading filings, not cashtags.",
    likes: 640,
    reposts: 22,
    replies: 41,
    views: 98000,
  },
  {
    voice: "macro_moon",
    hoursAgo: 3,
    text: "$BTC add, small. This print is left for the price cron so Binance can draw the real path.",
    likes: 980,
    reposts: 70,
    replies: 55,
    views: 140000,
    book: { BTC: { pending: true, pinned: false } },
  },
  {
    voice: "northstar_nfa",
    hoursAgo: 760,
    text: "$LINK is the slow bid. Oracles do not care about your 15 minute candle.",
    likes: 1540,
    reposts: 210,
    replies: 63,
    views: 300000,
    book: { LINK: { shape: "rally", pinned: true } },
  },
  {
    voice: "northstar_nfa",
    hoursAgo: 300,
    text: "ethereum looks cleaner than the timeline. $ETH, not a victory lap.",
    likes: 1888,
    reposts: 260,
    replies: 101,
    views: 360000,
    book: { ETH: { shape: "chop", pinned: true } },
  },
  {
    voice: "northstar_nfa",
    hoursAgo: 90,
    text: "$SOL and bitcoin in the same notebook. Two clocks, one risk budget.",
    likes: 990,
    reposts: 80,
    replies: 70,
    views: 150000,
    book: {
      SOL: { shape: "chop", pinned: true },
      BTC: { shape: "chop", pinned: true },
    },
  },
  {
    voice: "northstar_nfa",
    hoursAgo: 28,
    text: "$AVAX bounce is a trade, not a personality.",
    likes: 720,
    reposts: 44,
    replies: 39,
    views: 88000,
    book: { AVAX: { shape: "late", pinned: true } },
  },
  {
    voice: "northstar_nfa",
    hoursAgo: 2,
    text: "gm. No coins in this one. Coffee, then the book.",
    likes: 410,
    reposts: 12,
    replies: 28,
    views: 42000,
  },
  {
    voice: "wendy_wagmi",
    hoursAgo: 680,
    text: "$SOL, first of three. I will be annoying about it.",
    likes: 3200,
    reposts: 540,
    replies: 210,
    views: 640000,
    book: { SOL: { shape: "rip", pinned: true } },
  },
  {
    voice: "wendy_wagmi",
    hoursAgo: 200,
    text: "Back in solana. $SOL. Same thesis, smaller size.",
    likes: 1410,
    reposts: 130,
    replies: 88,
    views: 190000,
    book: { SOL: { shape: "rally", pinned: true } },
  },
  {
    voice: "wendy_wagmi",
    hoursAgo: 110,
    text: "$JUP is the exchange I actually route through.",
    likes: 860,
    reposts: 70,
    replies: 40,
    views: 102000,
    book: { JUP: { shape: "rally", pinned: true } },
  },
  {
    voice: "wendy_wagmi",
    hoursAgo: 16,
    text: "$BONK for the group chat and $SOL again because I cannot help it.",
    likes: 2100,
    reposts: 300,
    replies: 240,
    views: 410000,
    book: {
      BONK: { shape: "chop", pinned: true },
      SOL: { shape: "chop", pinned: true },
    },
  },
  {
    voice: "wendy_wagmi",
    hoursAgo: 5,
    text: "Touching grass. The book can wait an afternoon.",
    likes: 1500,
    reposts: 40,
    replies: 90,
    views: 120000,
  },
  {
    voice: "sol_psychic",
    hoursAgo: 820,
    text: "$WIF hat stays on. Do not make it complicated.",
    likes: 5400,
    reposts: 900,
    replies: 330,
    views: 980000,
    book: { WIF: { shape: "rip", pinned: true } },
  },
  {
    voice: "sol_psychic",
    hoursAgo: 260,
    text: "dogwifhat is still the mascot. $WIF, smaller than the first time.",
    likes: 1200,
    reposts: 140,
    replies: 77,
    views: 210000,
    book: { WIF: { shape: "late", pinned: true } },
  },
  {
    voice: "sol_psychic",
    hoursAgo: 120,
    text: "The other chain is rent. solana is the apartment. $SOL.",
    likes: 980,
    reposts: 110,
    replies: 64,
    views: 160000,
    book: { SOL: { shape: "rally", pinned: true } },
  },
  {
    voice: "sol_psychic",
    hoursAgo: 60,
    text: "Mint only, for the people who asked: EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
    likes: 760,
    reposts: 88,
    replies: 51,
    views: 130000,
    book: {
      CONTRACT: { symbol: "WIF", shape: "dump", pinned: true, chain: "solana" },
    },
  },
  {
    voice: "sol_psychic",
    hoursAgo: 9,
    text: "Quiet tape. Watching funding, not posting a coin.",
    likes: 300,
    reposts: 8,
    replies: 19,
    views: 28000,
  },
  {
    voice: "exit_lou",
    hoursAgo: 640,
    text: "Everyone already bought bitcoin. I'm in $BTC now.",
    likes: 210,
    reposts: 14,
    replies: 80,
    views: 54000,
    book: { BTC: { shape: "late", pinned: true } },
  },
  {
    voice: "exit_lou",
    hoursAgo: 300,
    text: "$PEPE because the chat said the frog was due.",
    likes: 430,
    reposts: 22,
    replies: 95,
    views: 77000,
    book: { PEPE: { shape: "fade", pinned: true } },
  },
  {
    voice: "exit_lou",
    hoursAgo: 150,
    text: "$DOGE is a culture I keep arriving at late.",
    likes: 260,
    reposts: 18,
    replies: 44,
    views: 39000,
    book: { DOGE: { shape: "late", pinned: true } },
  },
  {
    voice: "exit_lou",
    hoursAgo: 36,
    text: "Bought ethereum after the green candle. $ETH. I know.",
    likes: 180,
    reposts: 9,
    replies: 70,
    views: 31000,
    book: { ETH: { shape: "fade", pinned: true } },
  },
  {
    voice: "exit_lou",
    hoursAgo: 14,
    text: "No call today. Just the regret, neatly filed.",
    likes: 90,
    reposts: 2,
    replies: 16,
    views: 12000,
  },
  {
    voice: "vega_dump",
    hoursAgo: 480,
    text: "$PEPE already did the face-ripping part. Sending it anyway.",
    likes: 6100,
    reposts: 1400,
    replies: 880,
    views: 1500000,
    book: { PEPE: { shape: "dump", pinned: true } },
  },
  {
    voice: "vega_dump",
    hoursAgo: 300,
    text: "Contract for the copy traders: 0x6982508145454Ce325dDbE47a25d4ec3d2311933",
    likes: 2400,
    reposts: 510,
    replies: 300,
    views: 640000,
    book: {
      CONTRACT: { symbol: "PEPE", shape: "dump", pinned: true, chain: "ethereum" },
    },
  },
  {
    voice: "vega_dump",
    hoursAgo: 190,
    text: "$WIF up only. Do not look at the left side of the chart.",
    likes: 4800,
    reposts: 990,
    replies: 640,
    views: 1200000,
    book: { WIF: { shape: "dump", pinned: true } },
  },
  {
    voice: "vega_dump",
    hoursAgo: 50,
    text: "$BRETT because crowded tickers are a sport. Low conviction, high volume.",
    likes: 1900,
    reposts: 240,
    replies: 410,
    views: 380000,
    book: { BRETT: { shape: "dump", pinned: true, lowConfidence: true, base: 0.084 } },
  },
  {
    voice: "vega_dump",
    hoursAgo: 18,
    text: "$OMNI is the one. Do your own work, the symbol is a crowd.",
    likes: 2600,
    reposts: 430,
    replies: 520,
    views: 540000,
    book: { OMNI: { pending: true, pinned: false } },
  },
  {
    voice: "vega_dump",
    hoursAgo: 8,
    text: "If this mint resolves I'll eat my hat: 0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    likes: 800,
    reposts: 60,
    replies: 140,
    views: 99000,
    book: { CONTRACT: { pending: true, pinned: false, chain: "ethereum" } },
  },
  {
    voice: "vega_dump",
    hoursAgo: 4,
    text: "Logging off. The book does not get better if I stare at it.",
    likes: 1100,
    reposts: 30,
    replies: 48,
    views: 76000,
  },
]

function buildSeries(opts: {
  postedAt: number
  base: number
  shape: ShapeName
  seed: number
}) {
  const anchors = SHAPES[opts.shape]
  const start = opts.postedAt - 7 * 24 * HOUR
  const end = Math.min(NOW, opts.postedAt + 30 * 24 * HOUR)
  const knots = anchors
    .map((anchor) => ({ t: opts.postedAt + anchor.h * HOUR, p: opts.base * anchor.m }))
    .sort((a, b) => a.t - b.t)

  const priceAtTime = (time: number) => {
    if (time <= knots[0].t) return knots[0].p
    if (time >= knots[knots.length - 1].t) return knots[knots.length - 1].p
    let index = 1
    while (index < knots.length && knots[index].t < time) index += 1
    const left = knots[index - 1]
    const right = knots[index]
    const u = (time - left.t) / (right.t - left.t)
    return Math.exp(Math.log(left.p) + (Math.log(right.p) - Math.log(left.p)) * u)
  }

  const rand = mulberry32(opts.seed)
  const candles: Candle[] = []
  for (let t = Math.floor(start / HOUR) * HOUR; t <= end; t += HOUR) {
    const noise = 1 + (rand() - 0.5) * 0.01
    const age = (t - opts.postedAt) / HOUR
    let volume = 80_000 + rand() * 20_000
    if (opts.shape === "dump") {
      if (age > -24 && age <= 0) volume *= 2.1
      if (age > 0 && age <= 24) volume *= 3.5
    } else if (opts.shape === "late") {
      if (age > -24 && age <= 0) volume *= 2.8
      if (age > 0 && age <= 24) volume *= 0.4
    } else if (opts.shape === "rip") {
      if (age > 0 && age <= 24) volume *= 1.8
    }
    candles.push({ t, p: priceAtTime(t) * noise, v: volume })
  }

  const snap = (time: number, price: number) => {
    let index = -1
    for (let i = 0; i < candles.length; i += 1) {
      if (candles[i].t <= time) index = i
    }
    if (index >= 0) candles[index].p = price
  }
  snap(opts.postedAt, opts.base)
  for (const knot of knots) snap(knot.t, knot.p)
  return candles
}

async function main() {
  if (process.env.SEED_DEMO !== "true") {
    console.log("SEED_DEMO is not true. Skipping demo voices. Set SEED_DEMO=true to load them.")
    return
  }
  const db = getDb()
  await db.delete(influencers).where(eq(influencers.isDemo, true))

  const ids = new Map<string, string>()
  for (const voice of voices) {
    const inserted = await db
      .insert(influencers)
      .values({
        xUserId: `9000${voice.username.length}${voice.followers}`,
        username: voice.username,
        name: voice.name,
        profileImageUrl: `/avatars/${voice.username}`,
        followersCount: voice.followers,
        followingCount: voice.following,
        tweetCount: voice.tweets,
        listedCount: voice.listed,
        tracked: true,
        isDemo: true,
      })
      .returning()
    ids.set(voice.username, inserted[0].id)
  }

  let seq = 1
  const latest = new Map<string, string>()
  let priced = 0
  let pending = 0

  for (const item of tape) {
    const influencerId = ids.get(item.voice)
    if (!influencerId) throw new Error(`missing voice ${item.voice}`)
    const createdAt = new Date(NOW - item.hoursAgo * HOUR)
    const id = snowflake(createdAt, seq)
    seq += 1
    latest.set(item.voice, id)
    await db.insert(posts).values({
      id,
      influencerId,
      text: item.text,
      textHash: textHash(item.text),
      createdAt,
      likeCount: item.likes,
      retweetCount: item.reposts,
      replyCount: item.replies,
      quoteCount: Math.round(item.reposts / 5),
      bookmarkCount: Math.round(item.likes / 8),
      impressionCount: item.views,
      url: postUrl(item.voice, id),
      isDemo: true,
    })

    if (!item.book) {
      const stray = extractMatches(item.text)
      if (stray.length) throw new Error(`unexpected ticker in non-call: ${item.text}`)
      continue
    }

    let matches = collapseMatches(extractMatches(item.text).map(identifyFast))
    if (!matches.length) throw new Error(`expected a ticker in: ${item.text}`)

    const contractPlan = item.book.CONTRACT
    if (contractPlan?.symbol) {
      const known = canonicalBySymbol(contractPlan.symbol)
      matches = matches.map((match) =>
        match.contractAddress
          ? {
              ...match,
              symbol: contractPlan.symbol ?? match.symbol,
              assetName: known?.name ?? contractPlan.symbol ?? null,
              coingeckoId: contractPlan.lowConfidence ? null : (known?.id ?? null),
              binanceSymbol: contractPlan.lowConfidence ? null : (known?.binance ?? null),
              chain: contractPlan.chain ?? null,
              confidence: (contractPlan.lowConfidence ? "low" : "high") as "low" | "high",
              confidenceReason: contractPlan.lowConfidence
                ? "Demo seed pinned a crowded ticker on purpose."
                : `Demo seed pinned this contract to canonical ${contractPlan.symbol}. A live ingest confirms the pair on DexScreener before trusting it.`,
              resolutionStatus: "resolved" as const,
            }
          : match,
      )
      matches = collapseMatches(matches)
    }

    for (const match of matches) {
      const key = match.contractAddress && item.book.CONTRACT && !match.symbol ? "CONTRACT" : (match.symbol ?? "CONTRACT")
      const plan = item.book[key] ?? item.book.CONTRACT
      if (!plan) throw new Error(`no plan for ${key} in: ${item.text}`)

      if (plan.pending) {
        pending += 1
        await db.insert(mentions).values({
          postId: id,
          influencerId,
          matchKey: match.matchKey,
          rawText: match.rawText,
          matchType: match.matchType,
          symbol: plan.symbol ?? match.symbol,
          assetName: match.assetName,
          assetKey: assetKeyOf({
            coingeckoId: match.coingeckoId,
            contractAddress: match.contractAddress,
            chain: plan.chain,
            symbol: plan.symbol ?? match.symbol,
          }),
          coingeckoId: match.coingeckoId,
          binanceSymbol: match.binanceSymbol,
          chain: plan.chain ?? (match.matchType === "solana" ? "solana" : match.matchType === "evm" ? "ethereum" : null),
          contractAddress: match.contractAddress,
          confidence: match.confidence,
          confidenceReason: match.confidenceReason,
          resolutionStatus: match.resolutionStatus,
          priceStatus: "pending",
          pinned: false,
          isDemo: true,
          createdAt,
        })
        continue
      }

      const symbol = plan.symbol ?? match.symbol
      const known = symbol ? canonicalBySymbol(symbol) : null
      const base = plan.base ?? known?.demoPrice
      if (!plan.shape || base == null) throw new Error(`shape missing for ${symbol}`)
      const candles = buildSeries({
        postedAt: createdAt.getTime(),
        base,
        shape: plan.shape,
        seed: seq * 1000 + item.hoursAgo,
      })
      const evaluated = evaluateCall({ postedAt: createdAt.getTime(), now: NOW, candles })
      if (plan.shape === "dump" && item.hoursAgo > 24 * 8 && !evaluated.pumpDumpFlag) {
        throw new Error(`dump shape did not flag for ${item.voice} ${symbol} score=${evaluated.pumpDumpScore}`)
      }
      const low = Boolean(plan.lowConfidence)
      priced += 1
      await db.insert(mentions).values({
        postId: id,
        influencerId,
        matchKey: match.matchKey,
        rawText: match.rawText,
        matchType: match.matchType,
        symbol,
        assetName: low ? `${symbol} (crowded ticker)` : (known?.name ?? match.assetName),
        assetKey: low ? `sym:${symbol}` : assetKeyOf({
          coingeckoId: known?.id ?? match.coingeckoId,
          contractAddress: match.contractAddress,
          chain: plan.chain,
          symbol,
        }),
        coingeckoId: low ? null : (known?.id ?? match.coingeckoId),
        binanceSymbol: low ? null : (known?.binance ?? match.binanceSymbol),
        chain: plan.chain ?? (match.matchType === "solana" ? "solana" : match.matchType === "evm" ? "ethereum" : null),
        contractAddress: match.contractAddress,
        confidence: low ? "low" : "high",
        confidenceReason: low
          ? `${symbol} is a crowded ticker. This demo path is pinned and illustrative, not an automatic market-cap winner.`
          : match.confidenceReason,
        resolutionStatus: "resolved",
        priceSource: "seed",
        priceAt: evaluated.priceAt,
        price1h: evaluated.price1h,
        price24h: evaluated.price24h,
        price7d: evaluated.price7d,
        price30d: evaluated.price30d,
        priceNow: evaluated.priceNow,
        price24hBefore: evaluated.price24hBefore,
        price7dBefore: evaluated.price7dBefore,
        roi1h: evaluated.roi1h,
        roi24h: evaluated.roi24h,
        roi7d: evaluated.roi7d,
        roi30d: evaluated.roi30d,
        roiNow: evaluated.roiNow,
        maxGain: evaluated.maxGain,
        maxDrawdown: evaluated.maxDrawdown,
        maxPriceAfter: evaluated.maxPriceAfter,
        minPriceAfter: evaluated.minPriceAfter,
        volumeBefore24h: evaluated.volumeBefore24h,
        volumeAfter24h: evaluated.volumeAfter24h,
        runup24h: evaluated.runup24h,
        runup7d: evaluated.runup7d,
        pumpDumpScore: evaluated.pumpDumpScore,
        pumpDumpFlag: evaluated.pumpDumpFlag,
        pumpDumpReasons: evaluated.pumpDumpReasons,
        series: candles,
        priceStatus: evaluated.priceStatus,
        pinned: plan.pinned !== false,
        isDemo: true,
        pricedAt: new Date(NOW),
        createdAt,
      })
    }
  }

  for (const [username, postId] of latest) {
    const influencerId = ids.get(username)
    if (!influencerId) continue
    await db.update(influencers).set({ latestPostId: postId }).where(eq(influencers.id, influencerId))
  }

  for (const asset of ["BTC", "ETH", "SOL", "PEPE", "WIF", "DOGE", "LINK", "AVAX", "BONK", "JUP"]) {
    const known = canonicalBySymbol(asset)
    if (!known) continue
    await db
      .insert(quotes)
      .values({
        assetKey: `cg:${known.id}`,
        symbol: known.symbol,
        name: known.name,
        price: known.demoPrice,
        change24h: 0,
        source: "seed",
      })
      .onConflictDoNothing()
  }

  await recomputeInfluencers([...ids.values()])
  console.log(`seeded ${voices.length} demo voices, ${tape.length} posts, ${priced} priced calls, ${pending} awaiting a live lookup`)
  await getPool().end()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
