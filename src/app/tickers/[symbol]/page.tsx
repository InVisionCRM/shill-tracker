import { Suspense } from "react"
import Link from "next/link"
import { connection } from "next/server"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { RelativeTime } from "@/components/animated-number"
import { MarkRoi } from "@/components/mark"
import { TokenLogo } from "@/components/token-logo"
import { chainLabel, formatRoi, formatUsd, roiClass, shortAddress } from "@/lib/format"
import { getTicker } from "@/lib/queries"

export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params
  return { title: `$${decodeURIComponent(symbol)}` }
}

export default function TickerPage({ params }: { params: Promise<{ symbol: string }> }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Looking up the ticker…</p>}>
      <Ticker params={params} />
    </Suspense>
  )
}

async function Ticker({ params }: { params: Promise<{ symbol: string }> }) {
  await connection()
  const { symbol } = await params
  const { query, rows, total, avg7d } = await getTicker(symbol)
  const first = rows[0]?.mentions
  const avg = avg7d
  const chains = [
    ...new Set(rows.map((row) => row.mentions.chain).filter((chain): chain is string => Boolean(chain))),
  ]
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="font-mono text-xs tracking-[0.18em] text-phosphor uppercase">Ticker</p>
        <div className="mt-2 flex items-center gap-3">
          <TokenLogo symbol={first?.symbol ?? query} chain={first?.chain} className="size-12" />
          <h1 className="text-3xl font-semibold tracking-tight">
            {first?.symbol ? `$${first.symbol}` : query}
          </h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {first?.assetName ?? "No resolved name yet"} · {total} calls
          {chains.length ? ` · ${chains.map((chain) => chainLabel(chain)).join(", ")}` : ""}
          {first?.contractAddress ? ` · ${shortAddress(first.contractAddress)}` : ""}
        </p>
        {total > rows.length ? (
          <p className="mt-1 text-xs text-muted-foreground">Showing the newest {rows.length}.</p>
        ) : null}
      </header>
      {rows.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No calls for {query}</EmptyTitle>
            <EmptyDescription>When a tracked post names it, the call lands here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardDescription>Voices</CardDescription>
                <CardTitle className="font-mono text-2xl">
                  {new Set(rows.map((row) => row.influencers.username)).size}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Average 7d</CardDescription>
                <CardTitle className={`font-mono text-2xl ${roiClass(avg)}`}>{formatRoi(avg)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Latest entry</CardDescription>
                <CardTitle className="font-mono text-2xl">{formatUsd(first?.priceAt ?? null)}</CardTitle>
              </CardHeader>
            </Card>
          </section>
          <Card>
            <CardHeader>
              <CardTitle>Who said it</CardTitle>
              <CardDescription>Same asset, every voice, newest first.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {rows.map((row) => (
                <Link
                  key={row.mentions.id}
                  href={`/shills/${row.mentions.id}`}
                  className="flex flex-col gap-2 rounded-lg border px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span>
                    <span className="block font-medium">{row.influencers.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      @{row.influencers.username} · <RelativeTime iso={row.mentions.createdAt.toISOString()} />
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-sm">
                    {row.mentions.pumpDumpFlag ? <Badge variant="destructive">Dump</Badge> : null}
                    {row.mentions.confidence === "low" ? <Badge variant="outline">Low confidence</Badge> : null}
                    <span className={roiClass(row.mentions.roi7d)}>7d {formatRoi(row.mentions.roi7d)}</span>
                    <MarkRoi
                      assetKey={row.mentions.assetKey}
                      priceAt={row.mentions.priceAt}
                      fallbackRoi={row.mentions.roiNow}
                      fallbackPrice={row.mentions.priceNow}
                      pinned={row.mentions.pinned}
                      source={row.mentions.priceSource}
                    />
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
