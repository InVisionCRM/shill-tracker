import { describe, expect, it } from "vitest"
import { failsPulseChainCheck } from "./chain-guard"

function chains(...values: (string | null)[]) {
  return values.map((chain) => ({ chain }))
}

describe("failsPulseChainCheck", () => {
  it("does not judge a thin sample yet", () => {
    expect(failsPulseChainCheck(chains("ethereum", "solana", "bsc"))).toBe(false)
  })

  it("passes a voice whose determined mentions are mostly PulseChain", () => {
    const mentions = chains(
      ...Array(16).fill("pulsechain"),
      "ethereum",
      "solana",
      null,
      null,
    )
    expect(failsPulseChainCheck(mentions)).toBe(false)
  })

  it("rejects a voice with a large determined sample and almost no PulseChain (mrjacklevin-shaped)", () => {
    const mentions = chains(
      "pulsechain",
      ...Array(10).fill("solana"),
      ...Array(10).fill("ethereum"),
      null,
      null,
      null,
    )
    expect(failsPulseChainCheck(mentions)).toBe(true)
  })

  it("rejects a voice with zero PulseChain mentions once the sample is large enough", () => {
    const mentions = chains(...Array(20).fill("ethereum"))
    expect(failsPulseChainCheck(mentions)).toBe(true)
  })

  it("does not count unmatched EVM contracts as evidence either way", () => {
    // All "unknown-evm": could still turn out to be PulseChain once resolved, so stays undecided.
    const mentions = chains(...Array(20).fill("unknown-evm"))
    expect(failsPulseChainCheck(mentions)).toBe(false)
  })

  it("passing mostly-pending mentions does not trigger a reject", () => {
    const mentions = chains("pulsechain", "pulsechain", ...Array(30).fill(null))
    expect(failsPulseChainCheck(mentions)).toBe(false)
  })
})
