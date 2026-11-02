/**
 * Per-run memory of rows and assets that just failed in a way that is not worth retrying this
 * instant (a host rate limit, an on-chain reserve read that came back empty at every sampled
 * time). Backed by a plain in-memory map, so it resets with the process: a fresh backlog run
 * starts clean, but a long-running run (many passes in one process) remembers within itself and
 * moves on to other rows instead of re-hitting the same ones every pass.
 */
const restingUntil = new Map<string, number>()

export function isResting(key: string, now = Date.now()) {
  const until = restingUntil.get(key)
  return until != null && until > now
}

/** Rests `key` for `ms` from `now`. Never shortens an existing, later rest. */
export function rest(key: string, ms: number, now = Date.now()) {
  const until = now + ms
  const existing = restingUntil.get(key)
  if (existing == null || until > existing) restingUntil.set(key, until)
}

export function clearRestingForTests() {
  restingUntil.clear()
}
