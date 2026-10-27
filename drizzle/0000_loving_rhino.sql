CREATE TABLE "api_cache" (
	"cache_key" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cron_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "influencer_stats" (
	"influencer_id" uuid PRIMARY KEY NOT NULL,
	"shill_count" integer DEFAULT 0 NOT NULL,
	"post_count" integer DEFAULT 0 NOT NULL,
	"unique_tickers" integer DEFAULT 0 NOT NULL,
	"priced_count" integer DEFAULT 0 NOT NULL,
	"win_rate_1h" double precision,
	"win_rate_24h" double precision,
	"win_rate_7d" double precision,
	"win_rate_30d" double precision,
	"win_rate_now" double precision,
	"avg_roi_1h" double precision,
	"avg_roi_24h" double precision,
	"avg_roi_7d" double precision,
	"avg_roi_30d" double precision,
	"avg_roi_now" double precision,
	"median_roi_1h" double precision,
	"median_roi_24h" double precision,
	"median_roi_7d" double precision,
	"median_roi_30d" double precision,
	"median_roi_now" double precision,
	"portfolio_1h" double precision,
	"portfolio_24h" double precision,
	"portfolio_7d" double precision,
	"portfolio_30d" double precision,
	"portfolio_now" double precision,
	"portfolio_n_1h" integer DEFAULT 0 NOT NULL,
	"portfolio_n_24h" integer DEFAULT 0 NOT NULL,
	"portfolio_n_7d" integer DEFAULT 0 NOT NULL,
	"portfolio_n_30d" integer DEFAULT 0 NOT NULL,
	"portfolio_n_now" integer DEFAULT 0 NOT NULL,
	"best_mention_id" uuid,
	"worst_mention_id" uuid,
	"repeat_assets" integer DEFAULT 0 NOT NULL,
	"pump_dump_count" integer DEFAULT 0 NOT NULL,
	"pump_dump_rate" double precision,
	"avg_pump_score" double precision,
	"dump_risk_score" double precision,
	"credibility_score" double precision,
	"credibility_horizon" text,
	"sample_size" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "influencers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"x_user_id" text,
	"username" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"profile_image_url" text,
	"followers_count" integer DEFAULT 0 NOT NULL,
	"following_count" integer DEFAULT 0 NOT NULL,
	"tweet_count" integer DEFAULT 0 NOT NULL,
	"listed_count" integer DEFAULT 0 NOT NULL,
	"tracked" boolean DEFAULT true NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"latest_post_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "influencers_x_user_id_unique" UNIQUE("x_user_id"),
	CONSTRAINT "influencers_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" text NOT NULL,
	"influencer_id" uuid NOT NULL,
	"match_key" text NOT NULL,
	"raw_text" text NOT NULL,
	"match_type" text NOT NULL,
	"symbol" text,
	"asset_name" text,
	"asset_key" text,
	"coingecko_id" text,
	"chain" text,
	"contract_address" text,
	"pair_address" text,
	"dexscreener_url" text,
	"binance_symbol" text,
	"geckoterminal_network" text,
	"confidence" text DEFAULT 'low' NOT NULL,
	"confidence_reason" text,
	"resolution_status" text DEFAULT 'pending' NOT NULL,
	"price_source" text,
	"price_at" double precision,
	"price_1h" double precision,
	"price_24h" double precision,
	"price_7d" double precision,
	"price_30d" double precision,
	"price_now" double precision,
	"price_24h_before" double precision,
	"price_7d_before" double precision,
	"roi_1h" double precision,
	"roi_24h" double precision,
	"roi_7d" double precision,
	"roi_30d" double precision,
	"roi_now" double precision,
	"max_gain" double precision,
	"max_drawdown" double precision,
	"max_price_after" double precision,
	"min_price_after" double precision,
	"volume_before_24h" double precision,
	"volume_after_24h" double precision,
	"runup_24h" double precision,
	"runup_7d" double precision,
	"pump_dump_score" double precision,
	"pump_dump_flag" boolean DEFAULT false NOT NULL,
	"pump_dump_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"series" jsonb,
	"price_status" text DEFAULT 'pending' NOT NULL,
	"price_error" text,
	"price_attempts" integer DEFAULT 0 NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"priced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"influencer_id" uuid NOT NULL,
	"text" text NOT NULL,
	"text_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"retweet_count" integer DEFAULT 0 NOT NULL,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"quote_count" integer DEFAULT 0 NOT NULL,
	"bookmark_count" integer DEFAULT 0 NOT NULL,
	"impression_count" integer DEFAULT 0 NOT NULL,
	"url" text NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"asset_key" text PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"name" text,
	"price" double precision NOT NULL,
	"change_24h" double precision,
	"source" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "influencer_stats" ADD CONSTRAINT "influencer_stats_influencer_id_influencers_id_fk" FOREIGN KEY ("influencer_id") REFERENCES "public"."influencers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "influencer_stats" ADD CONSTRAINT "influencer_stats_best_mention_id_mentions_id_fk" FOREIGN KEY ("best_mention_id") REFERENCES "public"."mentions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "influencer_stats" ADD CONSTRAINT "influencer_stats_worst_mention_id_mentions_id_fk" FOREIGN KEY ("worst_mention_id") REFERENCES "public"."mentions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_influencer_id_influencers_id_fk" FOREIGN KEY ("influencer_id") REFERENCES "public"."influencers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_influencer_id_influencers_id_fk" FOREIGN KEY ("influencer_id") REFERENCES "public"."influencers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "influencers_tracked_idx" ON "influencers" USING btree ("tracked");--> statement-breakpoint
CREATE UNIQUE INDEX "mentions_post_match_idx" ON "mentions" USING btree ("post_id","match_key");--> statement-breakpoint
CREATE INDEX "mentions_influencer_idx" ON "mentions" USING btree ("influencer_id");--> statement-breakpoint
CREATE INDEX "mentions_symbol_idx" ON "mentions" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "mentions_asset_key_idx" ON "mentions" USING btree ("asset_key");--> statement-breakpoint
CREATE INDEX "mentions_price_status_idx" ON "mentions" USING btree ("price_status");--> statement-breakpoint
CREATE INDEX "mentions_created_idx" ON "mentions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "posts_influencer_created_idx" ON "posts" USING btree ("influencer_id","created_at");