export type HorizonKey = "1h" | "24h" | "7d" | "30d" | "now"

export const HORIZONS: { key: HorizonKey; label: string; ms: number | null }[] = [
  { key: "1h", label: "1 hour", ms: 60 * 60 * 1000 },
  { key: "24h", label: "24 hours", ms: 24 * 60 * 60 * 1000 },
  { key: "7d", label: "7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "30d", label: "30 days", ms: 30 * 24 * 60 * 60 * 1000 },
  { key: "now", label: "Mark", ms: null },
]

export function assetKeyOf(input: {
  coingeckoId?: string | null
  chain?: string | null
  contractAddress?: string | null
  symbol?: string | null
}) {
  if (input.coingeckoId) return `cg:${input.coingeckoId}`
  if (input.contractAddress) {
    return `ct:${input.chain ?? "unknown"}:${input.contractAddress.toLowerCase()}`
  }
  if (input.symbol) return `sym:${input.symbol.toUpperCase()}`
  return null
}

export function formatCallDate(value: Date | string | number | null | undefined) {
  if (value == null || value === "") return "—"
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  const day = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(date)
  return `${day} · ${time} UTC`
}

const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉"

/**
 * USD price with real digits at any size: 2 decimals from $1 up, 4 significant digits below $1
 * ($0.1234, $0.00001234), and from 5 leading zeros a compact count ($0.0₁₀3591 = $0.00000000003591).
 */
export function formatUsd(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—"
  if (value === 0) return "$0"
  const abs = Math.abs(value)
  const sign = value < 0 ? "-" : ""
  if (abs >= 1) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
  }
  const zeros = -Math.floor(Math.log10(abs)) - 1
  const rounded = Number(abs.toPrecision(4))
  if (rounded >= 1) return `${sign}$1.00`
  const digits = rounded.toFixed(Math.min(100, zeros + 6)).slice(2).replace(/0+$/, "")
  const lead = digits.length - digits.replace(/^0+/, "").length
  const significant = digits.slice(lead)
  if (lead >= 5) {
    const count = String(lead).split("").map((digit) => SUBSCRIPT[Number(digit)]).join("")
    return `${sign}$0.0${count}${significant}`
  }
  return `${sign}$0.${digits}`
}

export function formatRoi(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—"
  const pct = value * 100
  const sign = pct > 0 ? "+" : ""
  const places = Math.abs(pct) >= 100 ? 0 : digits
  return `${sign}${pct.toFixed(places)}%`
}

export function formatCompact(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—"
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
}

export function formatNumber(value: number | null | undefined, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "—"
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value)
}

export function roiClass(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || Math.abs(value) < 0.0005) {
    return "text-muted-foreground"
  }
  return value > 0 ? "text-gain" : "text-loss"
}

export function scoreTone(score: number | null | undefined) {
  if (score == null) return "text-muted-foreground"
  if (score >= 70) return "text-gain"
  if (score >= 45) return "text-warn"
  return "text-loss"
}

export function dumpTone(score: number | null | undefined) {
  if (score == null) return "text-muted-foreground"
  if (score >= 65) return "text-loss"
  if (score >= 45) return "text-warn"
  return "text-gain"
}

export function chainLabel(chain: string | null | undefined) {
  if (!chain) return null
  const labels: Record<string, string> = {
    pulsechain: "PulseChain",
    "unknown-evm": "Unknown EVM",
    ethereum: "Ethereum",
    solana: "Solana",
    bsc: "BSC",
    base: "Base",
  }
  return labels[chain.toLowerCase()] ?? chain
}

export function chainShort(chain: string | null | undefined) {
  if (!chain) return null
  const labels: Record<string, string> = {
    pulsechain: "PLS",
    "unknown-evm": "EVM",
    ethereum: "ETH",
    solana: "SOL",
    bsc: "BSC",
    base: "BASE",
  }
  return labels[chain.toLowerCase()] ?? chain.slice(0, 4).toUpperCase()
}

export function shortAddress(value: string | null | undefined) {
  if (!value) return ""
  if (value.length <= 14) return value
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

export function postUrl(username: string, id: string) {
  return `https://x.com/${username}/status/${id}`
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

export function median(values: number[]) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2) return sorted[mid]
  return (sorted[mid - 1] + sorted[mid]) / 2
}

export function average(values: number[]) {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}
