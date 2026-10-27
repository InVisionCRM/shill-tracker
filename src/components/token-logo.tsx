import { chainShort } from "@/lib/format"
import { pulseAsset } from "@/lib/detect/pulse"
import { cn } from "cn"

const KNOWN: Record<string, string> = {
  BTC: "https://coin-images.coingecko.com/coins/images/1/small/bitcoin.png",
  ETH: "https://coin-images.coingecko.com/coins/images/279/small/ethereum.png",
  SOL: "https://coin-images.coingecko.com/coins/images/4128/small/solana.png",
  PEPE: "https://coin-images.coingecko.com/coins/images/29850/small/pepe-token.jpeg",
  WIF: "https://coin-images.coingecko.com/coins/images/33566/small/dogwifhat.jpg",
  DOGE: "https://coin-images.coingecko.com/coins/images/5/small/dogecoin.png",
  BONK: "https://coin-images.coingecko.com/coins/images/28600/small/bonk.jpg",
  HEX: "https://coin-images.coingecko.com/coins/images/10103/small/HEX-logo.png",
}

export function TokenLogo({
  symbol,
  chain,
  imageUrl,
  className,
  loading,
}: {
  symbol: string | null | undefined
  chain?: string | null
  imageUrl?: string | null
  className?: string
  loading?: "eager" | "lazy"
}) {
  const upper = symbol?.toUpperCase() ?? ""
  const pulse = chain === "pulsechain" ? pulseAsset(upper) : null
  const remote = imageUrl && (imageUrl.startsWith("https://") || imageUrl.startsWith("http://")) ? imageUrl : null
  const src = remote ?? pulse?.logo ?? (upper ? KNOWN[upper] : null)
  const badge = chainShort(chain)
  return (
    <span className={cn("relative inline-flex size-8 shrink-0", className)}>
      {src ? (
        // Remote token art. Plain img avoids a remotePatterns allowlist.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading={loading}
          decoding="async"
          className="size-full rounded-full bg-card object-cover ring-1 ring-white/10"
        />
      ) : (
        <span
          className="flex size-full items-center justify-center rounded-full bg-gradient-to-br from-phosphor/80 to-chart-4/80 font-mono text-[10px] font-semibold text-primary-foreground"
          aria-hidden
        >
          {(upper || "?").slice(0, 3)}
        </span>
      )}
      {badge ? (
        <span className="absolute -right-1 -bottom-1 rounded bg-background px-0.5 font-mono text-[8px] leading-3 text-phosphor ring-1 ring-phosphor/40">
          {badge}
        </span>
      ) : null}
    </span>
  )
}
