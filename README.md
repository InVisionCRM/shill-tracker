# Shill Tracker

Archive every post from the X accounts you track, detect crypto mentions, and score what the price did before and after the post.

Demo voices in the UI are fictional. Their charts are labeled **SEED** and are not overwritten by the price job. Real posts that arrive through the ingest API are priced from Binance, CoinGecko, and GeckoTerminal.

## Run locally

Requires Node 22+ and Postgres (Neon in production, any Postgres locally).

```bash
cp .env.example .env.local
# set DATABASE_URL, INGEST_SECRET, and CRON_SECRET

pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The app serves at [http://127.0.0.1:4317](http://127.0.0.1:4317).

Other commands:

| Command | What it does |
| --- | --- |
| `pnpm test` | Ticker extraction and scoring tests |
| `pnpm verify:prices` | Live BTC/ETH/PEPE lookups against public APIs |
| `pnpm smoke` | Hits a running server: add a voice, ingest a post twice, run the price cron |
| `pnpm db:generate` | Regenerate SQL after a schema change |

Migrations live in `drizzle/`. Apply them with:

```bash
npm run db:migrate
```

That command reads `DATABASE_URL_UNPOOLED` when it is set, and otherwise `DATABASE_URL`. The running app only needs `DATABASE_URL`, `INGEST_SECRET`, and `CRON_SECRET`. On Neon, put the direct URL (hostname without `-pooler`) in `DATABASE_URL_UNPOOLED` and the pooled URL in `DATABASE_URL`. A Vercel deploy runs the same migration from `vercel-build` before `next build`. `pnpm db:migrate` is the same script.

## PulseChain directory

Symbol ranking, logos, PulseX pair addresses, and the dead-token flag for PulseChain come from a local copy of Kyle's `screener_pairs` table. The app never opens that database. Copy it when you have the read-only URL:

```bash
SOURCE_DATABASE_URL="postgres://…" npm run import:pulsechain
```

The script only runs `SELECT` against `SOURCE_DATABASE_URL` and upserts into `DATABASE_URL` (or `DATABASE_URL_UNPOOLED` when that is set). It refuses to run if the two URLs point at the same database. Re-run it to refresh. Pairs that do not yet have a base token are skipped until a later copy fills them in. Curated overrides such as `$PDAI`, `$BEAR`, and `$HEX` still win over the directory.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string. Use the Neon **pooled** URL for the Vercel app. |
| `DATABASE_URL_UNPOOLED` | no | Direct Neon URL (no `-pooler`). `vercel-build` migrates with this when it is set, and otherwise uses `DATABASE_URL`. |
| `INGEST_SECRET` | yes | Bearer token for the ingest and influencer APIs. |
| `CRON_SECRET` | yes | Bearer token for `/api/cron/prices` and `/api/cron/scores`. On Vercel, defining this makes Cron send `Authorization: Bearer $CRON_SECRET`. |
| `COINGECKO_API_KEY` | no | Demo or pro key. Public CoinGecko works without one and is rate limited harder. |
| `COINGECKO_API_TIER` | no | `demo` (default when a key is set) or `pro`. |
| `SEED_DEMO` | no | Set to `true` only when you want `pnpm db:seed` to load fictional voices. Production must leave it unset. |

Do not commit `.env.local`.

## Ingest contract

The app does not call the X API. Your bot reads X and posts here.

All three influencer routes and the ingest route expect:

```
Authorization: Bearer $INGEST_SECRET
Content-Type: application/json
```

### `GET /api/influencers`

Tracked handles for the bot. Demo voices are omitted.

```json
{
  "influencers": [
    {
      "id": "uuid",
      "x_user_id": "123",
      "username": "some_voice",
      "name": "Some Voice",
      "profile_image_url": "https://…",
      "followers_count": 1200,
      "tracked": true,
      "is_demo": false,
      "latest_post_id": "1890000000000000000"
    }
  ]
}
```

`latest_post_id` is the newest stored post id (a Twitter snowflake). Poll with `since_id` set to that value. It is `null` until the first ingest.

### `POST /api/influencers`

```json
{ "username": "some_voice", "name": "Optional", "x_user_id": "optional" }
```

`201` when created, `200` when the handle already existed and was marked tracked again.

### `DELETE /api/influencers`

```json
{ "username": "some_voice" }
```

Sets `tracked` to false. Posts stay in the archive. The handle disappears from `GET /api/influencers`.

### `POST /api/ingest/posts`

Idempotent upsert by post id. Sending the same post again updates metrics and does not duplicate mentions. Mentions are rebuilt only when the text changes.

```json
{
  "user": {
    "id": "123",
    "username": "some_voice",
    "name": "Some Voice",
    "profile_image_url": "https://…",
    "public_metrics": {
      "followers_count": 1200,
      "following_count": 10,
      "tweet_count": 40,
      "listed_count": 1
    }
  },
  "posts": [
    {
      "id": "1890000000000000001",
      "text": "Adding $ETH. Pepe contract 0x6982508145454Ce325dDbE47a25d4ec3d2311933",
      "created_at": "2026-10-27T12:00:00.000Z",
      "public_metrics": {
        "retweet_count": 3,
        "reply_count": 1,
        "like_count": 12,
        "quote_count": 0,
        "bookmark_count": 1,
        "impression_count": 900
      }
    }
  ]
}
```

`created_at` accepts ISO 8601 or the legacy X date string (`Wed Oct 10 20:19:24 +0000 2018`). Post ids are numeric strings. Up to 100 posts per request.

The user is matched by `user.id`, then by username. The first ingest can attach an X id to a handle you added with `POST /api/influencers`.

Response:

```json
{
  "user": { "id": "uuid", "x_user_id": "123", "username": "some_voice", "name": "Some Voice", "created": false },
  "posts_upserted": 1,
  "posts_unchanged": 0,
  "mentions_created": 2,
  "mention_ids": ["uuid"],
  "pricing": { "ok": true, "resolved": 1, "priced": 1, "failed": 0, "quotes": 3 }
}
```

`pricing` is a best-effort pass (a few mentions) so new calls pick up a price in the same request. Failures stay `pending` for the cron. A second identical POST returns `mentions_created: 0` and `posts_unchanged: 1`.

For a bulk backfill, add `?defer_pricing=1`. That skips the inline price job and skips recomputing voice scores, so a batch of 100 posts returns as soon as the rows are written. Drain prices afterward with the cron.

Canonical tickers (`$BTC`, `$ETH`, bitcoin, ethereum, …) resolve immediately. Other symbols are resolved on the price job via CoinGecko market cap or DexScreener liquidity. An `0x` contract keeps a `chain:0x` prefix when the post has one. Chain hints in the post (`#Pulsechain`, “on base”, explorer and DEX links) and a curated PulseChain map are applied before the liquidity fallback. PulseChain is still preferred when nothing in the post names a chain, unless that pool is dust next to a deeper market. $PDAI is PulseChain DAI, $BEAR in a PulseChain post is TEDDY BEAR, and HEX before 13 May 2023 is Ethereum. Only `call` mentions count toward ROI. Retro brags, commentary, jokes, and warnings are stored and shown, not scored. Prices older than the free GeckoTerminal or CoinGecko windows are read from PulseX reserves when the asset is on PulseChain. If that cannot be done, the status is `unverifiable` and the return is not estimated. A token with no liquidity is `dead`; a dead call with an entry is −100%, and one without an entry is unverifiable. Ambiguous symbols are flagged low confidence. A mixed-case `0x` address is not also scanned as a Solana mint: base58 slices that sit inside the hex span are ignored.

