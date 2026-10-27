import { connection } from "next/server"
import { addInfluencer, untrackInfluencer } from "@/lib/ingest"
import { isRecord, requireBearer } from "@/lib/http"
import { listTrackedForBot } from "@/lib/queries"

export async function GET(request: Request) {
  await connection()
  const denied = requireBearer(request, "INGEST_SECRET")
  if (denied) return denied
  const influencers = await listTrackedForBot()
  return Response.json({ influencers })
}

export async function POST(request: Request) {
  const denied = requireBearer(request, "INGEST_SECRET")
  if (denied) return denied
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 })
  }
  if (!isRecord(body) || typeof body.username !== "string") {
    return Response.json({ error: "username is required" }, { status: 400 })
  }
  const result = await addInfluencer({
    username: body.username,
    name: typeof body.name === "string" ? body.name : null,
    xUserId: typeof body.x_user_id === "string" ? body.x_user_id : null,
  })
  if ("error" in result) return Response.json({ error: result.error }, { status: 400 })
  return Response.json(
    {
      created: result.created,
      influencer: {
        id: result.influencer.id,
        x_user_id: result.influencer.xUserId,
        username: result.influencer.username,
        name: result.influencer.name,
        tracked: result.influencer.tracked,
        is_demo: result.influencer.isDemo,
        latest_post_id: result.influencer.latestPostId,
      },
    },
    { status: result.created ? 201 : 200 },
  )
}

export async function DELETE(request: Request) {
  const denied = requireBearer(request, "INGEST_SECRET")
  if (denied) return denied
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 })
  }
  if (!isRecord(body) || typeof body.username !== "string") {
    return Response.json({ error: "username is required" }, { status: 400 })
  }
  const result = await untrackInfluencer(body.username)
  if ("error" in result) return Response.json({ error: result.error }, { status: 404 })
  return Response.json({ ok: true, influencer: result.influencer })
}
