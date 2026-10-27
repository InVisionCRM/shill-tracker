"use client"

import { Suspense } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "cn"
import type { FeedDTO, QuoteDTO } from "@/lib/types"
import { formatRoi, formatUsd, roiClass } from "@/lib/format"
import { Clock } from "./animated-number"
import { LiveProvider, useLive } from "./live-provider"
import { TrackVoiceDialog } from "./voice-actions"

const LINKS = [
  { href: "/", label: "Tape" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/feed", label: "Feed" },
  { href: "/influencers", label: "Voices" },
  { href: "/methodology", label: "Method" },
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
          <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="font-mono text-sm font-semibold tracking-[0.22em] text-phosphor">SHILL</span>
              <span className="font-mono text-sm tracking-[0.22em] text-foreground">TRACKER</span>
            </Link>
            <form action="/search" className="mx-auto hidden min-w-0 flex-1 md:block">
              <input
                name="q"
                placeholder="Search @voice or $ticker"
                aria-label="Search"
                className="h-8 w-full rounded-lg border bg-card/60 px-3 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
              />
            </form>
            <div className="ml-auto flex items-center gap-3">
              <LiveDot />
              <Clock />
              <div className="hidden sm:block">
                <TrackVoiceDialog />
              </div>
            </div>
          </div>
          <nav className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
            <Suspense fallback={<NavFallback />}>
              <NavLinks />
            </Suspense>
          </nav>
          <Tape />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24">{children}</main>
        <footer className="border-t py-6 text-center text-xs text-muted-foreground">
          Calls are not advice. Seed paths are labeled. Live marks come from Binance, CoinGecko, and DexScreener.
        </footer>
        <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/95 backdrop-blur md:hidden">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="flex-1 py-3 text-center text-xs">
              {link.label}
            </Link>
          ))}
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
    <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
      <span className={`size-1.5 rounded-full ${connected ? "bg-gain" : "bg-warn"}`} />
      {connected ? "Live" : "Syncing"}
    </span>
  )
}

function Tape() {
  const { quotes } = useLive()
  const row = quotes.length ? [...quotes, ...quotes] : []
  if (!row.length) {
    return <div className="h-9 border-t bg-card/40" />
  }
  return (
    <div className="overflow-hidden border-t bg-card/40">
      <div className="marquee-track flex w-max gap-6 py-2 pr-6">
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
