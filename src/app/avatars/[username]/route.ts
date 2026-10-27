import { normalizeUsername } from "@/lib/http"

export async function GET(
  _request: Request,
  context: { params: Promise<{ username: string }> },
) {
  const { username } = await context.params
  const handle = normalizeUsername(username) ?? "voice"
  const hue = [...handle].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360
  const initials = handle.slice(0, 2).toUpperCase()
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 70% 42%)"/>
      <stop offset="1" stop-color="hsl(${(hue + 40) % 360} 80% 18%)"/>
    </linearGradient>
  </defs>
  <rect width="80" height="80" rx="18" fill="url(#g)"/>
  <text x="40" y="48" text-anchor="middle" font-family="ui-monospace, monospace" font-size="24" fill="white" font-weight="700">${initials}</text>
</svg>`
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800",
    },
  })
}
