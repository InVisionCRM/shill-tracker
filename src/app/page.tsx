import { Suspense } from "react"
import Link from "next/link"
import { connection } from "next/server"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FeedBoard } from "@/components/feed-board"
import { formatCompact, formatRoi, roiClass } from "@/lib/format"
import { getFeed, getLeaderboard, getOverview } from "@/lib/queries"
import { toFeed, toLeader } from "@/lib/serialize"

export const metadata = { title: "Tape" }

export default function HomePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the tape…</p>}>
      <Home />
    </Suspense>
  )
}

async function Home() {
  await connection()
  const [overview, feed, board] = await Promise.all([getOverview(), getFeed(8), getLeaderboard()])
  const leaders = board.map(toLeader)
  const ranked = [...leaders].sort((a, b) => (b.dumpRiskScore ?? -1) - (a.dumpRiskScore ?? -1))
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <p className="font-mono text-xs tracking-[0.18em] text-phosphor uppercase">Call archive</p>
        <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Every post from the voices you track. Every ticker they touch. The price after they said it.
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Demo voices are fictional and badged. Their charts are labeled SEED until you point the price cron at a
          real post. The tape above polls live marks from public exchanges.
        </p>
        {overview.demoVoices > 0 ? (
          <Badge variant="outline" className="w-fit">
            {overview.demoVoices} demo voices in the book
          </Badge>
        ) : null}
      </section>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Voices" value={formatCompact(overview.voices)} />
        <Stat label="Posts archived" value={formatCompact(overview.posts)} />
        <Stat label="Shills" value={formatCompact(overview.shills)} detail={`${overview.priced} priced`} />
        <Stat
          label="Median 7d"
          value={formatRoi(overview.median7d)}
          className={roiClass(overview.median7d)}
          detail={`${overview.flagged} dump flags`}
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
