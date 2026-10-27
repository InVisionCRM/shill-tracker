import { allowedImageUrl } from "@/lib/img"

export const maxDuration = 10

const MAX_BYTES = 1_000_000
// Logos rarely change: a day in the browser, 30 days at the CDN, then serve stale while refreshing.
const CACHE_OK = "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800"
const CACHE_MISS = "public, max-age=300, s-maxage=3600"

export async function GET(request: Request) {
  const target = allowedImageUrl(new URL(request.url).searchParams.get("u"))
  if (!target) return new Response("not allowed", { status: 400, headers: { "cache-control": CACHE_MISS } })
  try {
    const upstream = await fetch(target, {
      headers: { accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8", "user-agent": "shill-tracker/1.0" },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
      redirect: "follow",
    })
    // A redirect must land on an allowed host too.
    if (!allowedImageUrl(upstream.url)) throw new Error("redirected off the allowlist")
    const type = upstream.headers.get("content-type") ?? ""
    // SVG can carry script; only raster formats pass.
    if (!upstream.ok || !/^image\/(png|jpe?g|gif|webp|avif|x-icon|vnd\.microsoft\.icon)/i.test(type)) {
      throw new Error(`upstream ${upstream.status} ${type}`)
    }
    const declared = Number(upstream.headers.get("content-length") ?? 0)
    if (declared > MAX_BYTES) throw new Error("too large")
    const body = await upstream.arrayBuffer()
    if (body.byteLength > MAX_BYTES) throw new Error("too large")
    return new Response(body, {
      headers: {
        "content-type": type,
        "cache-control": CACHE_OK,
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'",
      },
    })
  } catch {
    return new Response("unavailable", { status: 404, headers: { "cache-control": CACHE_MISS } })
  }
}
