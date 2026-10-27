import { connection } from "next/server"
import { requireBearer } from "@/lib/http"
import { runPriceJob } from "@/lib/prices/job"

export const maxDuration = 60

async function handle(request: Request) {
  const denied = requireBearer(request, "CRON_SECRET")
  if (denied) return denied
  const url = new URL(request.url)
  const raw = url.searchParams.get("limit")
  const parsed = raw == null ? 800 : Number(raw)
  const budgetRaw = Number(url.searchParams.get("budget_ms"))
  // maxDuration is 60s: up to 48s of work plus about 9s to save the summary.
  const budgetMs = Number.isFinite(budgetRaw) && budgetRaw > 0 ? Math.min(budgetRaw, 48_000) : 45_000
  const limit = Number.isFinite(parsed) ? parsed : 800
  try {
    const result = await runPriceJob({ limit, budgetMs })
    return Response.json(result)
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "price job failed" },
      { status: 500 },
    )
  }
}

export async function GET(request: Request) {
  await connection()
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}
