import { Suspense } from "react"
import Link from "next/link"
import { Search } from "lucide-react"
import type { FeedDTO, QuoteDTO } from "@/lib/types"
import { Clock } from "./animated-number"
import { LiveProvider } from "./live-provider"
import { BottomTabs, LiveDot, NavFallback, NavLinks, PricingBar } from "./shell-client"
import { TokenDock } from "./token-dock"
import { TrackVoiceButton } from "./track-voice-button"

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
          <PricingBar />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-28">{children}</main>
        <Suspense fallback={null}>
          <TokenDock />
        </Suspense>
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

