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

export function PortfolioPanel({ positions }: { positions: PositionDTO[] }) {
  const [horizon, setHorizon] = useState<HorizonKey>("7d")
  const rois = positions.map((position) => ({
    createdAt: new Date(position.createdAt).getTime(),
    roi: roiOf(position, horizon),
  }))
  const curve = equityCurve(rois)
  const closed = rois.filter((row) => row.roi != null).length
  const exit = curve.deployed + curve.equity
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">$100 into every call</p>
          <p className="mt-1 font-mono text-3xl tabular-nums">
            <AnimatedNumber value={closed ? exit : null} format={(value) => formatUsd(value)} />
          </p>
          <p className={`font-mono text-sm tabular-nums ${roiClass(curve.deployed ? curve.equity / curve.deployed : null)}`}>
            {formatUsd(curve.equity)} P&L · {closed} of {positions.length} calls have this print
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
      <EquityChart points={curve.points} />
      <p className="text-xs leading-5 text-muted-foreground">
        Each call is a separate $100 stake at the post-time candle. No fees, no size limits, no overlap netting.
        A post that names two assets is two stakes. Seed paths stay illustrative. Live paths use the latest mark
        when you pick Mark.
      </p>
      <ul className="flex flex-col gap-2">
        {positions.slice(0, 6).map((position) => (
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

function roiOf(position: PositionDTO, horizon: HorizonKey) {
  if (horizon === "1h") return position.roi1h
  if (horizon === "24h") return position.roi24h
  if (horizon === "7d") return position.roi7d
  if (horizon === "30d") return position.roi30d
  return position.roiNow
}
