import { describe, expect, it } from "vitest"
import { formatUsd } from "./format"

describe("formatUsd", () => {
  it("keeps 4 significant digits on tiny prices", () => {
    expect(formatUsd(1234.5)).toBe("$1,234.50")
    expect(formatUsd(0.1234567)).toBe("$0.1235")
    expect(formatUsd(0.003531)).toBe("$0.003531")
    expect(formatUsd(0.00001234)).toBe("$0.00001234")
    expect(formatUsd(0.000001234)).toBe("$0.0₅1234")
    expect(formatUsd(3.5907476154546134e-11)).toBe("$0.0₁₀3591")
    expect(formatUsd(0.00027)).toBe("$0.00027")
    expect(formatUsd(0.001)).toBe("$0.001")
    expect(formatUsd(0.0001234)).toBe("$0.0001234")
    expect(formatUsd(1e-6)).toBe("$0.0₅1")
    expect(formatUsd(-0.00001234)).toBe("-$0.00001234")
    expect(formatUsd(0)).toBe("$0")
    expect(formatUsd(null)).toBe("—")
  })
})
