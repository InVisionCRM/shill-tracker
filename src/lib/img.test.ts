import { describe, expect, it } from "vitest"
import { allowedImageUrl, proxiedImage } from "./img"

describe("image proxy allowlist", () => {
  it("proxies allowed hosts same-origin", () => {
    expect(proxiedImage("https://cdn.dexscreener.com/a.png")).toBe(
      `/api/img?u=${encodeURIComponent("https://cdn.dexscreener.com/a.png")}`,
    )
  })
  it("refuses other hosts, credentials, odd ports and schemes", () => {
    expect(allowedImageUrl("https://evil.example/a.png")).toBeNull()
    expect(allowedImageUrl("https://user:pw@cdn.dexscreener.com/a.png")).toBeNull()
    expect(allowedImageUrl("https://cdn.dexscreener.com:8443/a.png")).toBeNull()
    expect(allowedImageUrl("file:///etc/passwd")).toBeNull()
    expect(proxiedImage("//evil.example/a.png")).toBeNull()
  })
  it("keeps local paths", () => {
    expect(proxiedImage("/avatars/x")).toBe("/avatars/x")
  })
})