PulseChain-focused accounts (preset: `@iambroots`, or any voice stored with `chain_bias = pulsechain`) resolve `$HEX`, `$PLS`, `$PLSX`, `$INC`, and `$PDAI` to PulseChain pools. Plain words `hex`, `pulsechain`, `pulsex`, `plsx`, `incentive`, and `pdai` count for that voice only. HEX also exists on Ethereum and shares the contract `0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39`; other accounts are priced from the Ethereum CoinGecko listing and the chain is shown in the UI. Pulse assets are not given a CoinGecko id, so they are not priced as the Ethereum token. PLS is the WPLS pool, not the thin “PulseChain” token. PDAI is Good DAI, not Ethereum DAI.

## Adding an influencer

Another bot can register a voice and backfill every stored post with one command. The file uses the same `{ user, posts }` shape as `POST /api/ingest/posts`. `INGEST_SECRET` comes from the environment (`.env.local` is loaded for local runs).

```bash
npm run import -- --file data/iambroots.json --url https://shill.example.com --defer-pricing
```

`pnpm run import --` runs the same script. Bare `pnpm import` is pnpm's lockfile importer and does not call this command.

What it does:

1. `POST /api/influencers` with `username`, `name`, and `x_user_id` from `user`. An existing handle is marked tracked again and the import continues.
2. `POST /api/ingest/posts` in batches of 100. `--defer-pricing` adds `?defer_pricing=1` so a large file does not price inside the request.
3. Retries each request up to 5 times on a network error, HTTP 429, or HTTP 5xx. Other 4xx responses stop the run.
4. Writes `data/iambroots.json.progress.json` after the voice is registered and after each successful batch. Run the same command again to continue from the next unsent post. The checkpoint is removed when the file finishes. `--reset` discards it. A checkpoint for a different file or URL is refused.

