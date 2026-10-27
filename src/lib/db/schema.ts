import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  primaryKey,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import type { ScoreSnapshot } from "../types"

export type Candle = { t: number; p: number; v: number }

export const influencers = pgTable(
  "influencers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    xUserId: text("x_user_id").unique(),
    username: text("username").notNull().unique(),
    name: text("name").notNull().default(""),
    profileImageUrl: text("profile_image_url"),
    followersCount: integer("followers_count").notNull().default(0),
    followingCount: integer("following_count").notNull().default(0),
    tweetCount: integer("tweet_count").notNull().default(0),
    listedCount: integer("listed_count").notNull().default(0),
    tracked: boolean("tracked").notNull().default(true),
    isDemo: boolean("is_demo").notNull().default(false),
    /** pulsechain, ethereum, solana, … Preferred chain when a symbol exists on more than one. */
    chainBias: text("chain_bias"),
    /** Lowercase word → ticker symbol, used only for this voice. */
    aliases: jsonb("aliases").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    latestPostId: text("latest_post_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("influencers_tracked_idx").on(t.tracked)],
)

export const posts = pgTable(
  "posts",
  {
    id: text("id").primaryKey(),
    influencerId: uuid("influencer_id")
      .notNull()
      .references(() => influencers.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    textHash: text("text_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    likeCount: integer("like_count").notNull().default(0),
    retweetCount: integer("retweet_count").notNull().default(0),
    replyCount: integer("reply_count").notNull().default(0),
    quoteCount: integer("quote_count").notNull().default(0),
    bookmarkCount: integer("bookmark_count").notNull().default(0),
    impressionCount: integer("impression_count").notNull().default(0),
    url: text("url").notNull(),
    isDemo: boolean("is_demo").notNull().default(false),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("posts_influencer_created_idx").on(t.influencerId, t.createdAt)],
)

export const mentions = pgTable(
  "mentions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    influencerId: uuid("influencer_id")
      .notNull()
      .references(() => influencers.id, { onDelete: "cascade" }),
    matchKey: text("match_key").notNull(),
    rawText: text("raw_text").notNull(),
    matchType: text("match_type").notNull(),
    symbol: text("symbol"),
    assetName: text("asset_name"),
    assetKey: text("asset_key"),
    coingeckoId: text("coingecko_id"),
    chain: text("chain"),
    contractAddress: text("contract_address"),
    pairAddress: text("pair_address"),
    dexscreenerUrl: text("dexscreener_url"),
    binanceSymbol: text("binance_symbol"),
    geckoterminalNetwork: text("geckoterminal_network"),
    confidence: text("confidence").notNull().default("low"),
    confidenceReason: text("confidence_reason"),
    /** high, medium, low, or ambiguous. */
    resolutionConfidence: text("resolution_confidence"),
    resolutionStatus: text("resolution_status").notNull().default("pending"),
    /** call, retro_brag, commentary, negative, joke. Only call is scored. */
    callKind: text("call_kind").notNull().default("call"),
    /** dead or rugged. Null while the asset still has a pool. */
    assetState: text("asset_state"),
    priceSource: text("price_source"),
    priceAt: doublePrecision("price_at"),
    price1h: doublePrecision("price_1h"),
    price24h: doublePrecision("price_24h"),
    price7d: doublePrecision("price_7d"),
    price30d: doublePrecision("price_30d"),
    priceNow: doublePrecision("price_now"),
    price24hBefore: doublePrecision("price_24h_before"),
    price7dBefore: doublePrecision("price_7d_before"),
    roi1h: doublePrecision("roi_1h"),
    roi24h: doublePrecision("roi_24h"),
    roi7d: doublePrecision("roi_7d"),
    roi30d: doublePrecision("roi_30d"),
    roiNow: doublePrecision("roi_now"),
    maxGain: doublePrecision("max_gain"),
    maxDrawdown: doublePrecision("max_drawdown"),
    maxPriceAfter: doublePrecision("max_price_after"),
    minPriceAfter: doublePrecision("min_price_after"),
    volumeBefore24h: doublePrecision("volume_before_24h"),
    volumeAfter24h: doublePrecision("volume_after_24h"),
    runup24h: doublePrecision("runup_24h"),
    runup7d: doublePrecision("runup_7d"),
    pumpDumpScore: doublePrecision("pump_dump_score"),
    pumpDumpFlag: boolean("pump_dump_flag").notNull().default(false),
    pumpDumpReasons: jsonb("pump_dump_reasons")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    series: jsonb("series").$type<Candle[]>(),
    priceStatus: text("price_status").notNull().default("pending"),
    priceError: text("price_error"),
    priceAttempts: integer("price_attempts").notNull().default(0),
    pinned: boolean("pinned").notNull().default(false),
    isDemo: boolean("is_demo").notNull().default(false),
    pricedAt: timestamp("priced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("mentions_post_match_idx").on(t.postId, t.matchKey),
    index("mentions_influencer_idx").on(t.influencerId),
    index("mentions_symbol_idx").on(t.symbol),
    index("mentions_asset_key_idx").on(t.assetKey),
    index("mentions_price_status_idx").on(t.priceStatus),
    index("mentions_created_idx").on(t.createdAt),
  ],
)

export const influencerStats = pgTable("influencer_stats", {
  influencerId: uuid("influencer_id")
    .primaryKey()
    .references(() => influencers.id, { onDelete: "cascade" }),
  shillCount: integer("shill_count").notNull().default(0),
  postCount: integer("post_count").notNull().default(0),
  uniqueTickers: integer("unique_tickers").notNull().default(0),
  pricedCount: integer("priced_count").notNull().default(0),
  winRate1h: doublePrecision("win_rate_1h"),
  winRate24h: doublePrecision("win_rate_24h"),
  winRate7d: doublePrecision("win_rate_7d"),
  winRate30d: doublePrecision("win_rate_30d"),
  winRateNow: doublePrecision("win_rate_now"),
  avgRoi1h: doublePrecision("avg_roi_1h"),
  avgRoi24h: doublePrecision("avg_roi_24h"),
  avgRoi7d: doublePrecision("avg_roi_7d"),
  avgRoi30d: doublePrecision("avg_roi_30d"),
  avgRoiNow: doublePrecision("avg_roi_now"),
  medianRoi1h: doublePrecision("median_roi_1h"),
  medianRoi24h: doublePrecision("median_roi_24h"),
  medianRoi7d: doublePrecision("median_roi_7d"),
  medianRoi30d: doublePrecision("median_roi_30d"),
  medianRoiNow: doublePrecision("median_roi_now"),
  portfolio1h: doublePrecision("portfolio_1h"),
  portfolio24h: doublePrecision("portfolio_24h"),
  portfolio7d: doublePrecision("portfolio_7d"),
  portfolio30d: doublePrecision("portfolio_30d"),
  portfolioNow: doublePrecision("portfolio_now"),
  portfolioN1h: integer("portfolio_n_1h").notNull().default(0),
  portfolioN24h: integer("portfolio_n_24h").notNull().default(0),
  portfolioN7d: integer("portfolio_n_7d").notNull().default(0),
  portfolioN30d: integer("portfolio_n_30d").notNull().default(0),
  portfolioNNow: integer("portfolio_n_now").notNull().default(0),
  bestMentionId: uuid("best_mention_id").references(() => mentions.id, {
    onDelete: "set null",
  }),
  worstMentionId: uuid("worst_mention_id").references(() => mentions.id, {
    onDelete: "set null",
  }),
  repeatAssets: integer("repeat_assets").notNull().default(0),
  pumpDumpCount: integer("pump_dump_count").notNull().default(0),
  pumpDumpRate: doublePrecision("pump_dump_rate"),
  avgPumpScore: doublePrecision("avg_pump_score"),
  dumpRiskScore: doublePrecision("dump_risk_score"),
  credibilityScore: doublePrecision("credibility_score"),
  credibilityHorizon: text("credibility_horizon"),
  sampleSize: integer("sample_size").notNull().default(0),
  /** ROI, win rate, book, and dump scores if every mention is included. Null until the next recompute. */
  allScores: jsonb("all_scores").$type<ScoreSnapshot>(),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
})

/** One row per asset per UTC day so repeated tickers reuse candles. */
export const candleDays = pgTable(
  "candle_days",
  {
    assetKey: text("asset_key").notNull(),
    day: text("day").notNull(),
    candles: jsonb("candles").$type<Candle[]>().notNull().default(sql`'[]'::jsonb`),
    source: text("source").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.assetKey, t.day] })],
)

export const quotes = pgTable("quotes", {
  assetKey: text("asset_key").primaryKey(),
  symbol: text("symbol").notNull(),
  name: text("name"),
  price: doublePrecision("price").notNull(),
  change24h: doublePrecision("change_24h"),
  source: text("source").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const apiCache = pgTable("api_cache", {
  cacheKey: text("cache_key").primaryKey(),
  payload: jsonb("payload").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
})

export const cronRuns = pgTable("cron_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  job: text("job").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  ok: boolean("ok"),
  detail: jsonb("detail"),
})
