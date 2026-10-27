import { defineConfig } from "drizzle-kit"
import { loadLocalEnv } from "./src/lib/env"

loadLocalEnv()

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/shilltracker",
  },
})
