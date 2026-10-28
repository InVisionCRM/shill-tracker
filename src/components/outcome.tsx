import { formatRoi, formatUsd, roiClass } from "@/lib/format"

type Prices = {
  priceAt?: number | null
  priceNow?: number | null
}

/** The only % this app shows: (price now − price at the shill) / price at the shill. Null when either is missing. */
export function shillMove(row: Prices): number | null {
  const at = row.priceAt
  const now = row.priceNow
  if (at == null || now == null || !Number.isFinite(at) || !Number.isFinite(now) || at <= 0) return null
  return (now - at) / at
}

/** The call's % move: the biggest, boldest thing on a call row. Green up, red down. Both prices underneath. */
export function Outcome({ row, size = "lg" }: { row: Prices; size?: "lg" | "xl" }) {
  const value = shillMove(row)
  return (
    <span className="flex flex-col items-end text-right leading-none">
      {value == null ? (
        <span className={`font-mono font-bold text-muted-foreground ${size === "xl" ? "text-2xl" : "text-base"}`}>price pending</span>
      ) : (
        <span
          className={`font-mono font-extrabold tracking-tight tabular-nums ${size === "xl" ? "text-5xl sm:text-6xl" : "text-3xl"} ${roiClass(value)}`}
        >
          {formatRoi(value, Math.abs(value) < 0.1 ? 1 : 0)}
        </span>
      )}
      <span className="mt-1.5 font-mono text-[11px] text-muted-foreground">
        Shilled at {row.priceAt == null ? "price pending" : formatUsd(row.priceAt)}
      </span>
      <span className="mt-0.5 font-mono text-[11px] text-muted-foreground">
        Now {row.priceNow == null ? "price pending" : formatUsd(row.priceNow)}
      </span>
    </span>
  )
}
