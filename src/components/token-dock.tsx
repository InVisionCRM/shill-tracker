import Link from "next/link"
import { connection } from "next/server"
import { TokenLogo } from "./token-logo"
import { getDockTokens } from "@/lib/queries"

/**
 * Mac-style dock, right edge, desktop only (outcome 7: no extra JS or images on mobile). Every icon is a
 * plain CSS hover-scale, so the "grow on hover" effect costs nothing beyond the stylesheet.
 */
export async function TokenDock() {
  await connection()
  const tokens = await getDockTokens()
  if (!tokens.length) return null
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
