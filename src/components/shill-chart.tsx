"use client"

import { useEffect, useRef, useState } from "react"
import { formatUsd } from "@/lib/format"
import { barTime, chartTimeframe, fetchChartCandles, isChartToken, type ChartCandle, type ChartTimeframe } from "@/lib/prices/chart-candles"

type Props = {
  contractAddress: string | null | undefined
  chain: string | null | undefined
  postedAt: string | Date
  priceAt: number | null | undefined
}

const UP = "#3ddc97"

// GeckoTerminal's free API allows ~30 calls a minute per IP and often refuses the server's shared IPs.
// When the server comes back empty, the browser asks GeckoTerminal itself (CORS is open), one token at a
// time so a long page stays under that limit.
let browserQueue: Promise<unknown> = Promise.resolve()
// A token the browser already found no candles for this session is not asked again.
function knownEmpty(key: string) {
  try {
    return sessionStorage.getItem(key) === "1"
  } catch {
    return false
  }
}
function candlesFromBrowser(token: string, tf: ChartTimeframe) {
  const key = `chart-empty:${tf}:${token}`
  if (knownEmpty(key)) return Promise.resolve(null)
  const run = browserQueue.then(async () => {
    const result = await fetchChartCandles(token, tf).catch(() => null)
    if (result && !result.failed && !result.candles.length) {
      try {
        sessionStorage.setItem(key, "1")
      } catch {}
    }
    return result
  })
  browserQueue = run.then(() => new Promise((resolve) => setTimeout(resolve, 2_200)))
  return run
}
const DOWN = "#ff5c6c"

/**
 * Real PulseX candles for one call with a marker at the tweet (the shill point). Loads only when scrolled into
 * view. No candles means a small "chart unavailable" note, never a made-up chart.
 */
export function ShillChart({ contractAddress, chain, postedAt, priceAt }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [state, setState] = useState<"loading" | "ready" | "empty">("loading")
  const [beforeData, setBeforeData] = useState(false)
  const chartable = chain === "pulsechain" && isChartToken(contractAddress)
  const postedMs = new Date(postedAt).getTime()

  useEffect(() => {
    const node = box.current
    if (!node || !chartable) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: "200px" },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [chartable])

  useEffect(() => {
    if (!visible || !box.current || !contractAddress) return
    const node = box.current
    let cancelled = false
    let cleanup: (() => void) | undefined
    const tf = chartTimeframe(postedMs)
    ;(async () => {
      const token = contractAddress.toLowerCase()
      const response = await fetch(`/api/candles?token=${token}&tf=${tf}`).catch(() => null)
      const body = response?.ok ? ((await response.json().catch(() => ({}))) as { candles?: ChartCandle[] }) : {}
      let candles = body.candles ?? []
      if (cancelled) return
      if (!candles.length) candles = (await candlesFromBrowser(token, tf))?.candles ?? []
      if (cancelled) return
      if (!candles.length) {
        setState("empty")
        return
      }
      const { createChart, CandlestickSeries, createSeriesMarkers } = await import("lightweight-charts")
      if (cancelled) return
      const min = Math.min(...candles.map((c) => c.low))
      const chart = createChart(node, {
        height: 220,
        autoSize: true,
        layout: { background: { color: "transparent" }, textColor: "#9aa3ad", attributionLogo: true },
        grid: { vertLines: { color: "rgba(255,255,255,0.05)" }, horzLines: { color: "rgba(255,255,255,0.05)" } },
        rightPriceScale: { borderVisible: false },
        timeScale: { borderVisible: false, timeVisible: tf === "hour" },
        handleScroll: false,
        handleScale: false,
      })
      const series = chart.addSeries(CandlestickSeries, {
        upColor: UP,
        downColor: DOWN,
        wickUpColor: UP,
        wickDownColor: DOWN,
        borderVisible: false,
        priceFormat: { type: "custom", base: priceBase(min), minMove: 1 / priceBase(min), formatter: (p: number) => formatUsd(p) },
      })
      series.setData(candles.map((c) => ({ ...c, time: c.time as never })))
      const shillBar = barTime(postedMs, tf)
      setBeforeData(shillBar < candles[0].time)
      if (shillBar >= candles[0].time) {
        const bar = [...candles].reverse().find((c) => c.time <= shillBar) ?? candles[0]
        createSeriesMarkers(series, [
          priceAt != null && priceAt > 0
            ? { time: bar.time as never, position: "atPriceMiddle", price: priceAt, color: "#facc15", shape: "circle", text: "Shill" }
            : { time: bar.time as never, position: "aboveBar", color: "#facc15", shape: "arrowDown", text: "Shill" },
        ])
      }
      if (priceAt != null && priceAt > 0) {
        series.createPriceLine({ price: priceAt, color: "#facc15", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "Shill" })
      }
      chart.timeScale().fitContent()
      setState("ready")
      cleanup = () => chart.remove()
    })().catch(() => {
      if (!cancelled) setState("empty")
    })
    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [visible, contractAddress, postedMs, priceAt])

  if (!chartable) return null
  return (
    <div className="mt-3">
      <div ref={box} className={state === "empty" ? "hidden" : "h-[220px] w-full"} aria-label="Price chart since the shill" />
      {state === "empty" ? <p className="font-mono text-[11px] text-muted-foreground">Chart unavailable</p> : null}
      {beforeData ? (
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          The shill is older than the free chart history (about the last 180 days), so it is not on this chart.
        </p>
      ) : null}
    </div>
  )
}

/** lightweight-charts needs a power-of-10 price base ("unexpected base" otherwise); ~3 significant digits. */
export function priceBase(min: number) {
  if (!(min > 0) || !Number.isFinite(min)) return 100
  const decimals = Math.min(20, Math.max(2, 3 - Math.floor(Math.log10(min))))
  return 10 ** decimals
}
