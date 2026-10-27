"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import type { FeedDTO, PricingProgress, QuoteDTO } from "@/lib/types"

type LiveState = {
  quotes: QuoteDTO[]
  latest: FeedDTO[]
  prices: Record<string, number>
  progress: PricingProgress | null
  connected: boolean
  updatedAt: string | null
}

const LiveContext = createContext<LiveState>({
  quotes: [],
  latest: [],
  prices: {},
  progress: null,
  connected: false,
  updatedAt: null,
})

function indexPrices(quotes: QuoteDTO[]) {
  const prices: Record<string, number> = {}
  const symbols = new Map<string, number>()
  for (const quote of quotes) {
    prices[quote.assetKey] = quote.price
    symbols.set(quote.symbol, (symbols.get(quote.symbol) ?? 0) + 1)
  }
  for (const quote of quotes) {
    if (symbols.get(quote.symbol) === 1) prices[`sym:${quote.symbol}`] = quote.price
  }
  return prices
}

export function LiveProvider({
  initialQuotes,
  initialLatest,
  children,
}: {
  initialQuotes: QuoteDTO[]
  initialLatest: FeedDTO[]
  children: React.ReactNode
}) {
  const [quotes, setQuotes] = useState(initialQuotes)
  const [latest, setLatest] = useState(initialLatest)
  const [progress, setProgress] = useState<PricingProgress | null>(null)
  const [connected, setConnected] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)

  useEffect(() => {
    let stop = false
    const pull = async () => {
      try {
        const response = await fetch("/api/live", { cache: "no-store" })
        if (!response.ok) throw new Error("live feed unavailable")
        const body = (await response.json()) as {
          now: string
          quotes: QuoteDTO[]
          latest: FeedDTO[]
          progress?: PricingProgress
        }
        if (stop) return
        if (body.quotes?.length) setQuotes(body.quotes)
        if (body.latest) setLatest(body.latest)
        if (body.progress) setProgress(body.progress)
        setUpdatedAt(body.now)
        setConnected(true)
      } catch {
        if (!stop) setConnected(false)
      }
    }
    void pull()
    const timer = window.setInterval(pull, 12_000)
    return () => {
      stop = true
      window.clearInterval(timer)
    }
  }, [])

  const prices = useMemo(() => indexPrices(quotes), [quotes])
  const value = useMemo(
    () => ({ quotes, latest, prices, progress, connected, updatedAt }),
    [quotes, latest, prices, progress, connected, updatedAt],
  )
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>
}

export function useLive() {
  return useContext(LiveContext)
}

export function useMarkPrice(assetKey: string | null, fallback: number | null, pinned: boolean) {
  const { prices } = useLive()
  if (pinned || !assetKey) return fallback
  return prices[assetKey] ?? prices[`sym:${assetKey}`] ?? fallback
}
