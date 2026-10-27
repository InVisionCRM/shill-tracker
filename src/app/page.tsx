import { cache, Suspense } from "react"
import Link from "next/link"
import { connection } from "next/server"
import { HeroEffects, HeroMeters } from "@/components/hero-stage"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FeedBoard } from "@/components/feed-board"
import { formatCompact, formatRoi, roiClass } from "@/lib/format"
import { getFeed, getLeaderboard, getOverview, getTapeLogos } from "@/lib/queries"
import { toFeed, toLeader } from "@/lib/serialize"

const loadHome = cache(async () => {
  await connection()
  const [overview, feed, board, tape] = await Promise.all([
    getOverview(),
    getFeed(8),
    getLeaderboard(),
    getTapeLogos(),
  ])
  return { overview, feed, board, tape }
})

export const metadata = { title: "Tape" }

export default function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <section className="relative overflow-hidden rounded-3xl border bg-card/50 px-4 py-6 sm:px-8 sm:py-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--phosphor)_16%,transparent),transparent_58%)]"
        />
        <HeroEffects />
        <div className="relative z-10 flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <p className="font-mono text-xs tracking-[0.18em] text-phosphor uppercase">Call archive</p>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Every post from the voices you track. Every ticker they touch. The price after they said it.
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Live marks poll from public exchanges. Historical candles fill from the price queue, one day-cache at a time.
            </p>
          </div>
          <Suspense
            fallback={
              <div className="grid grid-cols-2 gap-3" aria-hidden>
                <div className="min-h-[4.75rem] rounded-2xl border bg-background/40" />
                <div className="min-h-[4.75rem] rounded-2xl border bg-background/40" />
              </div>
            }
          >
            <HeroStats />
          </Suspense>
        </div>
      </section>
      <Suspense fallback={<div className="min-h-[100svh]" aria-hidden />}>
        <HomeLists />
      </Suspense>
    </div>
  )
}

async function HeroStats() {
  const { overview, tape } = await loadHome()
  return (
    <div className="flex flex-col gap-4">
      {overview.voices === 0 && overview.shills === 0 ? (
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          No voices yet. Add a handle, then POST posts to /api/ingest/posts. Prices fill from the queue after that.
        </p>
      ) : null}
      {overview.demoVoices > 0 ? (
        <Badge variant="outline" className="w-fit">
          {overview.demoVoices} demo voices in the book
        </Badge>
      ) : null}
      {overview.progress.phase === "first" ? (
        <p className="font-mono text-xs text-muted-foreground">
          Pricing first calls {overview.firstPriced.toLocaleString("en-US")} / {overview.firstTotal.toLocaleString("en-US")}
        </p>
      ) : overview.progress.phase === "repeat" ? (
        <p className="font-mono text-xs text-muted-foreground">
          Pricing repeats {overview.progress.priced.toLocaleString("en-US")} / {overview.progress.total.toLocaleString("en-US")}
        </p>
      ) : null}
      <HeroMeters voices={overview.voices} shills={overview.shills} logos={tape.logos} logoSource={tape.source} />
    </div>
  )
}

async function HomeLists() {
  const { overview, feed, board } = await loadHome()
  const leaders = board.map(toLeader)
  const ranked = [...leaders].sort((a, b) => (b.dumpRiskScore ?? -1) - (a.dumpRiskScore ?? -1))
  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-2 gap-3">
        <Stat label="Posts archived" value={formatCompact(overview.posts)} />
        <Stat
          label="Median 7d"
          value={formatRoi(overview.median7d)}
          className={roiClass(overview.median7d)}
          detail={`${overview.flagged} first-call dump flags · ${overview.firstTotal.toLocaleString("en-US")} first calls`}
        />
      </section>
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Latest calls</CardTitle>
            <CardDescription>New shills land here as soon as the ingest bot posts them.</CardDescription>
          </CardHeader>
          <CardContent>
            <FeedBoard initial={feed.map(toFeed)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Dump risk</CardTitle>
            <CardDescription>Who tends to show up after the chart already ran.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {ranked.slice(0, 6).map((row) => (
              <Link
                key={row.id}
                href={`/influencers/${row.username}`}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
              >
                <span>
                  <span className="block text-sm font-medium">{row.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">@{row.username}</span>
                </span>
                <span className="text-right">
                  <span className="block font-mono text-sm text-loss">
                    {row.dumpRiskScore == null ? "—" : Math.round(row.dumpRiskScore)}
                  </span>
                  <span className="text-[10px] tracking-wide text-muted-foreground uppercase">risk</span>
                </span>
              </Link>
            ))}
            <Link href="/leaderboard" className="text-sm text-phosphor hover:underline">
              Full leaderboard
            </Link>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function Stat({
  label,
  value,
  detail,
  className,
}: {
  label: string
  value: string
  detail?: string
  className?: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={`font-mono text-2xl tabular-nums ${className ?? ""}`}>{value}</CardTitle>
      </CardHeader>
      {detail ? (
        <CardContent>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </CardContent>
      ) : null}
    </Card>
  )
}
