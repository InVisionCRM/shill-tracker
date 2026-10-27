"use client"

import { formatRoi, formatUsd, roiClass } from "@/lib/format"
import { useMarkPrice } from "./live-provider"

export function MarkRoi({
  assetKey,
  priceAt,
  fallbackRoi,
  fallbackPrice,
  pinned,
  source,
}: {
  assetKey: string | null
  priceAt: number | null
  fallbackRoi: number | null
  fallbackPrice: number | null
  pinned: boolean
  source?: string | null
}) {
  const live = useMarkPrice(assetKey, fallbackPrice, pinned)
  const roi =
    !pinned && live != null && priceAt != null && priceAt !== 0 ? live / priceAt - 1 : fallbackRoi
  const moving = !pinned && live != null && fallbackPrice != null && live !== fallbackPrice
  return (
    <span className={`font-mono tabular-nums ${roiClass(roi)}`}>
      {formatRoi(roi)}
      {moving ? <span className="ml-1 text-[10px] text-phosphor">LIVE</span> : null}
      {source === "seed" ? <span className="ml-1 text-[10px] text-warn">SEED</span> : null}
    </span>
  )
}

export function MarkPrice({
  assetKey,
  fallback,
  pinned,
}: {
  assetKey: string | null
  fallback: number | null
  pinned: boolean
}) {
  const live = useMarkPrice(assetKey, fallback, pinned)
  return <span className="font-mono tabular-nums">{formatUsd(live)}</span>
}
