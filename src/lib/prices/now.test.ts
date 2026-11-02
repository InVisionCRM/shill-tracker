import { describe, expect, it } from "vitest"
import { splitDeadTokens } from "./now"

function token(assetKey: string, dead: boolean) {
  return { assetKey, chain: "pulsechain", contract: "0xabc", pair: null, binance: null, coingecko: null, dead }
}

describe("splitDeadTokens (price-now pipeline)", () => {
  it("separates dead/rugged tokens from ones that still need a live quote", () => {
    const tokens = [token("ct:pulsechain:0x1", false), token("ct:pulsechain:0x2", true), token("ct:pulsechain:0x3", false)]
    const { dead, alive } = splitDeadTokens(tokens)
    expect(dead.map((t) => t.assetKey)).toEqual(["ct:pulsechain:0x2"])
    expect(alive.map((t) => t.assetKey)).toEqual(["ct:pulsechain:0x1", "ct:pulsechain:0x3"])
  })
  it("never calls out to an API for a dead token (alive is empty when every token is dead)", () => {
    const { dead, alive } = splitDeadTokens([token("a", true), token("b", true)])
    expect(dead).toHaveLength(2)
    expect(alive).toHaveLength(0)
  })
})
