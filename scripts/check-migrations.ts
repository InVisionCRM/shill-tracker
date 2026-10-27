import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

/**
 * drizzle-kit migrate only applies a migration whose journal `when` is newer than the last applied
 * one. A missing entry or an out-of-order `when` is skipped silently, so the schema ships without
 * its columns. Fail fast instead.
 */
const dir = join(process.cwd(), "drizzle")
const journal = JSON.parse(readFileSync(join(dir, "meta", "_journal.json"), "utf8")) as {
  entries: { idx: number; when: number; tag: string }[]
}
const files = readdirSync(dir).filter((name) => name.endsWith(".sql")).map((name) => name.replace(/\.sql$/, "")).sort()
const tags = journal.entries.map((entry) => entry.tag)
const problems: string[] = []
for (const file of files) if (!tags.includes(file)) problems.push(`${file}.sql is not in drizzle/meta/_journal.json`)
for (const tag of tags) if (!files.includes(tag)) problems.push(`journal entry ${tag} has no .sql file`)
journal.entries.forEach((entry, index) => {
  if (entry.idx !== index) problems.push(`journal entry ${entry.tag} has idx ${entry.idx}, expected ${index}`)
  const prev = journal.entries[index - 1]
  if (prev && entry.when <= prev.when) {
    problems.push(`journal entry ${entry.tag} has when ${entry.when}, not after ${prev.tag} (${prev.when}); drizzle would skip it`)
  }
})
if (problems.length) {
  console.error(`migration check failed:\n- ${problems.join("\n- ")}`)
  process.exit(1)
}
console.log(`migration check ok: ${files.length} migrations, journal in order`)
