import { Suspense } from "react"
import { connection } from "next/server"
import { Leaderboard } from "@/components/leaderboard"
import { getLeaderboard, getSparklines } from "@/lib/queries"
import { toLeader } from "@/lib/serialize"

export const metadata = { title: "Leaderboard" }

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Ranking voices…</p>}>
      <Board />
    </Suspense>
  )
}

async function Board() {
  await connection()
  const [board, sparks] = await Promise.all([getLeaderboard(), getSparklines()])
  const rows = board.map((row) => ({ ...toLeader(row), sparkline: sparks.get(row.id) ?? [] }))
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-mono text-xs tracking-[0.18em] text-phosphor uppercase">Leaderboard</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Who called it, and who arrived after the pump.</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Credibility prefers the 7 day print once three calls have settled. Dump risk rises when the chart ran
          before the post and faded after. Small samples are pulled toward uncertain, not innocent. Sparklines
          are the last first-call 7 day returns.
        </p>
      </div>
      <Leaderboard rows={rows} />
    </div>
  )
}
