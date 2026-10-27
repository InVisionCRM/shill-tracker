import { cn } from "cn"

/**
 * Aceternity Spotlight, drawn as a CSS radial gradient instead of an SVG filter.
 * The filter version is expensive on a phone. This one only mounts on a wide
 * screen that has not asked for reduced motion.
 */
export function Spotlight({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "spotlight-drift pointer-events-none absolute -top-32 left-1/2 h-[26rem] w-[44rem] rounded-full bg-[radial-gradient(ellipse_at_center,color-mix(in_oklch,var(--phosphor)_32%,transparent),transparent_68%)]",
        className,
      )}
    />
  )
}
