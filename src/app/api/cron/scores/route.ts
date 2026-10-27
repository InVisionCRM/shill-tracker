import { connection } from "next/server"
import { requireBearer } from "@/lib/http"
import { recomputeInfluencers } from "@/lib/stats"

export const maxDuration = 60

async function handle(request: Request) {
  const denied = requireBearer(request, "CRON_SECRET")
  if (denied) return denied
  const count = await recomputeInfluencers()
  return Response.json({ ok: true, influencers: count })
}

export async function GET(request: Request) {
  await connection()
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}
