import { connection } from "next/server"
import { getDockTokens } from "@/lib/queries"

/** Public, read-only: every shilled token's logo for the dock. Capped and ordered busiest-first. */
export async function GET() {
  await connection()
  const tokens = await getDockTokens()
  return Response.json(
    { tokens },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
  )
}
