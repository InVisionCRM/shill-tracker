import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { TokenLogo } from "@/components/token-logo"
import { formatCallDate, formatUsd } from "@/lib/format"
import { Outcome } from "@/components/outcome"
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
          Newest first. Each ticker once, at its first call.
          {total > calls.length ? ` Showing ${calls.length} of ${total}.` : ""}
        </p>
      </div>
      <ol className="flex flex-col gap-2">
        {calls.map((call) => (
          <li key={call.id}>
            <Link
              href={`/shills/${call.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border bg-card/70 px-3 py-3"
            >
              <span className="flex min-w-0 items-center gap-2">
                <TokenLogo
                  symbol={call.symbol}
                  chain={call.chain}
                  imageUrl={call.symbol ? logos.get(call.symbol.toUpperCase()) : null}
                  loading="lazy"
                  className="size-8"
                />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 font-mono">
                    {call.symbol ? `$${call.symbol}` : "—"}
                    {call.pumpDumpFlag ? <Badge variant="destructive">Pump then dump</Badge> : null}
                  </span>
                  <span className="mt-0.5 block font-mono text-xs text-muted-foreground">
                    {formatCallDate(call.createdAt)} · {formatUsd(call.priceAt)}
                  </span>
                  <PriceMatchNote match={call.priceMatch} at={call.priceAtTs} />
                </span>
              </span>
              <Outcome row={call} />
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}
