import { connection } from "next/server"
import { requireBearer } from "@/lib/http"
import { refreshNowPrices } from "@/lib/prices/now"
import { fillEntries } from "@/lib/prices/entry"

export const maxDuration = 60

async function handle(request: Request) {
  const denied = requireBearer(request, "CRON_SECRET")
  if (denied) return denied
  const budgetRaw = Number(new URL(request.url).searchParams.get("budget_ms"))
  const budgetMs = Number.isFinite(budgetRaw) && budgetRaw > 0 ? Math.min(budgetRaw, 48_000) : 45_000
  try {
    // Current price per token first (DexScreener), then the price at the shill with what is left.
    const started = Date.now()
    const now = await refreshNowPrices({ budgetMs: Math.min(20_000, budgetMs) })
    const left = budgetMs - (Date.now() - started)
    const entries = left > 10_000 ? await fillEntries({ budgetMs: left, limit: 120 }) : null
    return Response.json({ ok: true, ...now, entries })
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "now-price refresh failed" }, { status: 500 })
  }
}

export async function GET(request: Request) {
  await connection()
  return handle(request)
}

export async function POST(request: Request) {
  await connection()
  return handle(request)
}
