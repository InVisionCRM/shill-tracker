"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Gauge } from "@/components/gauge"
import { PortfolioPanel, type StoredBook } from "@/components/portfolio-panel"
import { ScopeToggle } from "@/components/scope-toggle"
import { formatCallDate, formatRoi, formatUsd, roiClass } from "@/lib/format"
import type { PositionDTO } from "@/lib/types"

export type CallPeek = {
  id: string
  symbol: string | null
  createdAt: string
  priceAt: number | null
  roi7d: number | null
  roi24h: number | null
  roiNow: number | null
}

export type ScorePack = {
  credibilityScore: number | null
  credibilityHorizon: string | null
  sampleSize: number
  dumpRiskScore: number | null
  pumpDumpCount: number
  winRate24h: number | null
  winRate7d: number | null
  medianRoi7d: number | null
  uniqueTickers: number
  best: CallPeek | null
  worst: CallPeek | null
  positions: PositionDTO[]
  complete: boolean
  book: StoredBook
}

export function VoiceScores({
  shillCount,
  repeatAssets,
  first,
  all,
  repeats,
}: {
  shillCount: number
  repeatAssets: number
  first: ScorePack
  all: ScorePack
  repeats: { key: string; symbol: string; count: number; avg: number | null }[]
}) {
  const [mode, setMode] = useState<"first" | "all">("first")
  const pack = mode === "first" ? first : all
  const noun = mode === "first" ? "first call" : "mention"
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <ScopeToggle value={mode} onChange={setMode} />
        <p className="text-xs leading-5 text-muted-foreground sm:max-w-md sm:text-right">
          {mode === "first"
            ? "ROI, win rate, the $100 book, and dump flags use the first mention of each ticker."
            : "Those scores include every mention. Shill count stays the total."}{" "}
          {shillCount.toLocaleString()} shills · {repeatAssets.toLocaleString()} repeat tickers.
        </p>
      </div>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <Gauge
              label="Credibility"
              value={pack.credibilityScore}
              tone={pack.credibilityScore == null ? "warn" : pack.credibilityScore >= 60 ? "gain" : pack.credibilityScore >= 40 ? "warn" : "loss"}
              caption={
                pack.credibilityHorizon
                  ? `Scored on the ${pack.credibilityHorizon} print across ${pack.sampleSize} ${pack.sampleSize === 1 ? noun : `${noun}s`}.`
                  : "Needs priced calls before this score means anything."
              }
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Gauge
              label="Dump risk"
              value={pack.dumpRiskScore}
              tone={pack.dumpRiskScore == null ? "warn" : pack.dumpRiskScore >= 60 ? "loss" : pack.dumpRiskScore >= 40 ? "warn" : "gain"}
              caption={`${pack.pumpDumpCount} ${pack.pumpDumpCount === 1 ? noun : `${noun}s`} flagged as pump-then-dump. ${repeatAssets} tickers were shilled more than once.`}
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Mini label="Win rate 24h" value={formatRoi(pack.winRate24h, 0)} />
        <Mini label="Win rate 7d" value={formatRoi(pack.winRate7d, 0)} />
        <Mini label="Median 7d" value={formatRoi(pack.medianRoi7d)} className={roiClass(pack.medianRoi7d)} />
        <Mini label="Unique tickers" value={String(pack.uniqueTickers)} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{mode === "first" ? "If you bought every first call" : "If you bought every mention"}</CardTitle>
            <CardDescription>Fixed $100 stake at the post-time candle. Pick a hold.</CardDescription>
          </CardHeader>
          <CardContent>
            <PortfolioPanel
              positions={pack.positions}
              scope={mode}
              stored={pack.complete ? null : pack.book}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Best and worst</CardTitle>
            <CardDescription>
              {mode === "first"
                ? "Best and worst first call, preferring the 7 day print."
                : "Best and worst mention, preferring the 7 day print."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <CallLink label="Best" mention={pack.best} />
            <CallLink label="Worst" mention={pack.worst} />
            <div>
              <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">Repeat shills</p>
              {repeats.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No ticker has been named twice.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {repeats.map((group) => (
                    <li key={group.key} className="flex items-center justify-between gap-3 text-sm">
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

function CallLink({ label, mention }: { label: string; mention: CallPeek | null }) {
  if (!mention) return <p className="text-sm text-muted-foreground">{label} call is not priced yet.</p>
  const roi = mention.roi7d ?? mention.roi24h ?? mention.roiNow
  return (
    <Link href={`/shills/${mention.id}`} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
      <span className="min-w-0">
        <span className="block text-[10px] tracking-wide text-muted-foreground uppercase">{label}</span>
        <span className="font-mono">${mention.symbol ?? "—"}</span>
        <span className="mt-1 block font-mono text-xs text-muted-foreground">
          {formatCallDate(mention.createdAt)} · {formatUsd(mention.priceAt)}
        </span>
      </span>
      <span className={`font-mono ${roiClass(roi)}`}>{formatRoi(roi)}</span>
    </Link>
  )
}
