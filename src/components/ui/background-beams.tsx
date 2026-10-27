import { cn } from "cn"

const PATHS = [
  "M-40 280 C 120 260, 180 80, 360 140 S 620 280, 860 120",
  "M-20 200 C 160 40, 280 40, 420 180 S 680 300, 860 180",
  "M-60 120 C 80 220, 240 300, 400 160 S 640 20, 880 140",
  "M40 340 C 200 200, 320 80, 520 200 S 700 340, 900 220",
]

/**
 * Aceternity Background Beams, reduced to a few stroked paths.
 * No canvas and no WebGL. The hero mounts this only on desktop.
 */
export function BackgroundBeams({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 800 400"
      preserveAspectRatio="xMidYMid slice"
      className={cn("pointer-events-none absolute inset-0 h-full w-full text-phosphor", className)}
    >
      {PATHS.map((d, index) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          className="beam-path opacity-50"
          style={{ animationDelay: `${index * 0.7}s` }}
        />
      ))}
    </svg>
  )
}
