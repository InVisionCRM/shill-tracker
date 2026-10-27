import { Suspense } from "react"
import Link from "next/link"
import { connection } from "next/server"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { TrackVoiceDialog } from "@/components/voice-actions"
import { VoiceAvatar } from "@/components/voice-avatar"
import { formatCompact, formatRoi, roiClass } from "@/lib/format"
import { getLeaderboard } from "@/lib/queries"
import { toLeader } from "@/lib/serialize"

export const metadata = { title: "Voices" }

export default function VoicesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading voices…</p>}>
      <Voices />
    </Suspense>
  )
}

async function Voices() {
  await connection()
  const rows = (await getLeaderboard()).map(toLeader)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs tracking-[0.18em] text-phosphor uppercase">Voices</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Tracked accounts</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Add a handle here or with POST /api/influencers. The bot learns who to poll from GET /api/influencers,
            which skips demo voices. The 7 day median is each voice&apos;s first call on a ticker. Shill count is
            every mention.
          </p>
        </div>
        <TrackVoiceDialog />
      </div>
      {rows.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No voices yet</EmptyTitle>
            <EmptyDescription>Track a handle, then let the bot post its timeline.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((row) => (
            <Link key={row.id} href={`/influencers/${row.username}`}>
              <Card className="h-full">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <VoiceAvatar src={row.profileImageUrl} username={row.username} />
                    <div className="min-w-0">
                      <CardTitle className="truncate">{row.name}</CardTitle>
                      <CardDescription className="font-mono">@{row.username}</CardDescription>
                    </div>
                    {row.isDemo ? <Badge variant="outline">Demo</Badge> : null}
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-2 font-mono text-sm">
                  <Metric label="Followers" value={formatCompact(row.followersCount)} />
                  <Metric label="Shills" value={String(row.shillCount)} />
                  <Metric label="7d median" value={formatRoi(row.medianRoi7d)} className={roiClass(row.medianRoi7d)} />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <p className="text-[10px] tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className={`tabular-nums ${className ?? ""}`}>{value}</p>
    </div>
  )
}
