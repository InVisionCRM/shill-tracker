import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PostText } from "@/components/post-text"
import { RelativeTime } from "@/components/animated-number"
import { UntrackButton } from "@/components/voice-actions"
import { VoiceAvatar } from "@/components/voice-avatar"
import { RoiHeatmap, TickerDonut } from "@/components/mix-charts"
import { TokenLogo } from "@/components/token-logo"
import { VoiceScores, type CallPeek, type ScorePack } from "@/components/voice-scores"
import { StatBento } from "@/components/stat-bento"
import { CallTimeline } from "@/components/call-timeline"
import type { StoredBook } from "@/components/portfolio-panel"
import { MentionTags, mentionMuted } from "@/components/mention-tags"
import { countsTowardScore } from "@/lib/detect/kinds"
import { chainLabel, formatCallDate, formatCompact, formatRoi, formatUsd } from "@/lib/format"
import { logosForSymbols } from "@/lib/pulsechain/lookup"
import { getInfluencer, toPosition } from "@/lib/queries"
import type { ScoreSnapshot } from "@/lib/types"

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const handle = username.replace(/^@/, "")
  const description = `Every call @${handle} has made on X: the price at the post, then 1h, 24h, 7d and 30d later, with win rate, dump risk and a $100-per-call book.`
  return { title: `@${handle}`, description, openGraph: { title: `@${handle} on Shill Tracker`, description } }
}

export default async function InfluencerPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="font-mono text-xs tracking-[0.18em] text-phosphor uppercase">Voice</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">@{username}</h1>
      </div>
      <Suspense fallback={<div className="min-h-[100svh]" aria-hidden />}>
        <Profile username={username} />
      </Suspense>
    </div>
  )
}

