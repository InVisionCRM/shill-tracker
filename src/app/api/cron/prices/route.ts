import { connection } from "next/server"
import { requireBearer } from "@/lib/http"
import { runPriceJob } from "@/lib/prices/job"

async function handle(request: Request) {
  const denied = requireBearer(request, "CRON_SECRET")
  if (denied) return denied
  const url = new URL(request.url)
  const limit = Number(url.searchParams.get("limit") ?? "4")
  try {
    const result = await runPriceJob({ limit: Number.isFinite(limit) ? limit : 4 })
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
