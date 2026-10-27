"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { Marquee } from "@/components/ui/marquee"
import { NumberTicker } from "@/components/ui/number-ticker"
import { TokenLogo } from "@/components/token-logo"

const Spotlight = dynamic(() => import("@/components/ui/spotlight").then((mod) => mod.Spotlight), {
  ssr: false,
})

const BackgroundBeams = dynamic(
  () => import("@/components/ui/background-beams").then((mod) => mod.BackgroundBeams),
  { ssr: false },
)

export function HeroEffects() {
  const [beams, setBeams] = useState(false)

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 768px)")
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () => setBeams(wide.matches && !reduce.matches)
    sync()
    wide.addEventListener("change", sync)
    reduce.addEventListener("change", sync)
    return () => {
      wide.removeEventListener("change", sync)
      reduce.removeEventListener("change", sync)
    }
  }, [])

  if (!beams) return null
  return (
    <>
      <Spotlight />
      <BackgroundBeams />
    </>
  )
}

export type HeroLogo = {
  symbol: string
  chain: string | null
  imageUrl: string | null
}

export function HeroMeters({
  voices,
  shills,
  logos,
  logoSource,
}: {
  voices: number
  shills: number
  logos: HeroLogo[]
  logoSource: "tape" | "markets"
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3">
        <Ticker label="Tracked voices" value={voices} />
        <Ticker label="Total shills" value={shills} delay={0.05} />
      </div>
      {logos.length > 0 ? (
        <div>
          <p className="mb-2 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
            {logoSource === "tape" ? "Tokens on the tape" : "Markets the book prices"}
          </p>
          <Marquee>
            {logos.map((logo) => (
              <span key={`${logo.chain ?? "any"}-${logo.symbol}`} className="flex items-center gap-2 px-3 py-1">
                <TokenLogo
                  symbol={logo.symbol}
                  chain={logo.chain}
                  imageUrl={logo.imageUrl}
                  loading="lazy"
                  className="size-7"
                />
                <span className="font-mono text-xs">${logo.symbol}</span>
              </span>
            ))}
          </Marquee>
        </div>
      ) : null}
    </div>
  )
}

function Ticker({ label, value, delay = 0 }: { label: string; value: number; delay?: number }) {
  return (
    <div className="min-h-[4.75rem] rounded-2xl border bg-background/55 px-3 py-3 backdrop-blur-sm">
      <p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">{label}</p>
      <NumberTicker value={value} delay={delay} className="mt-1 text-3xl text-phosphor sm:text-4xl" />
    </div>
  )
}
