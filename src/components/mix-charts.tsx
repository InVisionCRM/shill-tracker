import { chainLabel } from "@/lib/format"
import { TokenLogo } from "./token-logo"

export function TickerDonut({
  slices,
}: {
  slices: { symbol: string; chain: string | null; count: number }[]
}) {
  const total = slices.reduce((sum, slice) => sum + slice.count, 0)
  if (!total) return <p className="text-sm text-muted-foreground">No tickers yet.</p>
  const colors = ["var(--phosphor)", "var(--chart-4)", "var(--warn)", "var(--loss)", "var(--chart-5)", "var(--gain)"]
  const ends = slices.reduce<number[]>((acc, slice) => {
    acc.push((acc.at(-1) ?? 0) + (slice.count / total) * 100)
    return acc
  }, [])
  const stops = slices.map((slice, index) => {
    const start = index === 0 ? 0 : ends[index - 1]
    return `${colors[index % colors.length]} ${start}% ${ends[index]}%`
  })
  return (
    <div className="flex items-center gap-4">
      <div
        className="size-28 shrink-0 rounded-full"
        style={{ background: `conic-gradient(${stops.join(", ")})` }}
        role="img"
        aria-label="Share of calls by ticker"
      >
        <div className="m-4 flex size-20 items-center justify-center rounded-full bg-card font-mono text-xs">
          {total}
        </div>
      </div>
      <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
        {slices.map((slice) => (
          <li key={`${slice.symbol}-${slice.chain ?? ""}`} className="flex items-center gap-2 text-sm">
            <TokenLogo symbol={slice.symbol} chain={slice.chain} className="size-6" />
            <span className="font-mono">${slice.symbol}</span>
            {slice.chain ? <span className="text-xs text-muted-foreground">{chainLabel(slice.chain)}</span> : null}
            <span className="ml-auto font-mono text-xs tabular-nums">{slice.count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function RoiHeatmap({ weeks }: { weeks: { week: string; roi: number | null }[] }) {
  if (!weeks.length) return <p className="text-sm text-muted-foreground">No settled 7 day returns yet.</p>
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
      {weeks.map((week) => {
        const roi = week.roi ?? 0
        const tone =
          week.roi == null
            ? "bg-muted"
            : roi >= 0.2
              ? "bg-gain"
              : roi >= 0
                ? "bg-gain/50"
                : roi <= -0.2
                  ? "bg-loss"
                  : "bg-loss/50"
        return (
          <div key={week.week} className="flex flex-col items-center gap-1">
            <div className={`h-8 w-full rounded-md ${tone}`} title={`${week.week} ${Math.round(roi * 100)}%`} />
            <span className="font-mono text-[9px] text-muted-foreground">{week.week.slice(5)}</span>
          </div>
        )
      })}
    </div>
  )
}
