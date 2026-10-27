"use client"

import { useEffect, useRef } from "react"
import { useInView, useMotionValue, useReducedMotion, useSpring } from "motion/react"
import { cn } from "cn"

/**
 * Magic UI Number Ticker, adapted to `motion/react`.
 * The accessible name is the final value. The visible digits count up
 * unless the visitor asked for reduced motion.
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
  const formatted = new Intl.NumberFormat("en-US").format(Math.round(value))
  // Server HTML and no-JS visitors see the real value. The count-up only starts once in view.
  const motionValue = useMotionValue(0)
  const spring = useSpring(motionValue, { damping: 40, stiffness: 140 })
  const inView = useInView(ref, { once: true, margin: "0px" })

  useEffect(() => {
    if (reduce || !inView) return
    motionValue.jump(0)
    const timer = window.setTimeout(() => motionValue.set(value), delay * 1000)
    return () => window.clearTimeout(timer)
  }, [reduce, inView, motionValue, value, delay])

  useEffect(() => {
    if (reduce) return
    return spring.on("change", (latest) => {
      if (!ref.current) return
      ref.current.textContent = new Intl.NumberFormat("en-US").format(Math.round(latest))
    })
  }, [reduce, spring])

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
