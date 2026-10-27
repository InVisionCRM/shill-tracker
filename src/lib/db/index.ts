import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

const globalForDb = globalThis as unknown as { pool?: Pool }

export function getPool() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error("DATABASE_URL is not set")
  }
  if (!globalForDb.pool) {
    globalForDb.pool = new Pool({ connectionString: url, max: 5 })
  }
  return globalForDb.pool
}

export function getDb() {
  return drizzle(getPool(), { schema })
}

export { schema }
