import { Suspense } from "react"
import Link from "next/link"
import { connection } from "next/server"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { TrackVoiceButton } from "@/components/track-voice-button"
import { VoiceAvatar } from "@/components/voice-avatar"
import { getLeaderboard } from "@/lib/queries"
import { toLeader } from "@/lib/serialize"

export const metadata = { title: "Voices", description: "Every X account Shill Tracker follows." }

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
            which skips demo voices.
          </p>
        </div>
        <TrackVoiceButton />
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
                <CardContent className="font-mono text-sm text-muted-foreground">
                  {row.shillCount} first calls
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
