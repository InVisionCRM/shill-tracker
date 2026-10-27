ALTER TABLE "mentions" ADD COLUMN IF NOT EXISTS "price_match" text;--> statement-breakpoint
ALTER TABLE "mentions" ADD COLUMN IF NOT EXISTS "price_at_ts" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mentions" ADD COLUMN IF NOT EXISTS "price_matches" jsonb;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mentions_price_match_idx" ON "mentions" USING btree ("price_match");
