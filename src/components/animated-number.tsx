"use client"

import { useEffect, useRef, useState } from "react"

export function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number | null | undefined
  format: (value: number) => string
  className?: string
}) {
  const [shown, setShown] = useState(value ?? 0)
  const from = useRef(value ?? 0)

  useEffect(() => {
    if (value == null || !Number.isFinite(value)) return
    const start = performance.now()
    const origin = from.current
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 700)
      const eased = 1 - (1 - t) ** 3
      setShown(origin + (value - origin) * eased)
      if (t < 1) frame = requestAnimationFrame(tick)
      else from.current = value
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])

  if (value == null || !Number.isFinite(value)) {
    return <span className={className}>—</span>
  }
  return <span className={className}>{format(shown)}</span>
}

export function Clock() {
  const [now, setNow] = useState<string>("")
  useEffect(() => {
    const tick = () => {
      setNow(
        new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hourCycle: "h23",
          timeZone: "UTC",
        }).format(new Date()),
      )
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [])
  return (
    <span className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
      {now || "--:--:--"} UTC
    </span>
  )
}

export function RelativeTime({ iso }: { iso: string }) {
  const [label, setLabel] = useState(formatRelative(iso))
  useEffect(() => {
    const timer = window.setInterval(() => setLabel(formatRelative(iso)), 30_000)
    return () => window.clearInterval(timer)
  }, [iso])
  return (
    <time dateTime={iso} className="font-mono text-xs text-muted-foreground tabular-nums">
      {label}
    </time>
  )
}

function formatRelative(iso: string) {
  const delta = Date.now() - new Date(iso).getTime()
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (delta < minute) return "just now"
  if (delta < hour) return `${Math.floor(delta / minute)}m ago`
  if (delta < day) return `${Math.floor(delta / hour)}h ago`
  if (delta < 30 * day) return `${Math.floor(delta / day)}d ago`
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(iso),
  )
}
