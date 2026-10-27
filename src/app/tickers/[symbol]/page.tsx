import { Suspense } from "react"
import Link from "next/link"
import { connection } from "next/server"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { TokenLogo } from "@/components/token-logo"
import { TickerBoard } from "@/components/ticker-board"
import { chainLabel, formatCallDate, formatUsd, shortAddress } from "@/lib/format"
import { logosForAddresses, logosForSymbols } from "@/lib/pulsechain/lookup"
import { getTicker } from "@/lib/queries"

export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params
  const ticker = decodeURIComponent(symbol).toUpperCase().slice(0, 32)
  const description = `Every tracked call on $${ticker}: who shilled it, the price at each post, and how it moved after 1h, 24h, 7d and 30d.`
  return { title: `$${ticker}`, description, openGraph: { title: `$${ticker} on Shill Tracker`, description } }
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
  const { query, rows, total, avg7d, avgFirst7d, firstCalls } = await getTicker(symbol)
  const earliest = firstCalls[0] ?? null
  const logoSymbol = earliest?.symbol ?? rows[0]?.mentions.symbol ?? query
  const logoChain = earliest?.chain ?? rows[0]?.mentions.chain
  const logoContract = earliest?.contractAddress ?? rows[0]?.mentions.contractAddress
  const byAddress = logoContract ? await logosForAddresses([logoContract]) : new Map<string, string>()
  const bySymbol = logoSymbol ? await logosForSymbols([logoSymbol]) : new Map<string, string>()
  const imageUrl =
    (logoContract ? byAddress.get(logoContract.toLowerCase()) : null) ??
    (logoSymbol ? bySymbol.get(logoSymbol.toUpperCase()) : null) ??
    null
  const chains = [
    ...new Set(
      [...firstCalls.map((call) => call.chain), ...rows.map((row) => row.mentions.chain)].filter(
        (chain): chain is string => Boolean(chain),
      ),
    ),
  ]
  const firstByUser = new Map(firstCalls.map((call) => [call.username, call]))
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="font-mono text-xs tracking-[0.18em] text-phosphor uppercase">Ticker</p>
        <div className="mt-2 flex items-center gap-3">
          <TokenLogo symbol={logoSymbol} chain={logoChain} imageUrl={imageUrl} className="size-12" />
          <h1 className="text-3xl font-semibold tracking-tight">
            {logoSymbol ? `$${logoSymbol}` : query}
          </h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {(earliest?.assetName ?? rows[0]?.mentions.assetName) ?? "No resolved name yet"} · {total} mentions ·{" "}
          {firstCalls.length} first calls
          {chains.length ? ` · ${chains.map((chain) => chainLabel(chain)).join(", ")}` : ""}
          {(earliest?.contractAddress ?? rows[0]?.mentions.contractAddress)
            ? ` · ${shortAddress(earliest?.contractAddress ?? rows[0]?.mentions.contractAddress)}`
            : ""}
        </p>
      </header>
      {rows.length === 0 && firstCalls.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No calls for {query}</EmptyTitle>
            <EmptyDescription>When a tracked post names it, the call lands here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {earliest ? (
            <Link
              href={`/shills/${earliest.id}`}
              className="glass-card flex flex-col gap-2 rounded-2xl p-4 sm:flex-row sm:items-end sm:justify-between"
            >
              <span>
                <span className="font-mono text-xs tracking-[0.16em] text-phosphor uppercase">First call</span>
                <span className="mt-1 block text-lg font-medium">
                  {earliest.name} <span className="font-mono text-sm text-muted-foreground">@{earliest.username}</span>
                </span>
                <span className="mt-1 block font-mono text-sm text-muted-foreground">{formatCallDate(earliest.createdAt)}</span>
              </span>
              <span className="font-mono text-3xl tabular-nums text-phosphor">{formatUsd(earliest.priceAt)}</span>
            </Link>
          ) : null}
          <TickerBoard
            avgFirst7d={avgFirst7d}
            avgAll7d={avg7d}
            total={total}
            firstCalls={firstCalls.map((call) => ({
              id: call.id,
              username: call.username,
              name: call.name,
              createdAt: call.createdAt.toISOString(),
              priceAt: call.priceAt,
              roi7d: call.roi7d,
              roiNow: call.roiNow,
              priceNow: call.priceNow,
              assetKey: call.assetKey,
              pinned: call.pinned,
              priceSource: call.priceSource,
              pumpDumpFlag: call.pumpDumpFlag,
              confidence: call.confidence,
              callKind: call.callKind,
              priceStatus: call.priceStatus,
              assetState: call.assetState,
              resolutionConfidence: call.resolutionConfidence,
              symbol: call.symbol,
              mentionCount: call.mentionCount,
            }))}
            mentions={rows.map((row) => {
              const first = firstByUser.get(row.influencers.username)
              return {
                id: row.mentions.id,
                username: row.influencers.username,
                name: row.influencers.name,
                createdAt: row.mentions.createdAt.toISOString(),
                priceAt: row.mentions.priceAt,
                roi7d: row.mentions.roi7d,
                roiNow: row.mentions.roiNow,
                priceNow: row.mentions.priceNow,
                assetKey: row.mentions.assetKey,
                pinned: row.mentions.pinned,
                priceSource: row.mentions.priceSource,
                pumpDumpFlag: row.mentions.pumpDumpFlag,
                confidence: row.mentions.confidence,
                callKind: row.mentions.callKind,
                priceStatus: row.mentions.priceStatus,
                assetState: row.mentions.assetState,
                resolutionConfidence: row.mentions.resolutionConfidence,
                symbol: row.mentions.symbol,
                mentionCount: first?.mentionCount ?? 1,
                isFirstCall: first?.id === row.mentions.id,
                firstCallAt: (first?.createdAt ?? row.mentions.createdAt).toISOString(),
                firstCallPrice: first?.priceAt ?? row.mentions.priceAt,
              }
            })}
          />
          {total > rows.length ? (
            <p className="text-xs text-muted-foreground">All mentions shows the newest {rows.length}.</p>
          ) : null}
        </>
      )}
    </div>
  )
}
