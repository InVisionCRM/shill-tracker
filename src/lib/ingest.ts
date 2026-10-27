import { and, eq } from "drizzle-orm"
import { collapseMatches, extractMatches, identifyFast } from "./detect/extract"
import { VOICE_PRESETS } from "./detect/pulse"
import { getDb } from "./db"
import { influencers, mentions, posts } from "./db/schema"
import { assetKeyOf, postUrl } from "./format"
import { asNumber, isRecord, laterSnowflake, normalizeUsername, parseTime, textHash } from "./http"
import { recomputeInfluencers } from "./stats"

export type IngestResult = {
  user: {
    id: string
    x_user_id: string | null
    username: string
    name: string
    created: boolean
  }
  posts_upserted: number
  posts_unchanged: number
  mentions_created: number
  mention_ids: string[]
}

export function parseIngestBody(body: unknown) {
  if (!isRecord(body)) return { error: "JSON object required" as const }
  if (!isRecord(body.user)) return { error: "user object required" as const }
  const user = body.user
  if (typeof user.id !== "string" || !user.id.trim()) return { error: "user.id is required" as const }
  if (typeof user.username !== "string") return { error: "user.username is required" as const }
  const username = normalizeUsername(user.username)
  if (!username) return { error: "user.username must be 1-15 letters, numbers, or underscores" as const }
  if (!Array.isArray(body.posts) || body.posts.length === 0) {
    return { error: "posts must be a non-empty array" as const }
  }
  if (body.posts.length > 100) return { error: "posts is capped at 100 per request" as const }

  const parsedPosts: {
    id: string
    text: string
    createdAt: Date
    likeCount: number
    retweetCount: number
    replyCount: number
    quoteCount: number
    bookmarkCount: number
    impressionCount: number
  }[] = []

  for (const [index, post] of body.posts.entries()) {
    if (!isRecord(post)) return { error: `posts[${index}] must be an object` as const }
    if (typeof post.id !== "string" || !/^\d{5,25}$/.test(post.id)) {
      return { error: `posts[${index}].id must be a numeric post id` as const }
    }
    if (typeof post.text !== "string") return { error: `posts[${index}].text must be a string` as const }
    if (typeof post.created_at !== "string") {
      return { error: `posts[${index}].created_at must be a date string` as const }
    }
    const createdAt = parseTime(post.created_at)
    if (!createdAt) return { error: `posts[${index}].created_at is not a valid date` as const }
    const metrics = isRecord(post.public_metrics) ? post.public_metrics : {}
    parsedPosts.push({
      id: post.id,
      text: post.text,
      createdAt,
      likeCount: asNumber(metrics.like_count),
      retweetCount: asNumber(metrics.retweet_count),
      replyCount: asNumber(metrics.reply_count),
      quoteCount: asNumber(metrics.quote_count),
      bookmarkCount: asNumber(metrics.bookmark_count),
      impressionCount: asNumber(metrics.impression_count),
    })
  }

  const userMetrics = isRecord(user.public_metrics) ? user.public_metrics : {}
  return {
    value: {
      user: {
        xUserId: user.id.trim(),
        username,
        name: typeof user.name === "string" ? user.name.slice(0, 80) : username,
        profileImageUrl:
          typeof user.profile_image_url === "string" ? user.profile_image_url : null,
        followersCount: asNumber(userMetrics.followers_count),
        followingCount: asNumber(userMetrics.following_count),
        tweetCount: asNumber(userMetrics.tweet_count),
        listedCount: asNumber(userMetrics.listed_count),
      },
      posts: parsedPosts,
    },
  }
}

export type IngestPayload = {
  user: {
    xUserId: string
    username: string
    name: string
    profileImageUrl: string | null
    followersCount: number
    followingCount: number
    tweetCount: number
    listedCount: number
  }
  posts: {
    id: string
    text: string
    createdAt: Date
    likeCount: number
    retweetCount: number
    replyCount: number
    quoteCount: number
    bookmarkCount: number
    impressionCount: number
  }[]
}

