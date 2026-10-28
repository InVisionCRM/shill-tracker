"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { TokenLogo } from "./token-logo"

type DockToken = { symbol: string; chain: string | null; imageUrl: string | null; calls: number }

/**
 * Mac-style dock, right edge, desktop only. Below the `lg` breakpoint this fetches nothing and renders
 * nothing (outcome 7: mobile ships zero extra bytes for it), unlike a server-rendered list that would
 * ship every icon's HTML to every device regardless of whether it is ever shown.
 */
export function TokenDock() {
  const [tokens, setTokens] = useState<DockToken[] | null>(null)

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)")
    let cancelled = false
    const load = () => {
      if (!query.matches || tokens) return
      fetch("/api/dock")
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { tokens?: DockToken[] } | null) => {
          if (!cancelled && body?.tokens) setTokens(body.tokens)
        })
        .catch(() => undefined)
    }
    load()
    query.addEventListener("change", load)
    return () => {
      cancelled = true
      query.removeEventListener("change", load)
    }
    // tokens is read, not a dependency: once loaded we never want to re-fetch on a later resize event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!tokens?.length) return null
  return (
    <aside
      aria-label="Every shilled token"
      className="fixed top-1/2 right-2 z-30 hidden max-h-[70vh] -translate-y-1/2 flex-col gap-1.5 overflow-y-auto rounded-2xl border bg-background/85 p-2 backdrop-blur-md lg:flex"
    >
      {tokens.map((token) => (
        <Link
          key={`${token.symbol}:${token.chain ?? ""}`}
          href={`/tickers/${token.symbol}`}
          title={`$${token.symbol}${token.chain ? ` · ${token.chain}` : ""} — ${token.calls} call${token.calls === 1 ? "" : "s"}`}
          className="group shrink-0 transition-transform duration-150 ease-out hover:z-10 hover:scale-150 focus-visible:scale-150"
        >
          <TokenLogo symbol={token.symbol} chain={token.chain} imageUrl={token.imageUrl} className="size-7" />
        </Link>
      ))}
    </aside>
  )
}
