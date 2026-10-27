import { connection } from "next/server"
import { ingestPosts, parseIngestBody } from "@/lib/ingest"
import { requireBearer } from "@/lib/http"
import { runPriceJob } from "@/lib/prices/job"

export async function POST(request: Request) {
  const denied = requireBearer(request, "INGEST_SECRET")
  if (denied) return denied

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 })
  }
  const parsed = parseIngestBody(body)
  if ("error" in parsed && parsed.error) {
    return Response.json({ error: parsed.error }, { status: 400 })
  }
  if (!("value" in parsed)) {
    return Response.json({ error: "invalid payload" }, { status: 400 })
  }

  try {
    const defer = ["1", "true"].includes(new URL(request.url).searchParams.get("defer_pricing") ?? "")
    const result = await ingestPosts(parsed.value, { deferPricing: defer })
    let pricing: unknown = null
    if (!defer && result.mention_ids.length) {
      try {
        pricing = await runPriceJob({ limit: 3, mentionIds: result.mention_ids })
      } catch (error) {
        pricing = { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
    return Response.json({ ...result, pricing })
  } catch (error) {
    const message = error instanceof Error ? error.message : "ingest failed"
    const status = message.includes("already linked") ? 409 : 500
    return Response.json({ error: message }, { status })
  }
}

export async function GET() {
  await connection()
  return Response.json(
    {
      endpoint: "POST /api/ingest/posts",
      auth: "Authorization: Bearer $INGEST_SECRET",
    },
    { status: 200 },
  )
}