export async function ingestPosts(input: IngestPayload, options?: { deferPricing?: boolean }) {
  const db = getDb()
  const now = new Date()
  let created = false

  const byX = await db
    .select()
    .from(influencers)
    .where(eq(influencers.xUserId, input.user.xUserId))
    .limit(1)
  const byName = await db
    .select()
    .from(influencers)
    .where(eq(influencers.username, input.user.username))
    .limit(1)

  let influencer = byX[0] ?? byName[0]
  if (byX[0] && byName[0] && byX[0].id !== byName[0].id) {
    throw new Error(`username @${input.user.username} is already linked to a different X user id`)
  }

  const preset = VOICE_PRESETS[input.user.username]
  if (!influencer) {
    const inserted = await db
      .insert(influencers)
      .values({
        xUserId: input.user.xUserId,
        username: input.user.username,
        name: input.user.name,
        profileImageUrl: input.user.profileImageUrl,
        followersCount: input.user.followersCount,
        followingCount: input.user.followingCount,
        tweetCount: input.user.tweetCount,
        listedCount: input.user.listedCount,
        tracked: true,
        isDemo: false,
        chainBias: preset?.chainBias ?? null,
        aliases: preset?.aliases ?? {},
        updatedAt: now,
      })
      .returning()
    influencer = inserted[0]
    created = true
  } else {
    const updated = await db
      .update(influencers)
      .set({
        xUserId: input.user.xUserId,
        username: input.user.username,
        name: input.user.name || influencer.name,
        profileImageUrl: input.user.profileImageUrl ?? influencer.profileImageUrl,
        followersCount: input.user.followersCount || influencer.followersCount,
        followingCount: input.user.followingCount || influencer.followingCount,
        tweetCount: input.user.tweetCount || influencer.tweetCount,
        listedCount: input.user.listedCount || influencer.listedCount,
        tracked: true,
        chainBias: influencer.chainBias ?? preset?.chainBias ?? null,
        aliases:
          influencer.aliases && Object.keys(influencer.aliases).length
            ? influencer.aliases
            : (preset?.aliases ?? influencer.aliases),
        updatedAt: now,
      })
      .where(eq(influencers.id, influencer.id))
      .returning()
    influencer = updated[0]
  }

  let postsUpserted = 0
  let postsUnchanged = 0
  const mentionIds: string[] = []
  let latest = influencer.latestPostId

  for (const post of input.posts) {
    latest = laterSnowflake(latest, post.id)
    const hash = textHash(post.text)
    const existing = await db.select().from(posts).where(eq(posts.id, post.id)).limit(1)
    const unchanged = existing[0]?.textHash === hash && existing[0]?.influencerId === influencer.id

    await db
      .insert(posts)
      .values({
        id: post.id,
        influencerId: influencer.id,
        text: post.text,
        textHash: hash,
        createdAt: post.createdAt,
        likeCount: post.likeCount,
        retweetCount: post.retweetCount,
        replyCount: post.replyCount,
        quoteCount: post.quoteCount,
        bookmarkCount: post.bookmarkCount,
        impressionCount: post.impressionCount,
        url: postUrl(influencer.username, post.id),
        isDemo: false,
        ingestedAt: now,
      })
      .onConflictDoUpdate({
        target: posts.id,
        set: {
          influencerId: influencer.id,
          text: post.text,
          textHash: hash,
          createdAt: post.createdAt,
          likeCount: post.likeCount,
          retweetCount: post.retweetCount,
          replyCount: post.replyCount,
          quoteCount: post.quoteCount,
          bookmarkCount: post.bookmarkCount,
          impressionCount: post.impressionCount,
          url: postUrl(influencer.username, post.id),
          ingestedAt: now,
        },
      })

    if (unchanged) {
      postsUnchanged += 1
      continue
    }
    postsUpserted += 1
    if (existing[0] && existing[0].textHash !== hash) {
      await db.delete(mentions).where(eq(mentions.postId, post.id))
    }

    const aliases = { ...(preset?.aliases ?? {}), ...(influencer.aliases ?? {}) }
    const identified = collapseMatches(
      extractMatches(post.text, aliases).map((match) =>
        identifyFast(match, { chainBias: influencer.chainBias }),
      ),
    )
    for (const match of identified) {
      const inserted = await db
        .insert(mentions)
        .values({
          postId: post.id,
          influencerId: influencer.id,
          matchKey: match.matchKey,
          rawText: match.rawText,
          matchType: match.matchType,
          symbol: match.symbol,
          assetName: match.assetName,
          assetKey: assetKeyOf(match),
          coingeckoId: match.coingeckoId,
          binanceSymbol: match.binanceSymbol,
          contractAddress: match.contractAddress,
          pairAddress: match.pairAddress ?? null,
          dexscreenerUrl: match.dexscreenerUrl ?? null,
          geckoterminalNetwork: match.geckoterminalNetwork ?? null,
          chain:
            match.chain ??
            (match.matchType === "solana" ? "solana" : match.matchType === "evm" ? "ethereum" : null),
          confidence: match.confidence,
          confidenceReason: match.confidenceReason,
          resolutionStatus: match.resolutionStatus,
          priceStatus: "pending",
          isDemo: false,
          pinned: false,
          createdAt: post.createdAt,
        })
        .onConflictDoNothing()
        .returning({ id: mentions.id })
      if (inserted[0]) mentionIds.push(inserted[0].id)
    }
  }

  await db
    .update(influencers)
    .set({ latestPostId: latest, updatedAt: now })
    .where(eq(influencers.id, influencer.id))

  if (!options?.deferPricing) await recomputeInfluencers([influencer.id])

  return {
    user: {
      id: influencer.id,
      x_user_id: input.user.xUserId,
      username: influencer.username,
      name: influencer.name,
      created,
    },
    posts_upserted: postsUpserted,
    posts_unchanged: postsUnchanged,
    mentions_created: mentionIds.length,
    mention_ids: mentionIds,
  } satisfies IngestResult
}

