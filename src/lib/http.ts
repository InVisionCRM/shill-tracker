import { createHash, timingSafeEqual } from "node:crypto"

export function textHash(text: string) {
  return createHash("sha256").update(text).digest("hex")
}

/** Read-only health checks accept HEALTH_TOKEN (optional) as well as CRON_SECRET. Nothing else does. */
export function requireHealthBearer(request: Request) {
  const token = process.env.HEALTH_TOKEN
  if (token && bearerMatches(request, token)) return null
  return requireBearer(request, "CRON_SECRET")
}

function bearerMatches(request: Request, secret: string) {
  const actual = Buffer.from(request.headers.get("authorization") ?? "")
  const wanted = Buffer.from(`Bearer ${secret}`)
  return actual.length === wanted.length && timingSafeEqual(actual, wanted)
}

export function requireBearer(request: Request, secretName: "INGEST_SECRET" | "CRON_SECRET") {
  const secret = process.env[secretName]
  if (!secret) {
    return Response.json({ error: `${secretName} is not configured` }, { status: 500 })
  }
  const header = request.headers.get("authorization") ?? ""
  const expected = `Bearer ${secret}`
  const actual = Buffer.from(header)
  const wanted = Buffer.from(expected)
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  return null
}

export function normalizeUsername(input: string) {
  const username = input.trim().replace(/^@/, "").toLowerCase()
  if (!/^[a-z0-9_]{1,15}$/.test(username)) return null
  return username
}

export function laterSnowflake(current: string | null, next: string) {
  if (!current) return next
  try {
    return BigInt(next) > BigInt(current) ? next : current
  } catch {
    return next > current ? next : current
  }
}

export function parseTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

export function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value))
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Math.max(0, Math.round(Number(value)))
  }
  return 0
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
