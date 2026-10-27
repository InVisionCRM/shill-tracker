/**
 * pg 8 treats sslmode=require/prefer/verify-ca as verify-full and logs a security warning for each.
 * Saying verify-full explicitly keeps the same (strict) behavior and silences the warning.
 */
export function normalizeSslMode(url: string) {
  try {
    const parsed = new URL(url)
    const mode = parsed.searchParams.get("sslmode")
    if (mode && ["require", "prefer", "verify-ca"].includes(mode)) {
      parsed.searchParams.set("sslmode", "verify-full")
      return parsed.toString()
    }
    return url
  } catch {
    return url
  }
}
