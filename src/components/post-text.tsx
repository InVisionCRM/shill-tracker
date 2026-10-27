import Link from "next/link"

const TOKEN =
  /(\$[A-Za-z][A-Za-z0-9]{1,14}|\b0x[a-fA-F0-9]{40}\b|(?<![1-9A-HJ-NP-Za-km-z])[1-9A-HJ-NP-Za-km-z]{32,44}(?![1-9A-HJ-NP-Za-km-z]))/g

export function PostText({ text }: { text: string }) {
  const parts = text.split(TOKEN)
  return (
    <p className="text-sm leading-6 whitespace-pre-wrap text-foreground">
      {parts.map((part, index) => {
        if (part.startsWith("$") && part.length > 1) {
          const symbol = part.slice(1).toUpperCase()
          return (
            <Link key={`${part}-${index}`} href={`/tickers/${symbol}`} className="text-phosphor hover:underline">
              {part}
            </Link>
          )
        }
        if (part.startsWith("0x") && part.length === 42) {
          return (
            <Link
              key={`${part}-${index}`}
              href={`/tickers/${part}`}
              className="font-mono text-xs text-chart-4 hover:underline"
            >
              {part}
            </Link>
          )
        }
        if (part.length >= 32 && part.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(part)) {
          return (
            <Link
              key={`${part}-${index}`}
              href={`/tickers/${part}`}
              className="font-mono text-xs text-chart-4 hover:underline"
            >
              {part}
            </Link>
          )
        }
        return <span key={`${part}-${index}`}>{part}</span>
      })}
    </p>
  )
}
