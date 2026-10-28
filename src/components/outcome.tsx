import { formatRoi, roiClass } from "@/lib/format"

type Rois = {
  roi24h?: number | null
  roi7d?: number | null
  roiNow?: number | null
  priceStatus?: string | null
}

/** The stored move since the post, preferring the settled 7 day print. Stored values only, never estimated. */
export function callOutcome(row: Rois): { value: number | null; horizon: "7d" | "24h" | "now" | null } {
  if (row.priceStatus === "unverifiable") return { value: null, horizon: null }
  if (row.roi7d != null && Number.isFinite(row.roi7d)) return { value: row.roi7d, horizon: "7d" }
  if (row.roi24h != null && Number.isFinite(row.roi24h)) return { value: row.roi24h, horizon: "24h" }
  if (row.roiNow != null && Number.isFinite(row.roiNow)) return { value: row.roiNow, horizon: "now" }
  return { value: null, horizon: null }
}

/** The call's % move: the biggest, boldest thing on a call row. Green up, red down. */
export function Outcome({ row, size = "lg" }: { row: Rois; size?: "lg" | "xl" }) {
  const { value, horizon } = callOutcome(row)
  return (
    <span className="flex flex-col items-end leading-none">
      <span
        className={`font-mono font-extrabold tracking-tight tabular-nums ${size === "xl" ? "text-5xl sm:text-6xl" : "text-3xl"} ${roiClass(value)}`}
      >
        {formatRoi(value, value != null && Math.abs(value) < 0.1 ? 1 : 0)}
      </span>
      <span className="mt-1 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
        {horizon ?? (row.priceStatus === "unverifiable" ? "unverifiable" : "not priced")}
      </span>
    </span>
  )
}
