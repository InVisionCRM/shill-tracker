import { connection } from "next/server"
import { ensureFreshQuotes } from "@/lib/prices/job"
import { getFeed, getPricingProgress, getQuotes } from "@/lib/queries"

export async function GET() {
  await connection()
  try {
    await ensureFreshQuotes()
  } catch {
    // Stale quotes still render. The next poll retries.
  }
  const [quotes, latest, progress] = await Promise.all([getQuotes(), getFeed(30), getPricingProgress()])
  return Response.json(
    {
    now: new Date().toISOString(),
    progress,
    quotes: quotes.map((quote) => ({
      assetKey: quote.assetKey,
      symbol: quote.symbol,
      name: quote.name,
      price: quote.price,
      change24h: quote.change24h,
      source: quote.source,
      updatedAt: quote.updatedAt.toISOString(),
    })),
    latest: latest.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
    })),
    },
    // Served from Vercel's CDN for 2 minutes, so open tabs share one database read.
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=120, stale-while-revalidate=600" } },
  )
}
