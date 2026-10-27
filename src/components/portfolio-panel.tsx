"use client"

import { useState } from "react"
import { equityCurve } from "@/lib/scoring/aggregate"
import type { HorizonKey } from "@/lib/format"
import { HORIZONS, formatRoi, formatUsd, roiClass } from "@/lib/format"
import type { PositionDTO } from "@/lib/types"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { EquityChart } from "./equity-chart"
import { MarkRoi } from "./mark"
import { AnimatedNumber } from "./animated-number"

export type StoredBook = Partial<Record<HorizonKey, { portfolio: number | null; n: number }>>

export function PortfolioPanel({
  positions,
  scope = "first",
  stored = null,
}: {
  positions: PositionDTO[]
  scope?: "first" | "all"
  stored?: StoredBook | null
}) {
  const [horizon, setHorizon] = useState<HorizonKey>("7d")
  const noun = scope === "first" ? "first call" : "mention"
  const rois = positions.map((position) => ({
    createdAt: new Date(position.createdAt).getTime(),
    roi: roiOf(position, horizon),
  }))
  const curve = equityCurve(rois)
  const closed = rois.filter((row) => row.roi != null).length
  const slot = stored?.[horizon]
  const exit = stored ? slot?.portfolio ?? null : closed ? curve.deployed + curve.equity : null
  const pnl = stored ? (slot?.portfolio == null ? null : slot.portfolio - (slot.n ?? 0) * 100) : curve.equity
  const settled = stored ? (slot?.n ?? 0) : closed
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">
            $100 into every {noun}
          </p>
          <p className="mt-1 font-mono text-3xl tabular-nums">
            <AnimatedNumber value={exit} format={(value) => formatUsd(value)} />
          </p>
          <p className={`font-mono text-sm tabular-nums ${roiClass(settled ? (pnl ?? 0) / (settled * 100) : null)}`}>
            {formatUsd(pnl)} P&L · {settled} {plural(settled, noun)} settled
            {stored ? "" : ` · ${positions.length} in the book`}
          </p>
        </div>
        <ToggleGroup
          value={[horizon]}
          onValueChange={(value) => {
            const next = value[value.length - 1] as HorizonKey | undefined
            if (next) setHorizon(next)
          }}
          spacing={0}
          size="sm"
          variant="outline"
        >
          {HORIZONS.map((item) => (
            <ToggleGroupItem key={item.key} value={item.key}>
              {item.key === "now" ? "Mark" : item.key}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {stored ? (
        <p className="text-xs leading-5 text-muted-foreground">
          The dollar figure is the stored {noun} book. This page does not download every stake.
        </p>
      ) : (
        <EquityChart points={curve.points} />
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        Each {noun} is a separate $100 stake at the post-time candle. No fees, no size limits, no overlap netting.
        A post that names two assets is two stakes. Seed paths stay illustrative. Live paths use the latest mark
        when you pick Mark.
      </p>
      <ul className="flex flex-col gap-2">
        {stored
          ? null
          : positions.slice(0, 6).map((position) => (
          <li key={position.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="font-mono">{position.symbol ?? "—"}</span>
            {horizon === "now" ? (
              <MarkRoi
                assetKey={position.assetKey}
                priceAt={position.priceAt}
                fallbackRoi={position.roiNow}
                fallbackPrice={null}
                pinned={position.pinned}
                source={position.priceSource}
              />
            ) : (
              <span className={`font-mono tabular-nums ${roiClass(roiOf(position, horizon))}`}>
                {formatRoi(roiOf(position, horizon))}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function plural(count: number, noun: string) {
  return count === 1 ? noun : `${noun}s`
}

function roiOf(position: PositionDTO, horizon: HorizonKey) {
  if (horizon === "1h") return position.roi1h
  if (horizon === "24h") return position.roi24h
  if (horizon === "7d") return position.roi7d
  if (horizon === "30d") return position.roi30d
  return position.roiNow
}