The last line of output is JSON:

```json
{
  "ok": true,
  "posts_upserted": 17800,
  "posts_unchanged": 0,
  "mentions_created": 26084,
  "batches": 178,
  "posts_total": 17800,
  "resumed_from": 0
}
```

`posts_upserted` counts posts whose text was new or changed. `posts_unchanged` counts ids that were already stored with the same text. `mentions_created` counts new ticker rows. Re-running a finished file is safe: ingest is idempotent, and the second pass reports those posts as unchanged.

## Cron

```
GET or POST /api/cron/prices?limit=4
GET or POST /api/cron/scores
Authorization: Bearer $CRON_SECRET
```

`/api/cron/prices` resolves a few pending assets, fills a candle-day cache, prices every fully covered call in the batch, refreshes current marks, and recomputes scores for voices that just got prices. The queue prices each voice's first mention of an asset before any repeat. With no `limit` query it works through up to 400 calls. An explicit `?limit=4` still means 4. Each run fetches at most two assets and at most about 40 missing days per asset, and stops around 35 seconds so a 60 second function can finish.

`/api/cron/scores` only recomputes aggregates. List queries omit the candle series so a voice with tens of thousands of mentions does not load that JSON.

`vercel.json` schedules both jobs once a day (06:00 and 06:30 UTC), which is what Vercel Hobby allows. That daily cron is the fallback. Between those runs, GitHub Actions hits the same routes on the budget below. The home tape shows `Pricing first calls X / Y` until those entry prices exist, then `Pricing repeats X / Y`. Repeats are priced only after every first call has an entry, or has been marked unavailable.

Repeated tickers reuse `candle_days`. A day that was fetched and had no prints is stored empty so it is not requested again. GeckoTerminal returns at most 1000 hourly candles per call, so a multi-year HEX history continues across runs.

Pinned demo mentions are skipped. A real ingest is not pinned.

## Scoring

The in-app method page (`/methodology`) is the formula, and it renders the same constants the scorer uses. Short version:

- Entry is the last candle at or before the post. A gap over 36 hours is treated as missing.
- Returns are recorded at +1h, +24h, +7d, +30d, and at the current mark.
- Max gain and max drawdown use candles after the post until 30 days later or now.
- Pump-then-dump score compares the run-up in the 24h and 7d **before** the post with the return **after**, plus a volume check. A flag means the chart had already run and then gave it back. It is not a claim about intent.
- Credibility prefers the 7 day print once three calls have settled, then 24h, then 1h. Small samples are shrunk toward uncertain.
- Dump risk is the flag rate, the average pump score, and how negative the median return is, shrunk toward a prior so a handful of calls cannot read as 100.
- The headline unit is a voice's first mention of each asset. ROI, win rate, the $100 book, pump-then-dump totals, and leaderboard rank use those first calls. A toggle includes every mention. Shill count and repeat-shill counts always use the full archive. Every mention is still stored, and each one keeps its own pump score.
- The $100 book stakes $100 at the entry candle and holds for the horizon you pick. On first calls, naming the same ticker again is not a second stake. Two tickers in one post are two stakes. No fees.

## Limits

