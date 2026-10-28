"use client"

import { useEffect, useRef } from "react"
import { cn } from "cn"
import { useReducedMotion } from "@/lib/client-hooks"

const FORMAT = new Intl.NumberFormat("en-US")

/**
 * Number ticker without an animation library. Server HTML shows the real value; once in view it counts up
 * with requestAnimationFrame by writing textContent (no React re-renders), unless reduced motion is on.
 */
export function NumberTicker({
  value,
  className,
  delay = 0,
}: {
  value: number
  className?: string
  delay?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduce = useReducedMotion()
  const formatted = FORMAT.format(Math.round(value))

  useEffect(() => {
    const node = ref.current
    if (reduce || !node || typeof IntersectionObserver === "undefined") return
    let frame = 0
    let timer = 0
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        timer = window.setTimeout(() => {
          const start = performance.now()
          const tick = (now: number) => {
            const t = Math.min(1, (now - start) / 900)
            const eased = 1 - (1 - t) ** 3
            node.textContent = FORMAT.format(Math.round(value * eased))
            if (t < 1) frame = requestAnimationFrame(tick)
          }
          frame = requestAnimationFrame(tick)
        }, delay * 1000)
      },
      { threshold: 0.1 },
    )
    observer.observe(node)
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
      cancelAnimationFrame(frame)
      node.textContent = FORMAT.format(Math.round(value))
    }
  }, [reduce, value, delay])

  return (
    <span
      ref={ref}
      className={cn("inline-block font-mono tabular-nums", className)}
      style={{ minWidth: `${Math.max(formatted.length, 1)}ch` }}
      aria-label={formatted}
    >
      {formatted}
    </span>
  )
}
