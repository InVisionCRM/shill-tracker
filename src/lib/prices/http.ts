const lastCall = new Map<string, number>()

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchJson<T>(
  url: string,
  init?: {
    headers?: Record<string, string>
    minIntervalMs?: number
    timeoutMs?: number
  },
): Promise<T> {
  const host = new URL(url).host
  const minInterval = init?.minIntervalMs ?? 0
  const wait = (lastCall.get(host) ?? 0) + minInterval - Date.now()
  if (wait > 0) await sleep(wait)
  lastCall.set(host, Date.now())

  let lastError: Error | null = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), init?.timeoutMs ?? 12_000)
    try {
      const response = await fetch(url, {
        headers: {
          accept: "application/json",
          "user-agent": "shill-tracker/1.0",
          ...init?.headers,
        },
        cache: "no-store",
        signal: controller.signal,
      })
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get("retry-after"))
        const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 700 * (attempt + 1)
        lastError = new Error(`${response.status} from ${host}`)
        await sleep(Math.min(delay, 6_000))
        continue
      }
      if (!response.ok) {
        const body = await response.text().catch(() => "")
        const error = new Error(`${response.status} ${host} ${body.slice(0, 160)}`)
        // 4xx other than 429 will not clear on retry (geo blocks, missing symbols).
        if (response.status >= 400 && response.status < 500) {
          ;(error as Error & { permanent?: boolean }).permanent = true
        }
        throw error
      }
      return (await response.json()) as T
    } catch (error) {
      if (error instanceof Error && (error as Error & { permanent?: boolean }).permanent) throw error
      if (error instanceof Error && !error.message.startsWith("429") && !`${error}`.includes("abort")) {
        if (attempt === 2) throw error
        lastError = error
      } else {
        lastError = error instanceof Error ? error : new Error(String(error))
      }
      await sleep(400 * (attempt + 1))
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError ?? new Error(`failed ${url}`)
}

export function coingeckoConfig() {
  const key = process.env.COINGECKO_API_KEY
  const tier = (process.env.COINGECKO_API_TIER ?? "").toLowerCase()
  if (key && tier === "pro") {
    return {
      base: "https://pro-api.coingecko.com/api/v3",
      headers: { "x-cg-pro-api-key": key },
      minIntervalMs: 400,
    }
  }
  if (key) {
    return {
      base: "https://api.coingecko.com/api/v3",
      headers: { "x-cg-demo-api-key": key },
      minIntervalMs: 1200,
    }
  }
  return {
    base: "https://api.coingecko.com/api/v3",
    headers: {} as Record<string, string>,
    minIntervalMs: 1600,
  }
}
