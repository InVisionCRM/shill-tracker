"use client"

import { useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScopeToggle } from "@/components/scope-toggle"
import { MarkRoi } from "@/components/mark"
import { RelativeTime } from "@/components/animated-number"
import { MentionTags, mentionMuted } from "@/components/mention-tags"
import { formatCallDate, formatRoi, formatUsd, roiClass } from "@/lib/format"

type FirstRow = {
  id: string
  username: string
  name: string
  createdAt: string
  priceAt: number | null
  roi7d: number | null
  roiNow: number | null
  priceNow: number | null
  assetKey: string | null
  pinned: boolean
  priceSource: string | null
  pumpDumpFlag: boolean
  confidence: string
  callKind?: string | null
  priceStatus?: string | null
  assetState?: string | null
  resolutionConfidence?: string | null
  symbol: string | null
  mentionCount: number
}

type MentionRow = FirstRow & {
  isFirstCall: boolean
  firstCallAt: string
  firstCallPrice: number | null
}

type BoardRow = FirstRow | MentionRow

function isRepeat(row: BoardRow): row is MentionRow {
  return "isFirstCall" in row && row.isFirstCall === false
}

export function TickerBoard({
  firstCalls,
  mentions,
  avgFirst7d,
  avgAll7d,
  total,
}: {
  firstCalls: FirstRow[]
  mentions: MentionRow[]
  avgFirst7d: number | null
  avgAll7d: number | null
  total: number
}) {
  const [mode, setMode] = useState<"first" | "all">("first")
  const avg = mode === "first" ? avgFirst7d : avgAll7d
  const shown = mode === "first" ? firstCalls.length : mentions.length
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <ScopeToggle value={mode} onChange={setMode} />
        <p className="text-xs text-muted-foreground">
          {total.toLocaleString()} mentions · {firstCalls.length.toLocaleString()} voices
        </p>
      </div>
      <section className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>{mode === "first" ? "Average 7d, first calls" : "Average 7d, all mentions"}</CardDescription>
            <CardTitle className={`font-mono text-2xl ${roiClass(avg)}`}>{formatRoi(avg)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{mode === "first" ? "Voices" : "Shown"}</CardDescription>
            <CardTitle className="font-mono text-2xl">{mode === "first" ? firstCalls.length : shown}</CardTitle>
          </CardHeader>
        </Card>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>{mode === "first" ? "First call by voice" : "Every mention"}</CardTitle>
          <CardDescription>
            {mode === "first"
              ? "One row per voice. Date and entry are that voice's first mention."
              : "Newest mentions. Each row still shows that voice's first call."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {(mode === "first" ? firstCalls : mentions).map((row: BoardRow) => (
            <Link
              key={row.id}
              href={`/shills/${row.id}`}
              className={`flex flex-col gap-2 rounded-lg border px-3 py-3 sm:flex-row sm:items-center sm:justify-between ${mentionMuted(row.callKind, row.priceStatus)}`}
            >
              <span className="min-w-0">
                <span className="block font-medium">{row.name}</span>
                <span className="font-mono text-xs text-muted-foreground">@{row.username}</span>
                <span className="mt-1 block font-mono text-sm">
                  {formatCallDate(row.createdAt)}
                </span>
                <span className="block font-mono text-lg text-phosphor">{formatUsd(row.priceAt)}</span>
                {isRepeat(row) ? (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    First call {formatCallDate(row.firstCallAt)} · {formatUsd(row.firstCallPrice)}
                  </span>
                ) : (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {row.mentionCount > 1 ? `First call · ${row.mentionCount} mentions` : "First call"}
                    {" · "}
                    <RelativeTime iso={row.createdAt} />
                  </span>
                )}
              </span>
              <span className="flex flex-wrap items-center gap-2 text-sm">
                {row.pumpDumpFlag ? <Badge variant="destructive">Dump</Badge> : null}
                {row.confidence === "low" ? <Badge variant="outline">Low confidence</Badge> : null}
                <MentionTags
                  callKind={row.callKind}
                  priceStatus={row.priceStatus}
                  assetState={row.assetState}
                  resolutionConfidence={row.resolutionConfidence}
                />
                <span className={roiClass(row.roi7d)}>
                  7d {row.priceStatus === "unverifiable" ? "unverifiable" : formatRoi(row.roi7d)}
                </span>
                <MarkRoi
                  assetKey={row.assetKey}
                  priceAt={row.priceAt}
                  fallbackRoi={row.roiNow}
                  fallbackPrice={row.priceNow}
                  pinned={row.pinned}
                  source={row.priceSource}
                />
              </span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
