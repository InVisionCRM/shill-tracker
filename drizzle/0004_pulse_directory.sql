CREATE TABLE "pulse_pairs" (
  "pair_address" text PRIMARY KEY NOT NULL,
  "factory" text,
  "amm" text,
  "created_block" bigint,
  "dex_id" text,
  "label" text,
  "base_address" text NOT NULL,
  "base_symbol" text,
  "base_name" text,
  "quote_address" text,
  "quote_symbol" text,
  "image_url" text,
  "price_usd" double precision,
  "market_cap" double precision,
  "fdv" double precision,
  "liquidity_usd" double precision,
  "pair_created_at" timestamp with time zone,
  "listed" boolean,
  "missing_since" timestamp with time zone,
  "source_updated_at" timestamp with time zone,
  "imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "pulse_pairs_base_idx" ON "pulse_pairs" USING btree ("base_address");
--> statement-breakpoint
CREATE INDEX "pulse_pairs_symbol_idx" ON "pulse_pairs" USING btree ("base_symbol");
--> statement-breakpoint
CREATE TABLE "pulse_tokens" (
  "address" text PRIMARY KEY NOT NULL,
  "symbol" text,
  "name" text,
  "image_url" text,
  "liquidity_usd" double precision DEFAULT 0 NOT NULL,
  "pair_count" integer DEFAULT 0 NOT NULL,
  "live_pair_count" integer DEFAULT 0 NOT NULL,
  "best_pair_address" text,
  "best_pair_created_block" bigint,
  "pulsex_pair_address" text,
  "pulsex_created_block" bigint,
  "missing_since" timestamp with time zone,
  "asset_state" text,
  "source_updated_at" timestamp with time zone,
  "imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "pulse_tokens_symbol_idx" ON "pulse_tokens" USING btree ("symbol");
--> statement-breakpoint
CREATE TABLE "pulse_directory" (
  "id" integer PRIMARY KEY NOT NULL,
  "imported_at" timestamp with time zone NOT NULL,
  "source_updated_at" timestamp with time zone,
  "pair_count" integer DEFAULT 0 NOT NULL,
  "token_count" integer DEFAULT 0 NOT NULL
);
