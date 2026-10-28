import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Outcome } from "@/components/outcome"
import { RelativeTime } from "@/components/animated-number"
import { MentionTags, mentionMuted } from "@/components/mention-tags"
import { formatCallDate } from "@/lib/format"

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

export function TickerBoard({
  firstCalls,
}: {
  firstCalls: FirstRow[]
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        One row per voice: the first call. Later mentions are not listed or scored.
      </p>
      <Card>
        <CardHeader>
          <CardTitle>First call by voice</CardTitle>
          <CardDescription>
            One row per voice. Date and entry are that voice&apos;s first call.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {firstCalls.map((row) => (
            <Link
              key={row.id}
              href={`/shills/${row.id}`}
              className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-3 ${mentionMuted(row.callKind, row.priceStatus)}`}
            >
              <span className="min-w-0">
                <span className="block font-medium">{row.name}</span>
                <span className="font-mono text-xs text-muted-foreground">@{row.username}</span>
                <span className="mt-1 block font-mono text-sm">
                  {formatCallDate(row.createdAt)}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {row.mentionCount > 1
                    ? `First call · mentioned ${row.mentionCount - 1} more ${row.mentionCount - 1 === 1 ? "time" : "times"}`
                    : "First call"}
                  {" · "}
                  <RelativeTime iso={row.createdAt} />
                </span>
              </span>
              <span className="flex shrink-0 flex-wrap items-center justify-end gap-2 text-sm">
                {row.pumpDumpFlag ? <Badge variant="destructive">Dump</Badge> : null}
                {row.confidence === "low" ? <Badge variant="outline">Low confidence</Badge> : null}
                <MentionTags
                  callKind={row.callKind}
                  priceStatus={row.priceStatus}
                  assetState={row.assetState}
                  resolutionConfidence={row.resolutionConfidence}
                />
                <Outcome row={row} />
              </span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
