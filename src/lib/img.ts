/** Token and avatar art hosts we proxy. Anything else is not fetched (no open proxy, no SSRF). */
export const IMAGE_HOSTS = new Set([
  "cdn.dexscreener.com",
  "dd.dexscreener.com",
  "coin-images.coingecko.com",
  "assets.coingecko.com",
  "assets.geckoterminal.com",
  "pbs.twimg.com",
  "abs.twimg.com",
  "raw.githubusercontent.com",
  "tokens.app.pulsex.com",
])

export function allowedImageUrl(raw: string | null | undefined): URL | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    if (!IMAGE_HOSTS.has(url.hostname)) return null
    if (url.username || url.password || (url.port && url.port !== "443" && url.port !== "80")) return null
    url.protocol = "https:"
    url.port = ""
    return url
  } catch {
    return null
  }
}

/** Same-origin URL for remote art, so the browser never talks to (or gets cookies from) a third party. */
export function proxiedImage(raw: string | null | undefined): string | null {
  if (raw?.startsWith("/") && !raw.startsWith("//")) return raw
  const url = allowedImageUrl(raw)
  return url ? `/api/img?u=${encodeURIComponent(url.toString())}` : null
}
