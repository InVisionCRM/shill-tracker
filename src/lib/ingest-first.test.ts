import { describe, expect, it } from "vitest"
import { isEarlierFirst } from "./ingest"
import { extractMatches } from "./detect/extract"

const at = (ms: number, callKind: string | null = "call") => ({ createdAt: new Date(ms), callKind })

describe("ingest keeps only the first mention", () => {
  it("stores a ticker the voice has never mentioned", () => {
    expect(isEarlierFirst({ isCall: true, createdAt: 5 }, [])).toBe(true)
  })
  it("skips a later repeat and a same-time duplicate", () => {
    expect(isEarlierFirst({ isCall: true, createdAt: 9 }, [at(5)])).toBe(false)
    expect(isEarlierFirst({ isCall: true, createdAt: 5 }, [at(5)])).toBe(false)
  })
  it("replaces the stored row when a backfilled post is earlier", () => {
    expect(isEarlierFirst({ isCall: true, createdAt: 1 }, [at(5), at(9)])).toBe(true)
  })
  it("a call beats a non-call row, never the other way round", () => {
    expect(isEarlierFirst({ isCall: true, createdAt: 9 }, [at(5, "retro_brag")])).toBe(true)
    expect(isEarlierFirst({ isCall: false, createdAt: 1 }, [at(5)])).toBe(false)
  })
})

describe("non-tickers are not extracted", () => {
  it("drops stock tickers and topic hashtags, keeps real coins", () => {
    const symbols = extractMatches("$TSLA $NVDA $EUR #PassiveIncome #RichardHeart $PLSX $dOWN #ATROPA").map((m) => m.symbol)
    expect(symbols).toEqual(expect.arrayContaining(["PLSX", "DOWN", "ATROPA"]))
    expect(symbols).not.toEqual(expect.arrayContaining(["TSLA"]))
    for (const s of ["TSLA", "NVDA", "EUR", "PASSIVEINCOME", "RICHARDHEART"]) expect(symbols).not.toContain(s)
  })
})
