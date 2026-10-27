import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { chunkPosts, importInfluencer, parseImportArgs, progressPathFor } from "./import-influencer"

describe("parseImportArgs", () => {
  it("reads the file, url, and defer flag", () => {
    expect(parseImportArgs(["--file", "data/roots.json", "--url", "https://shill.example", "--defer-pricing"])).toEqual({
      file: "data/roots.json",
      url: "https://shill.example",
      deferPricing: true,
      reset: false,
    })
  })

  it("requires both paths", () => {
    expect(() => parseImportArgs(["--file", "data/roots.json"])).toThrow("--url is required")
  })
})

describe("chunkPosts", () => {
  it("splits a backfill into batches of 100", () => {
    const posts = Array.from({ length: 250 }, (_, index) => index)
    const chunks = chunkPosts(posts)
    expect(chunks.map((chunk) => chunk.length)).toEqual([100, 100, 50])
  })
})

describe("importInfluencer", () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it("registers once, retries a failed batch, and resumes after the last saved post", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "shill-import-"))
    dirs.push(dir)
    const file = path.join(dir, "voice.json")
    const posts = Array.from({ length: 120 }, (_, index) => ({
      id: String(1_000_000 + index),
      text: index % 2 === 0 ? "$ETH" : "no ticker",
      created_at: "2026-10-01T00:00:00.000Z",
    }))
    await writeFile(
      file,
      JSON.stringify({
        user: { id: "42", username: "roots", name: "Roots" },
        posts,
      }),
    )

    const progressFile = progressPathFor(file)
    const seen: string[] = []
    const failingFetch: typeof fetch = async (input, init) => {
      const url = String(input)
      seen.push(url)
      const headers = new Headers(init?.headers)
      expect(headers.get("Authorization")).toBe("Bearer test-secret")
      if (url.endsWith("/api/influencers")) return jsonResponse({ created: true }, 201)
      throw new Error("socket hang up")
    }

    await expect(
      importInfluencer({
        file,
        url: "https://shill.example/",
        secret: "test-secret",
        deferPricing: true,
        fetchImpl: failingFetch,
        sleep: async () => undefined,
        progressFile,
      }),
    ).rejects.toThrow(/Gave up after 5 attempts/)

    const saved = JSON.parse(await readFile(progressFile, "utf8")) as { nextIndex: number; registered: boolean }
    expect(saved.registered).toBe(true)
    expect(saved.nextIndex).toBe(0)
    expect(seen.filter((url) => url.endsWith("/api/influencers"))).toHaveLength(1)

    const batches: number[] = []
    const summary = await importInfluencer({
      file,
      url: "https://shill.example",
      secret: "test-secret",
      deferPricing: true,
      fetchImpl: async (input, init) => {
        const url = String(input)
        expect(url).toContain("defer_pricing=1")
        const body = JSON.parse(String(init?.body)) as { posts: unknown[] }
        batches.push(body.posts.length)
        return jsonResponse({
          posts_upserted: body.posts.length,
          posts_unchanged: 0,
          mentions_created: body.posts.length / 2,
        })
      },
      sleep: async () => undefined,
      progressFile,
    })

    expect(batches).toEqual([100, 20])
    expect(summary).toMatchObject({
      ok: true,
      created: true,
      batches: 2,
      posts_upserted: 120,
      mentions_created: 60,
      posts_total: 120,
      resumed_from: 0,
    })
    await expect(readFile(progressFile, "utf8")).rejects.toThrow()
  })
})

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
