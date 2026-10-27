ALTER TABLE "influencers" ADD COLUMN IF NOT EXISTS "chain_bias" text;
--> statement-breakpoint
ALTER TABLE "influencers" ADD COLUMN IF NOT EXISTS "aliases" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "candle_days" (
  "asset_key" text NOT NULL,
  "day" text NOT NULL,
  "candles" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "source" text NOT NULL,
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "candle_days_asset_key_day_pk" PRIMARY KEY("asset_key","day")
);
