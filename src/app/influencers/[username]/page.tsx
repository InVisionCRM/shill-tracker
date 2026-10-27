import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Gauge } from "@/components/gauge"
import { PortfolioPanel } from "@/components/portfolio-panel"
import { PostText } from "@/components/post-text"
import { RelativeTime } from "@/components/animated-number"
import { UntrackButton } from "@/components/voice-actions"
import { VoiceAvatar } from "@/components/voice-avatar"
import { formatCompact, formatRoi, roiClass } from "@/lib/format"
import { getInfluencer } from "@/lib/queries"
import type { PositionDTO } from "@/lib/types"

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  return { title: `@${username}` }
}

export default function InfluencerPage({ params }: { params: Promise<{ username: string }> }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Opening the book…</p>}>
      <Profile params={params} />
    </Suspense>
  )
}

async function Profile({ params }: { params: Promise<{ username: string }> }) {
  await connection()
  const { username } = await params
  const data = await getInfluencer(username)
  if (!data) notFound()
  const { influencer, stats, mentions, posts } = data
  const byPost = new Map<string, typeof mentions>()
  for (const mention of mentions) {
    const list = byPost.get(mention.postId) ?? []
    list.push(mention)
    byPost.set(mention.postId, list)
  }
  const positions: PositionDTO[] = mentions.map((mention) => ({
    id: mention.id,
    symbol: mention.symbol,
    assetName: mention.assetName,
    assetKey: mention.assetKey,
    createdAt: mention.createdAt.toISOString(),
    priceAt: mention.priceAt,
    pinned: mention.pinned,
    priceSource: mention.priceSource,
    pumpDumpFlag: mention.pumpDumpFlag,
    roi1h: mention.roi1h,
    roi24h: mention.roi24h,
    roi7d: mention.roi7d,
    roi30d: mention.roi30d,
    roiNow: mention.roiNow,
  }))
  const repeats = repeatGroups(mentions)
  const best = mentions.find((mention) => mention.id === stats?.bestMentionId)
  const worst = mentions.find((mention) => mention.id === stats?.worstMentionId)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <VoiceAvatar src={influencer.profileImageUrl} username={influencer.username} className="size-16" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight">{influencer.name}</h1>
              {influencer.isDemo ? <Badge variant="outline">Demo</Badge> : <Badge>Tracked</Badge>}
              {!influencer.tracked ? <Badge variant="secondary">Not tracked</Badge> : null}
            </div>
            <p className="font-mono text-sm text-muted-foreground">@{influencer.username}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatCompact(influencer.followersCount)} followers · {stats?.postCount ?? posts.length} posts ·{" "}
              {stats?.shillCount ?? mentions.length} shills
            </p>
          </div>
        </div>
        {influencer.tracked ? <UntrackButton username={influencer.username} /> : null}
      </header>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <Gauge
              label="Credibility"
              value={stats?.credibilityScore ?? null}
              tone={(stats?.credibilityScore ?? 0) >= 60 ? "gain" : (stats?.credibilityScore ?? 0) >= 40 ? "warn" : "loss"}
              caption={
                stats?.credibilityHorizon
                  ? `Scored on the ${stats.credibilityHorizon} print across ${stats.sampleSize} calls.`
                  : "Needs priced calls before this score means anything."
              }
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Gauge
              label="Dump risk"
              value={stats?.dumpRiskScore ?? null}
              tone={(stats?.dumpRiskScore ?? 0) >= 60 ? "loss" : (stats?.dumpRiskScore ?? 0) >= 40 ? "warn" : "gain"}
              caption={`${stats?.pumpDumpCount ?? 0} calls flagged as pump-then-dump. ${stats?.repeatAssets ?? 0} tickers were shilled more than once.`}
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Mini label="Win rate 24h" value={formatRoi(stats?.winRate24h ?? null, 0)} />
        <Mini label="Win rate 7d" value={formatRoi(stats?.winRate7d ?? null, 0)} />
        <Mini label="Median 7d" value={formatRoi(stats?.medianRoi7d ?? null)} className={roiClass(stats?.medianRoi7d)} />
        <Mini label="Unique tickers" value={String(stats?.uniqueTickers ?? 0)} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>If you bought every call</CardTitle>
            <CardDescription>Fixed $100 stake at the post-time candle. Pick a hold.</CardDescription>
          </CardHeader>
          <CardContent>
            <PortfolioPanel positions={positions} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Best and worst</CardTitle>
            <CardDescription>Ranked by the longest settled return we have, preferring 7 days.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <CallLink label="Best" mention={best} />
            <CallLink label="Worst" mention={worst} />
            <div>
              <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">Repeat shills</p>
              {repeats.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No ticker has been named twice.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {repeats.map((group) => (
                    <li key={group.key} className="flex items-center justify-between text-sm">
                      <Link href={`/tickers/${group.symbol}`} className="font-mono text-phosphor hover:underline">
                        ${group.symbol} · {group.count} times
                      </Link>
                      <span className={roiClass(group.avg)}>{formatRoi(group.avg)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Archive</h2>
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
                  <Link key={mention.id} href={`/shills/${mention.id}`}>
                    <Badge variant={mention.pumpDumpFlag ? "destructive" : "secondary"}>
                      {mention.symbol ? `$${mention.symbol}` : mention.rawText} {formatRoi(mention.roi7d ?? mention.roi24h ?? mention.roiNow)}
                    </Badge>
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

function Mini({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={`font-mono text-2xl tabular-nums ${className ?? ""}`}>{value}</CardTitle>
      </CardHeader>
    </Card>
  )
}

function CallLink({
  label,
  mention,
}: {
  label: string
  mention?: { id: string; symbol: string | null; roi7d: number | null; roi24h: number | null; roiNow: number | null } | null
}) {
  if (!mention) return <p className="text-sm text-muted-foreground">{label} call is not priced yet.</p>
  const roi = mention.roi7d ?? mention.roi24h ?? mention.roiNow
  return (
    <Link href={`/shills/${mention.id}`} className="flex items-center justify-between rounded-lg border px-3 py-2">
      <span>
        <span className="block text-[10px] tracking-wide text-muted-foreground uppercase">{label}</span>
        <span className="font-mono">${mention.symbol ?? "—"}</span>
      </span>
      <span className={`font-mono ${roiClass(roi)}`}>{formatRoi(roi)}</span>
    </Link>
  )
}

function repeatGroups(
  mentions: { assetKey: string | null; symbol: string | null; roi7d: number | null; roi24h: number | null }[],
) {
  const groups = new Map<string, { symbol: string; rois: number[] }>()
  for (const mention of mentions) {
    if (!mention.symbol) continue
    const key = mention.assetKey ?? mention.symbol
    const group = groups.get(key) ?? { symbol: mention.symbol, rois: [] }
    const roi = mention.roi7d ?? mention.roi24h
    if (roi != null) group.rois.push(roi)
    groups.set(key, group)
  }
  return [...groups.entries()]
    .filter(([, group]) => group.rois.length > 1 || [...mentions].filter((item) => (item.assetKey ?? item.symbol) === group.symbol || item.symbol === group.symbol).length > 1)
    .map(([key, group]) => {
      const count = mentions.filter((item) => (item.assetKey ?? item.symbol) === key).length
      const avg = group.rois.length ? group.rois.reduce((sum, value) => sum + value, 0) / group.rois.length : null
      return { key, symbol: group.symbol, count, avg }
    })
    .filter((group) => group.count > 1)
}
