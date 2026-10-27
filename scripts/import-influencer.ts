import { createHash } from "node:crypto"
import { readFile, rename, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { loadLocalEnv } from "../src/lib/env"

const BATCH_SIZE = 100
const MAX_ATTEMPTS = 5

export type ImportArgs = {
  file: string
  url: string
  deferPricing: boolean
  reset: boolean
}

export type ImportSummary = {
  ok: true
  file: string
  url: string
  registered: boolean
  created: boolean
  batches: number
  posts_upserted: number
  posts_unchanged: number
  mentions_created: number
  posts_total: number
  resumed_from: number
}

type Progress = {
  fingerprint: string
  url: string
  nextIndex: number
  registered: boolean
  created: boolean
  batches: number
  postsUpserted: number
  postsUnchanged: number
  mentionsCreated: number
  updatedAt: string
}

type IngestFile = {
  user: {
    id?: string
    username?: string
    name?: string
  }
  posts: unknown[]
}

export function parseImportArgs(argv: string[]): ImportArgs {
  const args: ImportArgs = { file: "", url: "", deferPricing: false, reset: false }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === "--") continue
    if (token === "--defer-pricing") {
      args.deferPricing = true
      continue
    }
    if (token === "--reset") {
      args.reset = true
      continue
    }
    const [flag, inline] = splitFlag(token)
    const value = inline ?? argv[index + 1]
    if (flag === "--file" || flag === "--url") {
      if (!value || value.startsWith("--")) throw new Error(`${flag} needs a value`)
      if (inline == null) index += 1
      if (flag === "--file") args.file = value
      else args.url = value
      continue
    }
    throw new Error(`Unknown argument ${token}`)
  }
  if (!args.file) throw new Error("--file is required")
  if (!args.url) throw new Error("--url is required")
  return args
}

export function progressPathFor(file: string) {
  return `${file}.progress.json`
}

export function chunkPosts<T>(posts: T[], size = BATCH_SIZE) {
  const chunks: T[][] = []
  for (let index = 0; index < posts.length; index += size) {
    chunks.push(posts.slice(index, index + size))
  }
  return chunks
}

export async function importInfluencer(options: {
  file: string
  url: string
  secret: string
  deferPricing?: boolean
  reset?: boolean
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  progressFile?: string
}): Promise<ImportSummary> {
  const fetchImpl = options.fetchImpl ?? fetch
  const sleep = options.sleep ?? delay
  const base = options.url.replace(/\/+$/, "")
  const progressFile = options.progressFile ?? progressPathFor(options.file)
  const raw = await readFile(options.file, "utf8")
  const payload = JSON.parse(raw) as IngestFile
  if (!payload || typeof payload !== "object" || !payload.user || !Array.isArray(payload.posts)) {
    throw new Error("File must be JSON with { user, posts }")
  }
  const username = typeof payload.user.username === "string" ? payload.user.username : ""
  if (!username.trim()) throw new Error("user.username is required")

  const fingerprint = createHash("sha256").update(raw).digest("hex")
  let progress = options.reset ? null : await readProgress(progressFile)
  if (progress && (progress.fingerprint !== fingerprint || progress.url !== base)) {
    throw new Error(
      `Progress file ${progressFile} belongs to a different file or URL. Re-run with --reset to start over.`,
    )
  }
  if (!progress) {
    progress = {
      fingerprint,
      url: base,
      nextIndex: 0,
      registered: false,
      created: false,
      batches: 0,
      postsUpserted: 0,
      postsUnchanged: 0,
      mentionsCreated: 0,
      updatedAt: new Date().toISOString(),
    }
  }
  const resumedFrom = progress.nextIndex

  if (!progress.registered) {
    const registered = await postJson(
      `${base}/api/influencers`,
      options.secret,
      {
        username,
        name: typeof payload.user.name === "string" ? payload.user.name : undefined,
        x_user_id: typeof payload.user.id === "string" ? payload.user.id : undefined,
      },
      fetchImpl,
      sleep,
    )
    progress.registered = true
    progress.created = Boolean(registered.created)
    await writeProgress(progressFile, progress)
  }

  const remaining = payload.posts.slice(progress.nextIndex)
  for (const batch of chunkPosts(remaining)) {
    const body = await postJson(
      `${base}/api/ingest/posts${options.deferPricing ? "?defer_pricing=1" : ""}`,
      options.secret,
      { user: payload.user, posts: batch },
      fetchImpl,
      sleep,
    )
    progress.nextIndex += batch.length
    progress.batches += 1
    progress.postsUpserted += numberField(body.posts_upserted)
    progress.postsUnchanged += numberField(body.posts_unchanged)
    progress.mentionsCreated += numberField(body.mentions_created)
    await writeProgress(progressFile, progress)
  }

  await unlink(progressFile).catch(() => undefined)
  return {
    ok: true,
    file: options.file,
    url: base,
    registered: true,
    created: progress.created,
    batches: progress.batches,
    posts_upserted: progress.postsUpserted,
    posts_unchanged: progress.postsUnchanged,
    mentions_created: progress.mentionsCreated,
    posts_total: payload.posts.length,
    resumed_from: resumedFrom,
  }
}

