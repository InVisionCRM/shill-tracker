import { describe, expect, it } from "vitest"
import { attemptStatus, partialStatus } from "./backlog"

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

describe("partialStatus (stop refreshing a due window that will never fill)", () => {
  it("keeps retrying a still-partial row while it has attempts left", () => {
    expect(partialStatus(1, "partial")).toBe("partial")
    expect(partialStatus(2, "partial")).toBe("partial")
  })
  it("settles a row stuck on a missing due window as ready once it has been retried enough", () => {
    expect(partialStatus(3, "partial")).toBe("ready")
    expect(partialStatus(4, "partial")).toBe("ready")
  })
  it("never touches a row that is already fully ready", () => {
    expect(partialStatus(0, "ready")).toBe("ready")
    expect(partialStatus(5, "ready")).toBe("ready")
  })
})
