import { beforeEach, describe, expect, it } from "vitest"
import { clearRestingForTests, isResting, rest } from "./backoff"

describe("backoff (per-run retry memory)", () => {
  beforeEach(() => clearRestingForTests())

  it("is not resting until something rests it", () => {
    expect(isResting("row:1", 1_000)).toBe(false)
  })

  it("rests a key until the given time has passed", () => {
    rest("row:1", 1_000, 0)
    expect(isResting("row:1", 500)).toBe(true)
    expect(isResting("row:1", 1_000)).toBe(false)
    expect(isResting("row:1", 1_001)).toBe(false)
  })

  it("never shortens an existing, later rest", () => {
    rest("row:1", 10_000, 0)
    rest("row:1", 100, 0)
    expect(isResting("row:1", 5_000)).toBe(true)
  })

  it("extends a rest when the new one runs later", () => {
    rest("row:1", 100, 0)
    rest("row:1", 10_000, 0)
    expect(isResting("row:1", 5_000)).toBe(true)
  })

  it("keeps keys independent", () => {
    rest("row:1", 1_000, 0)
    expect(isResting("row:2", 500)).toBe(false)
  })
})
