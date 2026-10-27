import { defineConfig } from "drizzle-kit"
import { loadLocalEnv } from "./src/lib/env"
import { normalizeSslMode } from "./src/lib/db/url"

loadLocalEnv()

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: normalizeSslMode(
      process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "postgres://localhost:5432/shilltracker",
    ),
  },
})
