import { fetchChartCandles, isChartToken, type ChartTimeframe } from "@/lib/prices/chart-candles"

/**
 * GET /api/candles?token=0x…&tf=day|hour — real PulseX candles for one token. No database work: the CDN
 * caches each token's answer, so GeckoTerminal and DexScreener see about one request per token per window.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get("token")?.toLowerCase() ?? ""
  const tf: ChartTimeframe = url.searchParams.get("tf") === "hour" ? "hour" : "day"
  if (!isChartToken(token)) return Response.json({ error: "token must be a 0x address" }, { status: 400 })
  const maxAge = tf === "hour" ? 1800 : 21600
  try {
    const result = await fetchChartCandles(token, tf, maxAge)
    return Response.json(result, {
      headers: { "Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=86400` },
    })
  } catch {
    return Response.json({ pool: null, candles: [] }, { headers: { "Cache-Control": "public, s-maxage=300" } })
  }
}