async function postJson(
  url: string,
  secret: string,
  body: unknown,
  fetchImpl: typeof fetch,
  sleep: (ms: number) => Promise<void>,
) {
  let lastError = "request failed"
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })
      const text = await response.text()
      const parsed = parseBody(text)
      if (response.ok) return parsed
      lastError = `${response.status} ${stringField(parsed.error) || text || response.statusText}`
      if (response.status !== 429 && response.status < 500) {
        throw new Error(lastError)
      }
      if (attempt === MAX_ATTEMPTS) break
      await sleep(retryDelay(attempt, response.headers.get("retry-after")))
    } catch (error) {
      if (error instanceof Error && /^\d{3} /.test(error.message) && !error.message.startsWith("429")) {
        throw error
      }
      lastError = error instanceof Error ? error.message : String(error)
      if (attempt === MAX_ATTEMPTS) break
      await sleep(retryDelay(attempt, null))
    }
  }
  throw new Error(`Gave up after ${MAX_ATTEMPTS} attempts: ${lastError}`)
}

function retryDelay(attempt: number, retryAfter: string | null) {
  const parsed = retryAfter ? Number(retryAfter) : NaN
  if (Number.isFinite(parsed) && parsed >= 0) return Math.min(parsed * 1000, 30_000)
  return Math.min(1000 * 2 ** (attempt - 1), 30_000)
}

function parseBody(text: string): Record<string, unknown> {
  if (!text) return {}
  try {
    const value = JSON.parse(text) as unknown
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  } catch {
    return { error: text }
  }
}

function numberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function stringField(value: unknown) {
  return typeof value === "string" ? value : ""
}

function splitFlag(token: string): [string, string | null] {
  const eq = token.indexOf("=")
  if (!token.startsWith("--") || eq === -1) return [token, null]
  return [token.slice(0, eq), token.slice(eq + 1)]
}

async function readProgress(file: string): Promise<Progress | null> {
  try {
    const raw = await readFile(file, "utf8")
    return JSON.parse(raw) as Progress
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

async function writeProgress(file: string, progress: Progress) {
  progress.updatedAt = new Date().toISOString()
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, JSON.stringify(progress, null, 2))
  await rename(temporary, file)
}

function isNotFound(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT")
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), ms)
  })
}

async function main() {
  loadLocalEnv()
  const args = parseImportArgs(process.argv.slice(2))
  const secret = process.env.INGEST_SECRET
  if (!secret) throw new Error("INGEST_SECRET is not set")
  const summary = await importInfluencer({
    file: path.resolve(args.file),
    url: args.url,
    secret,
    deferPricing: args.deferPricing,
    reset: args.reset,
  })
  console.log(
    `Import finished. posts upserted ${summary.posts_upserted}, mentions created ${summary.mentions_created}, unchanged ${summary.posts_unchanged}, batches ${summary.batches}.`,
  )
  console.log(JSON.stringify(summary))
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
if (invoked) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
