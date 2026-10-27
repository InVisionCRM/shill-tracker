import type { ReactNode } from "react"
import { cn } from "cn"

/**
 * Magic UI Marquee. The second copy is hidden from assistive tech.
 * Motion stops under `prefers-reduced-motion` via `.marquee-track`.
 */
export function Marquee({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn("marquee overflow-hidden", className)}>
      <div className="marquee-track flex w-max">
        <div className="flex shrink-0 items-center">{children}</div>
        <div className="flex shrink-0 items-center" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  )
}
