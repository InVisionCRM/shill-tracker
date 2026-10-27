import { describe, expect, it } from "vitest"
import { normalizeSslMode } from "./url"

describe("normalizeSslMode", () => {
  it("upgrades require to verify-full and keeps other params", () => {
    const out = normalizeSslMode("postgresql://u:p@h.example/db?sslmode=require&channel_binding=require")
    expect(out).toContain("sslmode=verify-full")
    expect(out).toContain("channel_binding=require")
  })
  it("leaves disable and missing modes alone", () => {
    expect(normalizeSslMode("postgresql://u:p@localhost/db?sslmode=disable")).toContain("sslmode=disable")
    expect(normalizeSslMode("postgresql://u:p@localhost/db")).toBe("postgresql://u:p@localhost/db")
  })
})
