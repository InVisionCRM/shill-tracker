ALTER TABLE "mentions" ADD COLUMN "resolution_confidence" text;
ALTER TABLE "mentions" ADD COLUMN "call_kind" text DEFAULT 'call' NOT NULL;
ALTER TABLE "mentions" ADD COLUMN "asset_state" text;
