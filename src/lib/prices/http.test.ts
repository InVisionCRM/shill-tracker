import { describe, expect, it } from "vitest"
import { nextSlot } from "./http"

describe("nextSlot (per-host pacing and 429 cooldown)", () => {
  it("fires immediately for a host with no history", () => {
    expect(nextSlot(undefined, 10_000, 2_000)).toBe(10_000)
  })

  it("spaces calls by the minimum interval even without a cooldown", () => {
    const state = { lastCallAt: 10_000, cooldownUntil: 0 }
    expect(nextSlot(state, 10_500, 2_000)).toBe(12_000)
  })

  it("a cooldown that just ended still forces one full interval of spacing (no burst back into the limit)", () => {
    // enterCooldown sets lastCallAt === cooldownUntil, so the first call after the cooldown waits
    // minIntervalMs past it instead of firing the instant the cooldown clears.
    const state = { lastCallAt: 50_000, cooldownUntil: 50_000 }
    expect(nextSlot(state, 50_000, 2_000)).toBe(52_000)
  })

  it("does not wait past a cooldown that has already cleared with time to spare", () => {
    const state = { lastCallAt: 50_000, cooldownUntil: 50_000 }
    expect(nextSlot(state, 60_000, 2_000)).toBe(60_000)
  })
})