async function Profile({ username }: { username: string }) {
  await connection()
  const data = await getInfluencer(username)
  if (!data) notFound()
  const { influencer, stats, mentions, posts } = data
  const byPost = new Map<string, typeof mentions>()
  for (const mention of mentions) {
    const list = byPost.get(mention.postId) ?? []
    list.push(mention)
    byPost.set(mention.postId, list)
  }
  const firstIds = new Set(data.firstCalls.map((call) => call.id))
  const firstComplete = data.firstCalls.length <= 400
  const allComplete = data.mentionTotal <= 400
  const seen = new Set<string>()
  const allPositions = allComplete
    ? mentions
        .filter((mention) => {
          if (!countsTowardScore(mention)) return false
          if (seen.has(mention.id)) return false
          seen.add(mention.id)
          return true
        })
        .map((mention) => toPosition(mention, firstIds.has(mention.id)))
    : []
  const firstPositions = firstComplete
    ? data.firstCalls.map((call) =>
        toPosition(
          {
            ...call,
            assetName: call.assetName,
          },
          true,
        ),
      )
    : []
  const peek = (id: string | null | undefined): CallPeek | null => {
    if (!id) return null
    const row = mentions.find((mention) => mention.id === id) ?? data.firstCalls.find((call) => call.id === id)
    if (!row) return null
    return {
      id: row.id,
      symbol: row.symbol,
      createdAt: row.createdAt.toISOString(),
      priceAt: row.priceAt,
      roi7d: row.roi7d,
      roi24h: row.roi24h,
      roiNow: row.roiNow,
    }
  }
  const firstPack = packFrom(stats, peek(stats?.bestMentionId), peek(stats?.worstMentionId), firstPositions, firstComplete)
  const allScores = (stats?.allScores ?? null) as ScoreSnapshot | null
  const allPack = allScores
    ? packFrom(allScores, peek(allScores.bestMentionId), peek(allScores.worstMentionId), allPositions, allComplete, stats?.uniqueTickers ?? 0)
    : firstPack
  const shownFirst = data.firstCalls.slice(0, 40)
  const earliest = data.firstCalls[data.firstCalls.length - 1] ?? null
  const logos = await logosForSymbols(
    [...shownFirst.map((call) => call.symbol), earliest?.symbol].filter((symbol): symbol is string => Boolean(symbol)),
  )

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <VoiceAvatar src={influencer.profileImageUrl} username={influencer.username} className="size-16" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-2xl font-semibold tracking-tight">{influencer.name}</p>
              {influencer.isDemo ? <Badge variant="outline">Demo</Badge> : <Badge>Tracked</Badge>}
              {!influencer.tracked ? <Badge variant="secondary">Not tracked</Badge> : null}
              {(stats?.pumpDumpCount ?? 0) > 0 ? (
                <Badge variant="destructive">Pump then dump</Badge>
              ) : null}
            </div>
            <p className="font-mono text-sm text-muted-foreground">@{influencer.username}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatCompact(influencer.followersCount)} followers · {stats?.postCount ?? data.postTotal} posts ·{" "}
              {stats?.shillCount ?? data.mentionTotal} shills · {data.firstCalls.length} first calls
              {influencer.chainBias ? ` · ${chainLabel(influencer.chainBias)} bias` : ""}
            </p>
          </div>
        </div>
        {influencer.tracked ? <UntrackButton username={influencer.username} /> : null}
      </header>

      <StatBento
        followers={influencer.followersCount}
        shills={stats?.shillCount ?? data.mentionTotal}
        firstCalls={data.firstCalls.length}
        credibility={stats?.credibilityScore ?? null}
        dumpRisk={stats?.dumpRiskScore ?? null}
        pumpDumpCount={stats?.pumpDumpCount ?? 0}
        median7d={stats?.medianRoi7d ?? null}
        win7d={stats?.winRate7d ?? null}
        book7d={stats?.portfolio7d ?? null}
      />

      {earliest ? (
        <Link
          href={`/shills/${earliest.id}`}
          className="glass-card flex flex-col gap-2 rounded-2xl p-4 sm:flex-row sm:items-end sm:justify-between"
        >
          <span>
            <span className="font-mono text-xs tracking-[0.16em] text-phosphor uppercase">Earliest first call</span>
            <span className="mt-1 flex items-center gap-2 text-lg font-medium">
              <TokenLogo
                symbol={earliest.symbol}
                chain={earliest.chain}
                imageUrl={earliest.symbol ? logos.get(earliest.symbol.toUpperCase()) : null}
                className="size-7"
              />
              {earliest.symbol ? `$${earliest.symbol}` : "Unnamed"}
            </span>
            <span className="mt-1 block font-mono text-sm text-muted-foreground">{formatCallDate(earliest.createdAt)}</span>
          </span>
          <span className="font-mono text-3xl tabular-nums text-phosphor">{formatUsd(earliest.priceAt)}</span>
        </Link>
      ) : null}

      <VoiceScores
        shillCount={stats?.shillCount ?? data.mentionTotal}
        repeatAssets={stats?.repeatAssets ?? data.repeats.length}
        first={firstPack}
        all={allPack}
        repeats={data.repeats}
      />

      <CallTimeline calls={shownFirst} logos={logos} total={data.firstCalls.length} />

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Most shilled</CardTitle>
            <CardDescription>Every mention, including repeats. Chain is shown when the symbol exists on more than one.</CardDescription>
          </CardHeader>
          <CardContent>
            <TickerDonut slices={data.mix} />
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>7 day returns by week</CardTitle>
            <CardDescription>First calls only. Green weeks made money. Red weeks did not.</CardDescription>
          </CardHeader>
          <CardContent>
            <RoiHeatmap weeks={data.weeks} />
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Archive</h2>
        {data.postTotal > posts.length ? (
          <p className="text-xs text-muted-foreground">
            Showing {posts.length} of {data.postTotal} posts. The newest stay on this page.
          </p>
        ) : null}
        <ul className="flex flex-col gap-3">
          {posts.map((post) => (
            <li key={post.id} className="rounded-xl border bg-card/70 p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <RelativeTime iso={post.createdAt.toISOString()} />
                <span className="font-mono text-xs text-muted-foreground">
                  {formatCompact(post.likeCount)} likes · {formatCompact(post.impressionCount)} views
                </span>
                <a href={post.url} className="text-xs text-chart-4 hover:underline" target="_blank" rel="noreferrer">
                  On X
                </a>
              </div>
              <PostText text={post.text} />
              <div className="mt-3 flex flex-wrap gap-2">
                {(byPost.get(post.id) ?? []).map((mention) => (
                  <Link key={mention.id} href={`/shills/${mention.id}`} className={mentionMuted(mention.callKind, mention.priceStatus)}>
                    <Badge variant={mention.pumpDumpFlag ? "destructive" : "secondary"}>
                      {mention.symbol ? `$${mention.symbol}` : mention.rawText}{" "}
                      {mention.priceStatus === "unverifiable"
                        ? "unverifiable"
                        : formatRoi(mention.roi7d ?? mention.roi24h ?? mention.roiNow)}
                    </Badge>
                    <MentionTags
                      callKind={mention.callKind}
                      priceStatus={mention.priceStatus}
                      assetState={mention.assetState}
                      resolutionConfidence={mention.resolutionConfidence}
                    />
                  </Link>
                ))}
                {(byPost.get(post.id) ?? []).length === 0 ? (
                  <span className="text-xs text-muted-foreground">No ticker</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function packFrom(
  source: {
    credibilityScore: number | null
    credibilityHorizon: string | null
    sampleSize: number | null
    dumpRiskScore: number | null
    pumpDumpCount: number | null
    winRate24h: number | null
    winRate7d: number | null
    medianRoi7d: number | null
    uniqueTickers?: number | null
    portfolio1h: number | null
    portfolio24h: number | null
    portfolio7d: number | null
    portfolio30d: number | null
    portfolioNow: number | null
    portfolioN1h: number | null
    portfolioN24h: number | null
    portfolioN7d: number | null
    portfolioN30d: number | null
    portfolioNNow: number | null
  } | null,
  best: CallPeek | null,
  worst: CallPeek | null,
  positions: ScorePack["positions"],
  complete: boolean,
  uniqueTickers = source?.uniqueTickers ?? 0,
): ScorePack {
  return {
    credibilityScore: source?.credibilityScore ?? null,
    credibilityHorizon: source?.credibilityHorizon ?? null,
    sampleSize: source?.sampleSize ?? 0,
    dumpRiskScore: source?.dumpRiskScore ?? null,
    pumpDumpCount: source?.pumpDumpCount ?? 0,
    winRate24h: source?.winRate24h ?? null,
    winRate7d: source?.winRate7d ?? null,
    medianRoi7d: source?.medianRoi7d ?? null,
    uniqueTickers: uniqueTickers ?? 0,
    best,
    worst,
    positions,
    complete,
    book: bookFrom(source),
  }
}

function bookFrom(
  source: {
    portfolio1h: number | null
    portfolio24h: number | null
    portfolio7d: number | null
    portfolio30d: number | null
    portfolioNow: number | null
    portfolioN1h: number | null
    portfolioN24h: number | null
    portfolioN7d: number | null
    portfolioN30d: number | null
    portfolioNNow: number | null
  } | null,
): StoredBook {
  return {
    "1h": { portfolio: source?.portfolio1h ?? null, n: source?.portfolioN1h ?? 0 },
    "24h": { portfolio: source?.portfolio24h ?? null, n: source?.portfolioN24h ?? 0 },
    "7d": { portfolio: source?.portfolio7d ?? null, n: source?.portfolioN7d ?? 0 },
    "30d": { portfolio: source?.portfolio30d ?? null, n: source?.portfolioN30d ?? 0 },
    now: { portfolio: source?.portfolioNow ?? null, n: source?.portfolioNNow ?? 0 },
  }
}
