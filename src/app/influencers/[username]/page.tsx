import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { Badge } from "@/components/ui/badge"
import { PostText } from "@/components/post-text"
import { RelativeTime } from "@/components/animated-number"
import { UntrackLauncher } from "@/components/track-voice-button"
import { VoiceAvatar } from "@/components/voice-avatar"
import { CallTimeline } from "@/components/call-timeline"
import { callOutcome } from "@/components/outcome"
import { mentionMuted } from "@/components/mention-tags"
import { formatCompact, formatRoi, roiClass } from "@/lib/format"
import { logosForSymbols } from "@/lib/pulsechain/lookup"
import { getInfluencer } from "@/lib/queries"

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const handle = username.replace(/^@/, "")
  const description = `Every ticker @${handle} has called on X, once each at the first call, with the price at the post and the move since.`
  return { title: `@${handle}`, description, openGraph: { title: `@${handle} on Shill Tracker`, description } }
}

export default async function InfluencerPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>
  searchParams: Promise<{ archive?: string }>
}) {
  const { username } = await params
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="font-mono text-xs tracking-[0.18em] text-phosphor uppercase">Voice</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">@{username}</h1>
      </div>
      <Suspense fallback={<div className="min-h-[100svh]" aria-hidden />}>
        <Profile username={username} searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

/** Archive posts rendered up front. Each one is several KB of HTML plus its RSC copy; the rest load on request. */
const ARCHIVE_FIRST = 10

async function Profile({ username, searchParams }: { username: string; searchParams: Promise<{ archive?: string }> }) {
  await connection()
  const showAll = (await searchParams).archive === "all"
  const data = await getInfluencer(username)
  if (!data) notFound()
  const { influencer, stats, mentions, posts } = data
  const byPost = new Map<string, typeof mentions>()
  for (const mention of mentions) {
    const list = byPost.get(mention.postId) ?? []
    list.push(mention)
    byPost.set(mention.postId, list)
  }
  const shownFirst = showAll ? data.firstCalls : data.firstCalls.slice(0, 20)
  const shownPosts = showAll ? posts : posts.slice(0, ARCHIVE_FIRST)
  const logos = await logosForSymbols(
    shownFirst.map((call) => call.symbol).filter((symbol): symbol is string => Boolean(symbol)),
  )
  const hidden = data.firstCalls.length - shownFirst.length + (posts.length - shownPosts.length)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <VoiceAvatar src={influencer.profileImageUrl} username={influencer.username} className="size-16" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-2xl font-semibold tracking-tight">{influencer.name}</p>
              {influencer.isDemo ? <Badge variant="outline">Demo</Badge> : null}
              {!influencer.tracked ? <Badge variant="secondary">Not tracked</Badge> : null}
              {(stats?.pumpDumpCount ?? 0) > 0 ? <Badge variant="destructive">Pump then dump</Badge> : null}
            </div>
            <p className="font-mono text-sm text-muted-foreground">@{influencer.username}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatCompact(influencer.followersCount)} followers · {data.firstCalls.length} first calls
            </p>
          </div>
        </div>
        {influencer.tracked ? <UntrackLauncher username={influencer.username} /> : null}
      </header>

      <CallTimeline calls={shownFirst} logos={logos} total={data.firstCalls.length} />

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Archive</h2>
        {data.postTotal > shownPosts.length ? (
          <p className="text-xs text-muted-foreground">Showing {shownPosts.length} of {data.postTotal} posts.</p>
        ) : null}
        <ul className="flex flex-col gap-3">
          {shownPosts.map((post) => (
            <li key={post.id} className="rounded-xl border bg-card/70 p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <RelativeTime iso={post.createdAt.toISOString()} />
                <a href={post.url} className="text-xs text-chart-4 hover:underline" target="_blank" rel="noreferrer">
                  On X
                </a>
              </div>
              <PostText text={post.text} />
              <div className="mt-3 flex flex-wrap gap-2">
                {(byPost.get(post.id) ?? []).map((mention) => {
                  const outcome = callOutcome(mention)
                  return (
                    <Link key={mention.id} href={`/shills/${mention.id}`} className={mentionMuted(mention.callKind, mention.priceStatus)}>
                      <span className={`chip ${mention.pumpDumpFlag ? "chip-bad" : ""}`}>
                        {mention.symbol ? `$${mention.symbol}` : mention.rawText}{" "}
                        <span className={`font-bold ${roiClass(outcome.value)}`}>
                          {mention.priceStatus === "unverifiable" ? "unverifiable" : formatRoi(outcome.value)}
                        </span>
                      </span>
                    </Link>
                  )
                })}
              </div>
            </li>
          ))}
        </ul>
        {!showAll && hidden > 0 ? (
          <Link href={`/influencers/${influencer.username}?archive=all`} className="text-sm text-phosphor hover:underline" scroll={false}>
            Show everything
          </Link>
        ) : null}
      </section>
    </div>
  )
}
