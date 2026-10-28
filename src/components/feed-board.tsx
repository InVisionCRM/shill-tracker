"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { formatRoi, roiClass } from "@/lib/format"
import type { FeedDTO } from "@/lib/types"
import { RelativeTime } from "./animated-number"
import { useLive } from "./live-provider"
import { MarkRoi } from "./mark"
import { MentionTags, mentionMuted } from "./mention-tags"
import { TokenLogo } from "./token-logo"
import { VoiceAvatar } from "./voice-avatar"
import { PriceMatchNote } from "@/components/price-match-note"

export function FeedBoard({ initial, live = true }: { initial: FeedDTO[]; live?: boolean }) {
  const stream = useLive()
  const items = live && stream.latest.length ? stream.latest : initial
  const [query, setQuery] = useState("")
  const [onlyFlags, setOnlyFlags] = useState(false)
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/^[@$]/, "")
    return items.filter((item) => {
      if (onlyFlags && !item.pumpDumpFlag) return false
      if (!needle) return true
      return (
        item.username.includes(needle) ||
        (item.symbol ?? "").toLowerCase().includes(needle) ||
        item.text.toLowerCase().includes(needle) ||
        item.name.toLowerCase().includes(needle)
      )
    })
  }, [items, query, onlyFlags])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ticker, voice, or words"
          aria-label="Filter the feed"
        />
        <button
          type="button"
          onClick={() => setOnlyFlags((value) => !value)}
          className={`h-8 rounded-lg border px-3 text-sm ${onlyFlags ? "border-loss bg-loss/10 text-loss" : "border-border text-muted-foreground"}`}
        >
          Pump-then-dump only
        </button>
      </div>
      <ul className="flex flex-col gap-3">
        {filtered.map((item) => (
          <li key={item.id} className={`rounded-xl border bg-card/80 p-4 ${mentionMuted(item.callKind, item.priceStatus)}`}>
            <div className="flex items-start gap-3">
              <VoiceAvatar src={item.profileImageUrl} username={item.username} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/influencers/${item.username}`} className="font-medium hover:underline">
                    {item.name}
                  </Link>
                  <span className="font-mono text-xs text-muted-foreground">@{item.username}</span>
                  <RelativeTime iso={item.createdAt} />
                  {item.influencerDemo ? <Badge variant="outline">Demo</Badge> : <Badge>Live</Badge>}
                  {item.pumpDumpFlag ? <Badge variant="destructive">Dump flag</Badge> : null}
                  {item.confidence === "low" ? <Badge variant="outline">Low confidence</Badge> : null}
                  <MentionTags
                    callKind={item.callKind}
                    priceStatus={item.priceStatus}
                    assetState={item.assetState}
                    resolutionConfidence={item.resolutionConfidence}
                  />
                </div>
                <p className="mt-2 line-clamp-3 text-sm leading-6">{item.text}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                  {item.symbol ? (
                    <Link href={`/tickers/${item.symbol}`} className="inline-flex items-center gap-1.5 font-mono text-phosphor hover:underline">
                      <TokenLogo symbol={item.symbol} imageUrl={item.imageUrl} className="size-5" />
                      ${item.symbol}
                    </Link>
                  ) : (
                    <span className="font-mono text-muted-foreground">{item.rawText}</span>
                  )}
                  {item.priceMatch && item.priceMatch !== "exact" ? (
                    <PriceMatchNote match={item.priceMatch} at={item.priceAtTs} className="w-auto" />
                  ) : null}
                  <span className="text-muted-foreground">
                    24h <span className={roiClass(item.roi24h)}>{formatRoi(item.roi24h)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    7d <span className={roiClass(item.roi7d)}>{formatRoi(item.roi7d)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Mark{" "}
                    <MarkRoi
                      assetKey={item.assetKey}
                      priceAt={item.priceAt}
                      fallbackRoi={item.roiNow}
                      fallbackPrice={item.priceNow}
                      pinned={item.pinned}
                      source={item.priceSource}
                    />
                  </span>
                  {item.repeatCount ? (
                    <span className="text-muted-foreground" title="Later mentions are not listed or scored">
                      First call · mentioned {item.repeatCount} more {item.repeatCount === 1 ? "time" : "times"}
                    </span>
                  ) : null}
                  <Link href={`/shills/${item.id}`} className="ml-auto text-foreground hover:underline">
                    Open call
                  </Link>
                </div>
              </div>
            </div>
          </li>
        ))}
        {filtered.length === 0 ? (
          <li className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nothing in the tape matches that filter.
          </li>
        ) : null}
      </ul>
    </div>
  )
}
