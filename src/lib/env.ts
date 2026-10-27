import { existsSync, readFileSync } from "node:fs"

function loadFile(path: string) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] == null || process.env[key] === "") {
      process.env[key] = value
    }
  }
}

/** Scripts and drizzle-kit don't load `.env.local` the way Next.js does. */
export function loadLocalEnv() {
  loadFile(".env")
  loadFile(".env.local")
}
