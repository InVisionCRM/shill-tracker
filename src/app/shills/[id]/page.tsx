import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PriceChart } from "@/components/price-chart"
import { PostText } from "@/components/post-text"
import { RelativeTime } from "@/components/animated-number"
import { MarkPrice, MarkRoi } from "@/components/mark"
import { VoiceAvatar } from "@/components/voice-avatar"
import { OutcomeFlare } from "@/components/outcome-flare"
import { TokenLogo } from "@/components/token-logo"
import { MentionTags, mentionMuted } from "@/components/mention-tags"
import { chainLabel, formatRoi, formatUsd, roiClass, shortAddress } from "@/lib/format"
import { logosForAddresses, logosForSymbols } from "@/lib/pulsechain/lookup"
import { getMention } from "@/lib/queries"

export const metadata = { title: "Call", description: "One call: the post, the price when it was made, and what the token did next." }

export default function ShillPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the call…</p>}>
      <Shill params={params} />
    </Suspense>
  )
}

async function Shill({ params }: { params: Promise<{ id: string }> }) {
  await connection()
  const { id } = await params
  const data = await getMention(id)
  if (!data) notFound()
  const { mentions: mention, posts: post, influencers: voice, series } = data
  const byAddress = mention.contractAddress ? await logosForAddresses([mention.contractAddress]) : new Map<string, string>()
  const bySymbol = mention.symbol ? await logosForSymbols([mention.symbol]) : new Map<string, string>()
  const imageUrl =
    (mention.contractAddress ? byAddress.get(mention.contractAddress.toLowerCase()) : null) ??
    (mention.symbol ? bySymbol.get(mention.symbol.toUpperCase()) : null) ??
    null
  const horizons = [
    ["1h", mention.roi1h, mention.price1h],
    ["24h", mention.roi24h, mention.price24h],
    ["7d", mention.roi7d, mention.price7d],
    ["30d", mention.roi30d, mention.price30d],
  ] as const

  return (
    <div className={`relative flex flex-col gap-6 ${mentionMuted(mention.callKind, mention.priceStatus)}`}>
      <OutcomeFlare roi={mention.roi7d ?? mention.roiNow} />
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <TokenLogo symbol={mention.symbol} chain={mention.chain} imageUrl={imageUrl} className="size-12" />
          <VoiceAvatar src={voice.profileImageUrl} username={voice.username} />
          <div>
            <p className="font-mono text-xs tracking-[0.18em] text-phosphor uppercase">Call</p>
            <h1 className="text-3xl font-semibold tracking-tight">
              {mention.symbol ? `$${mention.symbol}` : mention.rawText}
            </h1>
            {mention.chain ? (
              <p className="text-xs text-muted-foreground">{chainLabel(mention.chain)}</p>
            ) : null}
            <p className="text-sm text-muted-foreground">
              <Link href={`/influencers/${voice.username}`} className="hover:underline">
                {voice.name}
              </Link>{" "}
              · <RelativeTime iso={mention.createdAt.toISOString()} />
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {voice.isDemo ? <Badge variant="outline">Demo</Badge> : <Badge>Live</Badge>}
          <Badge variant="outline">{mention.confidence} confidence</Badge>
          <Badge variant="secondary">
            {mention.priceStatus === "unverifiable" ? "Unverifiable" : (mention.priceSource ?? mention.priceStatus)}
          </Badge>
          <MentionTags
            callKind={mention.callKind}
            priceStatus={mention.priceStatus}
            assetState={mention.assetState}
            resolutionConfidence={mention.resolutionConfidence}
          />
          {mention.pumpDumpFlag ? <Badge variant="destructive" className="dump-glow">Pump-then-dump</Badge> : null}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Price path</CardTitle>
            <CardDescription>
              Hourly closes from 7 days before the post through 30 days after, or now if that window is still open.
              The entry is the last close at or before the post, ignored if the nearest candle is more than 36 hours away.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PriceChart
              series={series.map((point) => ({ t: point.t, p: point.p }))}
              postedAt={mention.createdAt.toISOString()}
              entry={mention.priceAt}
              postText={post.text}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>The post</CardTitle>
            <CardDescription>
              <a href={post.url} className="text-chart-4 hover:underline" target="_blank" rel="noreferrer">
                Open on X
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <PostText text={post.text} />
            <p className="text-xs text-muted-foreground">{mention.confidenceReason}</p>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Entry</dt>
                <dd className="font-mono">{formatUsd(mention.priceAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Mark</dt>
                <dd>
                  <MarkPrice assetKey={mention.assetKey} fallback={mention.priceNow} pinned={mention.pinned} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Max gain</dt>
                <dd className={`font-mono ${roiClass(mention.maxGain)}`}>{formatRoi(mention.maxGain)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Max drawdown</dt>
                <dd className={`font-mono ${roiClass(mention.maxDrawdown)}`}>{formatRoi(mention.maxDrawdown)}</dd>
              </div>
            </dl>
            {mention.contractAddress ? (
              <p className="font-mono text-xs text-muted-foreground">
                {mention.chain} {shortAddress(mention.contractAddress)}
                {mention.dexscreenerUrl ? (
                  <>
                    {" "}
                    ·{" "}
                    <a href={mention.dexscreenerUrl} className="text-chart-4 hover:underline">
                      DexScreener
                    </a>
                  </>
                ) : null}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {horizons.map(([label, roi, price]) => (
          <Card key={label}>
            <CardHeader>
              <CardDescription>{label}</CardDescription>
              <CardTitle className={`font-mono text-2xl tabular-nums ${roiClass(roi)}`}>
                {formatRoi(roi)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-xs text-muted-foreground">{formatUsd(price)}</p>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader>
            <CardDescription>Mark</CardDescription>
            <CardTitle className="font-mono text-2xl">
              <MarkRoi
                assetKey={mention.assetKey}
                priceAt={mention.priceAt}
                fallbackRoi={mention.roiNow}
                fallbackPrice={mention.priceNow}
                pinned={mention.pinned}
                source={mention.priceSource}
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {mention.pinned ? "Pinned demo path" : "Updates with the live quote"}
            </p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Pump-then-dump</CardTitle>
          <CardDescription>
            Score {mention.pumpDumpScore == null ? "unavailable" : Math.round(mention.pumpDumpScore)} / 100. Run-up
            before the post is compared with the return after it, plus a volume check.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Bar label="24h before" value={mention.runup24h} />
          <Bar label="7d before" value={mention.runup7d} />
          <Bar label="24h after" value={mention.roi24h} />
          <Bar label="7d after" value={mention.roi7d} />
          <div className="md:col-span-2">
            <ul className="flex flex-col gap-2 text-sm leading-6">
              {(mention.pumpDumpReasons ?? []).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Volume 24h before {formatUsd(mention.volumeBefore24h)} · after {formatUsd(mention.volumeAfter24h)}.
              The full formula is on the method page.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Bar({ label, value }: { label: string; value: number | null }) {
  const width = value == null ? 0 : Math.min(100, Math.abs(value) * 100)
  const positive = (value ?? 0) >= 0
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-mono ${roiClass(value)}`}>{formatRoi(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${positive ? "bg-gain" : "bg-loss"}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  )
}
