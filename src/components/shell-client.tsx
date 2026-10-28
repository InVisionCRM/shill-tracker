"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity, Radio, ScrollText, Trophy, Users } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "cn"
import { useLive } from "./live-provider"

export const LINKS = [
  { href: "/", label: "Tape", icon: Activity },
  { href: "/leaderboard", label: "Board", icon: Trophy },
  { href: "/feed", label: "Feed", icon: Radio },
  { href: "/influencers", label: "Voices", icon: Users },
  { href: "/methodology", label: "Method", icon: ScrollText },
]

export function NavLinks() {
  const pathname = usePathname()
  return (
    <>
      {LINKS.map((link) => {
        const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href)
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(buttonVariants({ variant: active ? "secondary" : "ghost", size: "sm" }))}
          >
            {link.label}
          </Link>
        )
      })}
    </>
  )
}

export function BottomTabs() {
  const pathname = usePathname()
  return (
    <div className="mx-auto flex max-w-lg">
      {LINKS.map((link) => {
        const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href)
        const Icon = link.icon
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] tracking-wide",
              active ? "text-phosphor" : "text-muted-foreground",
            )}
          >
            <Icon className="size-4" />
            {link.label}
          </Link>
        )
      })}
    </div>
  )
}

export function NavFallback() {
  return (
    <>
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
          {link.label}
        </Link>
      ))}
    </>
  )
}

export function LiveDot() {
  const { connected } = useLive()
  return (
    <span className="flex w-[4.75rem] items-center gap-1.5 whitespace-nowrap font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
      <span className={`size-1.5 rounded-full ${connected ? "bg-gain" : "bg-warn"}`} />
      {connected ? "Live" : "Syncing"}
    </span>
  )
}

export function PricingBar() {
  const { progress } = useLive()
  if (!progress || progress.phase === "done" || progress.total === 0) return null
  const width = Math.max(4, Math.round((progress.priced / Math.max(progress.total, 1)) * 100))
  const label =
    progress.phase === "repeat"
      ? `Pricing repeats ${progress.priced.toLocaleString("en-US")} / ${progress.total.toLocaleString("en-US")}`
      : `Pricing first calls ${progress.firstPriced.toLocaleString("en-US")} / ${progress.firstTotal.toLocaleString("en-US")}`
  return (
    // Fixed just above the mobile tab bar (bottom on desktop): it never shifts the page or covers the top of it.
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-y bg-background/95 px-4 py-1.5 backdrop-blur md:bottom-0">
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        <p className="shrink-0 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-phosphor" style={{ width: `${width}%` }} />
        </div>
      </div>
    </div>
  )
}

