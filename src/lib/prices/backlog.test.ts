import { describe, expect, it } from "vitest"
import { attemptStatus } from "./backlog"

describe("attemptStatus (backlog monotonic progress)", () => {
  it("leaves the row's status alone while it still has attempts left", () => {
    expect(attemptStatus(1, "pending")).toBe("pending")
    expect(attemptStatus(2, "partial")).toBe("partial")
  })
  it("gives up with a reason once a row has failed enough passes, so it stops crowding the queue", () => {
    expect(attemptStatus(3, "pending")).toBe("unavailable")
    expect(attemptStatus(4, "partial")).toBe("unavailable")
  })
})
