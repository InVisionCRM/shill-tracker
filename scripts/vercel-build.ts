import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
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
  if (result.status !== 0) {
    // The database can be unreachable at build time (for example the free Neon compute quota is
    // used up and the compute is suspended). Only ship anyway when no migration is pending: the
    // newest journal entry must be one already applied in production.
    if (!latestMigrationAlreadyApplied()) process.exit(result.status ?? 1)
    console.warn(
      "vercel-build: drizzle-kit migrate failed, but no migration is pending (newest is already applied in production). Building anyway.",
    )
  }
}

const build = spawnSync("pnpm", ["exec", "next", "build"], {
  stdio: "inherit",
  env: process.env,
})
process.exit(build.status ?? 1)

function latestMigrationAlreadyApplied() {
  try {
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string }[] }
    const newest = journal.entries.at(-1)?.tag
    const applied = readFileSync("drizzle/applied-in-production.txt", "utf8").trim()
    return Boolean(newest) && newest === applied
  } catch {
    return false
  }
}
