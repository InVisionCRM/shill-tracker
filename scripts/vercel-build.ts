import { spawnSync } from "node:child_process"
import { loadLocalEnv } from "../src/lib/env"

loadLocalEnv()

const check = spawnSync("pnpm", ["exec", "tsx", "scripts/check-migrations.ts"], { stdio: "inherit", env: process.env })
if (check.status !== 0) process.exit(check.status ?? 1)

const migrateUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
const onVercel = process.env.VERCEL === "1"

if (!migrateUrl) {
  if (onVercel) {
    console.error("vercel-build: set DATABASE_URL_UNPOOLED or DATABASE_URL before deploy")
    process.exit(1)
  }
  console.log("vercel-build: no database URL, skipping migrations")
} else {
  const result = spawnSync("pnpm", ["exec", "drizzle-kit", "migrate"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: migrateUrl },
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const build = spawnSync("pnpm", ["exec", "next", "build"], {
  stdio: "inherit",
  env: process.env,
})
process.exit(build.status ?? 1)