- **CoinGecko public API** is roughly 5–15 calls per minute. The app waits about 1.6s between calls, retries 429s, and caches search and market-cap lookups. A demo key (`COINGECKO_API_KEY`) raises that. Very old ranges may come back as daily candles; the 36 hour gap rule still accepts them, so the “price at post” is the nearest daily close, not a trade print.
- **Binance** hourly klines cover listed USDT pairs for years. Requests go to `data-api.binance.vision` first, then `api.binance.com`. The latter returns HTTP 451 from some regions; either failure falls through to CoinGecko. The app does not guess a USDT pair for low-confidence tickers.
- **DexScreener** is used to pick the most liquid pair (about 300 requests/minute on their public API). It does not provide the historical path.
- **GeckoTerminal** hourly pool OHLCV is about 30 requests/minute here (the client waits 1.3s). History starts when the pool exists. A brand new mint has no pre-call window, so the pump score stays blank. Each request returns up to 1000 hourly candles (~41 days). The price cron stores those by UTC day and continues the next gap on the next call, so a years-long book is not fetched in one Hobby invocation.
- **Contracts with no pair**, dead addresses, and symbols CoinGecko and DexScreener both miss are stored as unresolved and are not given a fake price.
- **Ambiguous tickers** (many tokens sharing `$OMNI`, `$AI`, …) take the largest market cap or the most liquid pair and are badged when the lead is thin. That pick can still be the wrong asset.
- **Stablecoins and wrapped assets** can match a canonical symbol and show a flat return. That is a boring call, not a data bug.
- **Max excursion stops at 30 days** so a mark a year later does not rewrite the historical gain.
- The UI is open. Ingest and cron are the authenticated edges. Put the deployment behind a network control if the leaderboard should not be public.
- Demo seed prices are illustrative. `pnpm db:seed` does nothing unless `SEED_DEMO=true`. With the flag it deletes rows with `is_demo = true` and leaves real ingests alone.

## Deploy

Deploy the Next.js app on Vercel with the env vars above. The public URL is the free `*.vercel.app` host. Set `DATABASE_URL` to the Neon **pooled** URL and `DATABASE_URL_UNPOOLED` to the direct URL. The `vercel-build` script migrates with the unpooled URL (or `DATABASE_URL` if that is all you have) and then runs `next build`. It never seeds. Leave `SEED_DEMO` unset in production. The app prices from public Binance, CoinGecko, DexScreener, GeckoTerminal, and PulseChain RPC endpoints. `COINGECKO_API_KEY` is optional. Cron in `vercel.json` is daily, and GitHub Actions drains the queue between those runs.

## GitHub Actions minutes

A private repository includes 2,000 GitHub Actions minutes a month. `ubuntu-latest` bills at 1×, and every job costs at least 1 minute even when the steps finish in a few seconds. A job that runs 70 seconds costs 2 minutes. The cap below assumes each cron tick stays under 60 seconds and therefore bills as 1.

`.github/workflows/cron.yml` is one workflow and one job. The schedule is `*/30 * * * *`: 48 runs a day, about 1,440 runs in a 30-day month (1,488 in a 31-day month). There is no matrix and no second job. The runner is `ubuntu-latest` with `timeout-minutes: 2`. The job does not check out the repo, does not set up Node, and does not use a cache. It only runs `curl`. Concurrency group `cron-tick` with `cancel-in-progress: false` queues the next tick instead of starting a second one.

Each run calls `POST /api/cron/prices` (curl gives up after 40 seconds). It calls `POST /api/cron/scores` only on the hourly slot, when the job starts in an even 30-minute bucket of the Unix epoch, which is :00–:29 UTC, and also on a manual `workflow_dispatch`. The scores request gives up after 15 seconds. Those two caps keep a healthy tick under one billed minute. At that rate the schedule spends about 1,440 minutes and leaves about 560 for everything else. The daily Vercel cron is what finishes a tick that Actions cuts off.

Repository secrets for that workflow only: `APP_URL` (the `*.vercel.app` origin, no path) and `CRON_SECRET` (the same value as the app). The app does not read `APP_URL`.

`.github/workflows/ci.yml` is the other consumer of those leftover minutes. It runs on pull requests and on pushes to `main`, and it skips a run whose changes are only markdown or files under `docs/`. One job, no matrix, `timeout-minutes: 5`. It caches the pnpm store (`actions/setup-node` with `cache: pnpm`, because this repo commits `pnpm-lock.yaml` and the npm cache looks for `package-lock.json`), then runs lint, `tsc --noEmit`, and unit tests. It does not run `next build`. Vercel already builds previews. A cached run should bill 1–2 minutes; the 5-minute timeout is the worst case for a single run.
