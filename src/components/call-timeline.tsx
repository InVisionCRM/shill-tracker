import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { TokenLogo } from "@/components/token-logo"
import { formatCallDate, formatRoi, formatUsd, roiClass } from "@/lib/format"
import { PriceMatchNote } from "@/components/price-match-note"

export type TimelineCall = {
  id: string
  symbol: string | null
  chain: string | null
  createdAt: Date
  priceAt: number | null
  priceMatch?: string | null
  priceAtTs?: Date | null
  roi7d: number | null
  roi24h: number | null
  roiNow: number | null
  pumpDumpFlag: boolean
}

export function CallTimeline({
  calls,
  logos,
  total,
}: {
  calls: TimelineCall[]
  logos: ReadonlyMap<string, string | null | undefined>
  total: number
}) {
  if (calls.length === 0) {
    return <p className="text-sm text-muted-foreground">No ticker mentions yet.</p>
  }
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-xl font-semibold">First calls</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Newest first. One stop per ticker, with the entry from the first time this voice named it.
          {total > calls.length ? ` Showing ${calls.length} of ${total}.` : ""}
        </p>
      </div>
      <ol className="relative ms-3 flex flex-col gap-3 border-s border-phosphor/40 ps-6">
        {calls.map((call, index) => {
          const roi = call.roi7d ?? call.roi24h ?? call.roiNow
          return (
            <li
              key={call.id}
              className={index < 8 ? "timeline-item relative" : "relative"}
              style={index < 8 ? { animationDelay: `${index * 40}ms` } : undefined}
            >
              <span
                className="absolute -start-[1.65rem] top-4 size-2.5 rounded-full bg-phosphor ring-4 ring-background"
                aria-hidden
              />
              <Link
                href={`/shills/${call.id}`}
                className="flex flex-col gap-2 rounded-xl border bg-card/70 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex items-center gap-2">
                  <TokenLogo
                    symbol={call.symbol}
                    chain={call.chain}
                    imageUrl={call.symbol ? logos.get(call.symbol.toUpperCase()) : null}
                    loading="lazy"
                    className="size-8"
                  />
                  <span>
                    <span className="flex flex-wrap items-center gap-2 font-mono">
                      {call.symbol ? `$${call.symbol}` : "—"}
                      {call.pumpDumpFlag ? <Badge variant="destructive">Pump then dump</Badge> : null}
                    </span>
                    <span className="mt-0.5 block font-mono text-xs text-muted-foreground">
                      {formatCallDate(call.createdAt)}
                    </span>
                  </span>
                </span>
                <span className="flex items-baseline justify-between gap-4 sm:block sm:text-right">
                  <span className="block font-mono text-xl tabular-nums">{formatUsd(call.priceAt)}</span>
                  <PriceMatchNote match={call.priceMatch} at={call.priceAtTs} />
                  <span className={`font-mono text-sm ${roiClass(roi)}`}>{formatRoi(roi)}</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
