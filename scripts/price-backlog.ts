/**
 * Clears the pricing backlog outside Vercel's 60s limit, with the same grouped-by-token job code.
 * Runs the job in repeated budgeted passes and stops when nothing is left, when free-tier rate
 * limits stall progress, or at MAX_MINUTES.
 *
 *   DATABASE_URL=... pnpm prices:backlog            # direct Postgres (GitHub Actions)
 *   DB_DRIVER=neon-ws DATABASE_URL=... pnpm prices:backlog   # Neon over WebSocket/443 (no port 5432)
 */
import type { Pool } from "pg"

const maxMinutes = Number(process.env.MAX_MINUTES ?? 25)
const passBudgetMs = Number(process.env.PASS_BUDGET_MS ?? 120_000)
const stallLimit = Number(process.env.STALL_PASSES ?? 3)

async function installPool() {
  if (process.env.DB_DRIVER !== "neon-ws") return
  const { Pool: NeonPool, neonConfig } = await import("@neondatabase/serverless")
  const { default: ws } = await import("ws")
  neonConfig.webSocketConstructor = ws
  const pool = new NeonPool({ connectionString: process.env.DATABASE_URL, max: 5 })
  ;(globalThis as unknown as { pool?: Pool }).pool = pool as unknown as Pool
}

type Progress = Record<string, number> | null

function line(progress: Progress) {
  if (!progress) return "progress unavailable"
  return Object.entries(progress)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ")
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set")
  await installPool()
  const { runPriceJob } = await import("../src/lib/prices/job")
  const { refreshNowPrices } = await import("../src/lib/prices/now")
  const { fillEntries } = await import("../src/lib/prices/entry")
  const { getPricingProgress } = await import("../src/lib/queries")
  const { getPool } = await import("../src/lib/db")

  const started = Date.now()
  const before = (await getPricingProgress()) as unknown as Progress
  console.log(`start ${new Date().toISOString()} ${line(before)}`)
  let stalled = 0
  let pass = 0
  let lastProgress = before
  while (Date.now() - started < maxMinutes * 60_000) {
    pass += 1
    const remaining = maxMinutes * 60_000 - (Date.now() - started)
    const result = (await runPriceJob({
      limit: 800,
      budgetMs: Math.min(passBudgetMs, remaining),
      resolveConcurrency: Number(process.env.RESOLVE_CONCURRENCY ?? 6),
      resolveShare: 0.6,
    })) as {
      resolved?: number
      priced?: number
      summary?: { attempted: number; priced: number; resolveGroups: number; resolveGroupsPending: number; unverifiable: number; errorsBySource: Record<string, number>; stoppedBy: string; durationMs: number }
      progress?: Progress
    }
    const summary = result.summary
    lastProgress = result.progress ?? lastProgress
    console.log(
      `pass ${pass} ${new Date().toISOString()} resolved=${result.resolved ?? 0} priced=${summary?.priced ?? 0} ` +
        `attempted=${summary?.attempted ?? 0} unverifiable=${summary?.unverifiable ?? 0} groupsLeft=${summary?.resolveGroupsPending ?? 0} ` +
        `stop=${summary?.stoppedBy} ms=${summary?.durationMs} errors=${JSON.stringify(summary?.errorsBySource ?? {})} outcomes=${JSON.stringify((summary as { outcomes?: unknown } | undefined)?.outcomes ?? {})} phases=${JSON.stringify((summary as { phases?: unknown } | undefined)?.phases ?? {})} | ${line(lastProgress)}`,
    )
    // Price at the shill from GeckoTerminal minute candles (then PulseX reserves / Binance 1m).
    const entries = await fillEntries({ budgetMs: Number(process.env.ENTRY_BUDGET_MS ?? 120_000), limit: 400 }).catch(
      (error: unknown) => ({ error: error instanceof Error ? error.message : "failed", priced: 0 }),
    )
    console.log(`entries ${JSON.stringify(entries)}`)
    // One current price per token for every priced first call (free sources only).
    const now = await refreshNowPrices({ budgetMs: 40_000 }).catch((error: unknown) => ({ error: error instanceof Error ? error.message : "failed" }))
    console.log(`now-prices ${JSON.stringify(now)}`)
    const moved = Number(entries.priced ?? 0) + Number(result.resolved ?? 0) + Number(summary?.priced ?? 0) + Number(summary?.unverifiable ?? 0)
    const idle = !summary?.attempted && !summary?.resolveGroups && !summary?.resolveGroupsPending
    const nowBusy = "missing" in now && now.missing > 0 && now.priced > 0
    const entriesBusy = Number(entries.priced ?? 0) > 0
    if (idle && !nowBusy && !entriesBusy) {
      console.log("nothing pending; done")
      break
    }
    if (moved === 0) {
      stalled += 1
      if (stalled >= stallLimit) {
        console.log(`no progress in ${stalled} passes (likely free-tier rate limits); stopping`)
        break
      }
      // Let per-host 429 cooldowns expire before the next pass.
      await new Promise((resolve) => setTimeout(resolve, 50_000))
    } else {
      stalled = 0
    }
  }
  console.log(`end ${new Date().toISOString()} ${line(lastProgress)}`)
  await getPool().end()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "price backlog failed")
  process.exit(1)
})
