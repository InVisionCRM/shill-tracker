import { Suspense } from "react"
import { connection } from "next/server"
import { Leaderboard } from "@/components/leaderboard"
import { getLeaderboard, getSparklines } from "@/lib/queries"
import { toLeader } from "@/lib/serialize"

export const metadata = {
  title: "Leaderboard",
  description: "X accounts ranked by how their crypto calls actually performed at 24h, 7d and 30d.",
}

export default function LeaderboardPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-mono text-xs tracking-[0.18em] text-phosphor uppercase">Leaderboard</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Who called it, and who arrived after the pump.</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Credibility prefers the 7 day print once three calls have settled. Dump risk rises when the chart ran
          before the post and faded after. Small samples are pulled toward uncertain, not innocent. Sparklines
          are the last first-call 7 day returns. A rank that moves says how far that voice shifted after you change
          the sort.
        </p>
      </div>
      <Suspense fallback={<div className="min-h-[100svh]" aria-hidden />}>
        <Board />
      </Suspense>
    </div>
  )
}

async function Board() {
  await connection()
  const [board, sparks] = await Promise.all([getLeaderboard(), getSparklines()])
  const rows = board.map((row) => ({ ...toLeader(row), sparkline: sparks.get(row.id) ?? [] }))
  return <Leaderboard rows={rows} />
}
