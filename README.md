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

Migrations live in `drizzle/`. `pnpm db:migrate` uses the direct `DATABASE_URL` from `.env.local` or `.env`. On Neon, point migrations at the **direct** connection string (hostname without `-pooler`) and the app at the **pooled** string.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string. Use the Neon **pooled** URL for the Vercel app. |
| `DATABASE_URL_UNPOOLED` | no | Documented for Neon migrations. This repo's migrate script reads `DATABASE_URL`, so set that to the direct URL when you migrate. |
| `INGEST_SECRET` | yes | Bearer token for the ingest and influencer APIs. |
| `CRON_SECRET` | yes | Bearer token for `/api/cron/prices` and `/api/cron/scores`. On Vercel, defining this makes Cron send `Authorization: Bearer $CRON_SECRET`. |
| `COINGECKO_API_KEY` | no | Demo or pro key. Public CoinGecko works without one and is rate limited harder. |
| `COINGECKO_API_TIER` | no | `demo` (default when a key is set) or `pro`. |

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

Canonical tickers (`$BTC`, `$ETH`, bitcoin, ethereum, …) resolve immediately. Other symbols and contract addresses are resolved on the price job via CoinGecko market cap or DexScreener liquidity. Ambiguous symbols are flagged low confidence. A mixed-case `0x` address is not also scanned as a Solana mint: base58 slices that sit inside the hex span are ignored.

## Cron

```
GET or POST /api/cron/prices?limit=4
GET or POST /api/cron/scores
Authorization: Bearer $CRON_SECRET
```

`/api/cron/prices` resolves pending assets, backfills hourly history, refreshes current marks, and recomputes voice scores. `limit` defaults to 4 so a Vercel function stays inside a short timeout. Run it often; each pass continues the queue.

`/api/cron/scores` only recomputes aggregates.

`vercel.json` schedules prices every 5 minutes and scores hourly at minute 15. Vercel Cron is UTC.

Pinned demo mentions are skipped. A real ingest is not pinned.

## Scoring

The in-app method page (`/methodology`) is the formula, and it renders the same constants the scorer uses. Short version:

- Entry is the last candle at or before the post. A gap over 36 hours is treated as missing.
- Returns are recorded at +1h, +24h, +7d, +30d, and at the current mark.
- Max gain and max drawdown use candles after the post until 30 days later or now.
- Pump-then-dump score compares the run-up in the 24h and 7d **before** the post with the return **after**, plus a volume check. A flag means the chart had already run and then gave it back. It is not a claim about intent.
- Credibility prefers the 7 day print once three calls have settled, then 24h, then 1h. Small samples are shrunk toward uncertain.
- Dump risk is the flag rate, the average pump score, and how negative the median return is, shrunk toward a prior so a handful of calls cannot read as 100.
- The $100 book stakes $100 in every call at the entry candle and holds for the horizon you pick. Two tickers in one post are two stakes. No fees.

## Limits

- **CoinGecko public API** is roughly 5–15 calls per minute. The app waits about 1.6s between calls, retries 429s, and caches search and market-cap lookups. A demo key (`COINGECKO_API_KEY`) raises that. Very old ranges may come back as daily candles; the 36 hour gap rule still accepts them, so the “price at post” is the nearest daily close, not a trade print.
- **Binance** hourly klines cover listed USDT pairs for years. Requests go to `data-api.binance.vision` first, then `api.binance.com`. The latter returns HTTP 451 from some regions; either failure falls through to CoinGecko. The app does not guess a USDT pair for low-confidence tickers.
- **DexScreener** is used to pick the most liquid pair (about 300 requests/minute on their public API). It does not provide the historical path.
- **GeckoTerminal** hourly pool OHLCV is about 30 requests/minute here (the client waits 1.3s). History starts when the pool exists. A brand new mint has no pre-call window, so the pump score stays blank. Each request returns up to 1000 hourly candles, which covers the 7 days before plus 30 days after.
- **Contracts with no pair**, dead addresses, and symbols CoinGecko and DexScreener both miss are stored as unresolved and are not given a fake price.
- **Ambiguous tickers** (many tokens sharing `$OMNI`, `$AI`, …) take the largest market cap or the most liquid pair and are badged when the lead is thin. That pick can still be the wrong asset.
- **Stablecoins and wrapped assets** can match a canonical symbol and show a flat return. That is a boring call, not a data bug.
- **Max excursion stops at 30 days** so a mark a year later does not rewrite the historical gain.
- The UI is open. Ingest and cron are the authenticated edges. Put the deployment behind a network control if the leaderboard should not be public.
- Demo seed prices are illustrative. Re-run `pnpm db:seed` to refresh their relative clocks. It deletes rows with `is_demo = true` and leaves real ingests alone.

## Deploy

Deploy the Next.js app on Vercel with the env vars above and a Neon pooled `DATABASE_URL`. Run `pnpm db:migrate` and, if you want the demo tape, `pnpm db:seed` against the direct connection string before or after the first deploy. Cron is already declared in `vercel.json`.
