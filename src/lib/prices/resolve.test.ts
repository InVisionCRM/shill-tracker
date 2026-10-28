import { describe, expect, it } from "vitest"
import { resolveEvmContract } from "./resolve"

const PLSX = "0x95b303987a60c71504d99aa1b13b4da07b0790ab"
const PEPE = "0x6982508145454ce325ddbe47a25d4ec3d2311933"

describe("resolveEvmContract (PulseChain tickers only)", () => {
  it("resolves the PulseX contract to pulsechain and ignores the deeper Ethereum pair entirely", () => {
    const asset = resolveEvmContract(PLSX, [
      {
        chainId: "ethereum",
        pairAddress: "0x55d5c232d921b9eaa6b37b5845e439acd04b4dba",
        url: "https://dexscreener.com/ethereum/0x55d5c232d921b9eaa6b37b5845e439acd04b4dba",
        baseToken: { address: PLSX, symbol: "PLSX", name: "PulseX" },
        liquidity: { usd: 9_000_000 },
      },
      {
        chainId: "pulsechain",
        pairAddress: "0x1b45b9148791d3a104184cd5dfe5ce57193a3ee9",
        url: "https://dexscreener.com/pulsechain/0x1b45b9148791d3a104184cd5dfe5ce57193a3ee9",
        baseToken: { address: "0x95B303987A60C71504D99Aa1b13B4DA07b0790ab", symbol: "PLSX", name: "PulseX" },
        liquidity: { usd: 40_000 },
      },
    ])
    expect(asset.chain).toBe("pulsechain")
    expect(asset.symbol).toBe("PLSX")
    expect(asset.contractAddress).toBe(PLSX)
    expect(asset.pairAddress).toBe("0x1b45b9148791d3a104184cd5dfe5ce57193a3ee9")
    expect(asset.geckoterminalNetwork).toBe("pulsechain")
    expect(asset.resolutionStatus).toBe("resolved")
    expect(asset.assetKey).toBe(`ct:pulsechain:${PLSX}`)
  })

  it("picks even a dust PulseChain pool over a far deeper Ethereum market — PulseChain is the only candidate", () => {
    const asset = resolveEvmContract(PEPE, [
      {
        chainId: "pulsechain",
        pairAddress: "0xf605e37b1e5095dba82a24812ef504d19ce683ae",
        baseToken: { address: PEPE, symbol: "PEPE", name: "Pepe" },
        liquidity: { usd: 5_108 },
      },
      {
        chainId: "ethereum",
        pairAddress: "0xA43fe16908251ee70EF74718545e4FE6C5cCEc9f",
        baseToken: { address: PEPE, symbol: "PEPE", name: "Pepe" },
        liquidity: { usd: 30_345_788 },
      },
    ])
    expect(asset.chain).toBe("pulsechain")
    expect(asset.pairAddress).toBe("0xf605e37b1e5095dba82a24812ef504d19ce683ae")
    expect(asset.confidence).toBe("low")
  })

  it("marks a contract dead on PulseChain instead of resolving to the Ethereum-only pair", () => {
    const asset = resolveEvmContract(PEPE, [
      {
        chainId: "ethereum",
        pairAddress: "0xA43fe16908251ee70EF74718545e4FE6C5cCEc9f",
        baseToken: { address: PEPE, symbol: "PEPE", name: "Pepe" },
        liquidity: { usd: 2_000_000 },
      },
    ])
    expect(asset.chain).toBe("pulsechain")
    expect(asset.assetState).toBe("dead")
    expect(asset.pairAddress).toBeNull()
  })

  it("marks a contract with no liquidity anywhere as dead", () => {
    const dead = "0xe72834590d7a339ead78e7fbd1d3c7f76f6eb430"
    const asset = resolveEvmContract(dead, [])
    expect(asset.chain).toBe("pulsechain")
    expect(asset.assetState).toBe("dead")
    expect(asset.resolutionStatus).toBe("resolved")
    expect(asset.contractAddress).toBe(dead)
    expect(asset.pairAddress).toBeNull()
  })

  it("accepts a GeckoTerminal pulsechain pool id mapped onto the pair", () => {
    const asset = resolveEvmContract(PLSX, [
      {
        chainId: "pulsechain",
        pairAddress: "0x1b45b9148791d3a104184cd5dfe5ce57193a3ee9",
        baseToken: { address: PLSX, symbol: "PLSX", name: "PLSX" },
        liquidity: { usd: 1_027_870 },
      },
    ])
    expect(asset.chain).toBe("pulsechain")
    expect(asset.resolutionStatus).toBe("resolved")
  })
})
