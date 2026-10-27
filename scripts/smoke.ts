const base = process.env.SMOKE_URL ?? "http://127.0.0.1:4317"
const ingest = process.env.INGEST_SECRET ?? "dev-ingest-secret"
const cron = process.env.CRON_SECRET ?? "dev-cron-secret"

async function main() {
  const username = "probe_bot"
  const created = await request("/api/influencers", {
    method: "POST",
    secret: ingest,
    body: { username, name: "Probe Bot" },
  })
  console.log("add influencer", created.status, JSON.stringify(created.json))

  const listed = await request("/api/influencers", { secret: ingest })
  const handles = (listed.json as { influencers: { username: string; is_demo: boolean; latest_post_id: string | null }[] }).influencers
  console.log(
    "bot list",
    handles.map((row) => `${row.username}:${row.latest_post_id ?? "none"}`).join(", "),
  )
  if (handles.some((row) => row.is_demo)) throw new Error("demo voices leaked into the bot list")
  if (!handles.some((row) => row.username === username)) throw new Error("probe bot missing from list")

  const postId = String(Date.now())
  const payload = {
    user: {
      id: "424242",
      username,
      name: "Probe Bot",
      profile_image_url: "https://example.com/probe.png",
      public_metrics: { followers_count: 1200, following_count: 10, tweet_count: 40, listed_count: 1 },
    },
    posts: [
      {
        id: postId,
        text: "Live probe: adding $ETH and the pepe contract 0x6982508145454Ce325dDbE47a25d4ec3d2311933 for the book.",
        created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        public_metrics: {
          retweet_count: 3,
          reply_count: 1,
          like_count: 12,
          quote_count: 0,
          bookmark_count: 1,
          impression_count: 900,
        },
      },
    ],
  }
  const first = await request("/api/ingest/posts", { method: "POST", secret: ingest, body: payload })
  console.log("ingest", first.status, JSON.stringify(first.json))
  if (first.status !== 200) throw new Error("ingest failed")
  const second = await request("/api/ingest/posts", { method: "POST", secret: ingest, body: payload })
  const secondBody = second.json as { mentions_created: number; posts_unchanged: number }
  console.log("reingest", second.status, JSON.stringify(second.json))
  if (secondBody.mentions_created !== 0 || secondBody.posts_unchanged !== 1) {
    throw new Error("ingest was not idempotent")
  }

  const unauth = await request("/api/ingest/posts", { method: "POST", body: payload })
  if (unauth.status !== 401) throw new Error(`expected 401, got ${unauth.status}`)

  const priced = await request("/api/cron/prices?limit=4", { secret: cron })
  console.log("cron", priced.status, JSON.stringify(priced.json))

  const page = await fetch(`${base}/influencers/${username}`)
  console.log("profile", page.status)
  if (!page.ok) throw new Error("profile page failed")
  console.log("smoke ok")
}

async function request(
  path: string,
  init: { method?: string; secret?: string; body?: unknown } = {},
) {
  const response = await fetch(`${base}${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(init.secret ? { authorization: `Bearer ${init.secret}` } : {}),
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await response.json().catch(() => ({}))
  return { status: response.status, json }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
