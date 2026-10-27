"use client"

import { Suspense } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity, Radio, ScrollText, Search, Trophy, Users } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "cn"
import type { FeedDTO, QuoteDTO } from "@/lib/types"
import { formatRoi, formatUsd, roiClass } from "@/lib/format"
import { Clock } from "./animated-number"
import { LiveProvider, useLive } from "./live-provider"
import { TrackVoiceButton } from "./track-voice-button"

const LINKS = [
  { href: "/", label: "Tape", icon: Activity },
  { href: "/leaderboard", label: "Board", icon: Trophy },
  { href: "/feed", label: "Feed", icon: Radio },
  { href: "/influencers", label: "Voices", icon: Users },
  { href: "/methodology", label: "Method", icon: ScrollText },
]

export function AppFrame({
  quotes,
  latest,
  children,
}: {
  quotes: QuoteDTO[]
  latest: FeedDTO[]
  children: React.ReactNode
}) {
  return (
    <LiveProvider initialQuotes={quotes} initialLatest={latest}>
      <div className="flex min-h-full flex-col">
        <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md">
          <div className="mx-auto flex h-[52px] w-full max-w-6xl items-center gap-3 px-4">
            <Link href="/" className="flex shrink-0 items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-md bg-phosphor font-mono text-xs font-bold text-primary-foreground">
                S
              </span>
              <span className="whitespace-nowrap font-mono text-sm font-semibold tracking-[0.18em]">
                <span className="text-phosphor">SHILL</span> TRACKER
              </span>
            </Link>
            <form action="/search" className="mx-auto hidden min-w-0 flex-1 md:block">
              <input
                name="q"
                placeholder="Search @voice or $ticker"
                aria-label="Search"
                className="h-8 w-full rounded-lg border bg-card/60 px-3 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
              />
            </form>
            <Link href="/search" className="ml-auto md:hidden" aria-label="Search">
              <Search className="size-4" />
            </Link>
            <div className="flex items-center gap-3 md:ml-auto">
              <LiveDot />
              <Clock />
              <div className="hidden sm:block">
                <TrackVoiceButton />
              </div>
            </div>
          </div>
          <nav className="mx-auto hidden w-full max-w-6xl gap-1 px-4 pb-2 md:flex">
            <Suspense fallback={<NavFallback />}>
              <NavLinks />
            </Suspense>
          </nav>
          <Tape />
          <PricingBar />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-28">{children}</main>
        <footer className="mb-16 border-t py-6 text-center text-xs text-muted-foreground md:mb-0">
          Calls are not advice. Seed paths are labeled. Live marks come from Binance, CoinGecko, and DexScreener.
        </footer>
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden pb-[env(safe-area-inset-bottom)]">
          <Suspense fallback={null}>
            <BottomTabs />
          </Suspense>
        </nav>
      </div>
    </LiveProvider>
  )
}

function NavLinks() {
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

function BottomTabs() {
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

function NavFallback() {
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

function LiveDot() {
  const { connected } = useLive()
  return (
    <span className="flex w-[4.75rem] items-center gap-1.5 whitespace-nowrap font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
      <span className={`size-1.5 rounded-full ${connected ? "bg-gain" : "bg-warn"}`} />
      {connected ? "Live" : "Syncing"}
    </span>
  )
}

function PricingBar() {
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

function Tape() {
  const { quotes } = useLive()
  const row = quotes.length ? [...quotes, ...quotes] : []
  if (!row.length) {
    return <div className="h-9 border-t bg-card/40" />
  }
  return (
    <div className="h-9 overflow-hidden border-t bg-card/40">
      <div className="marquee-track flex h-full w-max items-center gap-6 pr-6">
        {row.map((quote, index) => (
          <Link
            key={`${quote.assetKey}-${index}`}
            href={`/tickers/${quote.symbol}`}
            className="flex items-center gap-2 font-mono text-xs"
          >
            <span className="text-phosphor">${quote.symbol}</span>
            <span>{formatUsd(quote.price)}</span>
            <span className={roiClass(quote.change24h)}>{formatRoi(quote.change24h)}</span>
            <span className="text-[10px] text-muted-foreground uppercase">{quote.source}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
