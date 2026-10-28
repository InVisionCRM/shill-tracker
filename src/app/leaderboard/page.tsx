import { Suspense } from "react"
import { connection } from "next/server"
import { Leaderboard } from "@/components/leaderboard"
import { getLeaderboard } from "@/lib/queries"
import { toLeader } from "@/lib/serialize"

export const metadata = {
  title: "Leaderboard",
  description: "X accounts ranked by how their first calls moved from the price at the shill to now.",
}

export default function LeaderboardPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-mono text-xs tracking-[0.18em] text-phosphor uppercase">Leaderboard</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Who called it, and who arrived after the pump.</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Every score uses (price now − price at the shill) / price at the shill. Dump risk rises when the chart ran
          before the post and faded after. Small samples are pulled toward uncertain, not innocent. Every score uses
          each voice&apos;s first call of a ticker only.
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
  const rows = (await getLeaderboard()).map(toLeader)
  return <Leaderboard rows={rows} />
}