export async function addInfluencer(input: {
  username: string
  name?: string | null
  xUserId?: string | null
}) {
  const username = normalizeUsername(input.username)
  if (!username) {
    return { error: "username must be 1-15 letters, numbers, or underscores" as const }
  }
  const db = getDb()
  const existing = await db.select().from(influencers).where(eq(influencers.username, username)).limit(1)
  if (existing[0]) {
    const updated = await db
      .update(influencers)
      .set({
        tracked: true,
        name: input.name?.trim() || existing[0].name,
        xUserId: input.xUserId?.trim() || existing[0].xUserId,
        updatedAt: new Date(),
      })
      .where(eq(influencers.id, existing[0].id))
      .returning()
    return { influencer: updated[0], created: false }
  }
  const inserted = await db
    .insert(influencers)
    .values({
      username,
      name: input.name?.trim() || username,
      xUserId: input.xUserId?.trim() || null,
      profileImageUrl: `/avatars/${username}`,
      tracked: true,
      isDemo: false,
    })
    .returning()
  await recomputeInfluencers([inserted[0].id])
  return { influencer: inserted[0], created: true }
}

export async function untrackInfluencer(username: string) {
  const normalized = normalizeUsername(username)
  if (!normalized) return { error: "invalid username" as const }
  const db = getDb()
  const updated = await db
    .update(influencers)
    .set({ tracked: false, updatedAt: new Date() })
    .where(and(eq(influencers.username, normalized), eq(influencers.tracked, true)))
    .returning({ id: influencers.id, username: influencers.username })
  if (!updated[0]) return { error: "tracked influencer not found" as const }
  return { influencer: updated[0] }
}
