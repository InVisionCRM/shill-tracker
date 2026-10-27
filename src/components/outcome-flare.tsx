"use client"

import { useReducedMotion } from "motion/react"

export function OutcomeFlare({ roi }: { roi: number | null }) {
  const reduce = useReducedMotion()
  if (reduce || roi == null) return null
  if (roi > 1) {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center gap-2" aria-hidden>
        {["bg-gain", "bg-phosphor", "bg-warn", "bg-chart-4", "bg-gain"].map((tone, index) => (
          <span key={index} className={`confetti-bit ${tone}`} style={{ animationDelay: `${index * 80}ms` }} />
        ))}
      </div>
    )
  }
  if (roi < -0.5) return <div className="rug-shake pointer-events-none absolute inset-0" aria-hidden />
  return null
}
