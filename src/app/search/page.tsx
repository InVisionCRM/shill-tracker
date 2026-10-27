import { Suspense } from "react"
import Link from "next/link"
import { connection } from "next/server"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { searchAll } from "@/lib/queries"
import { formatRoi, roiClass } from "@/lib/format"

export const metadata = { title: "Search" }

export default function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Searching…</p>}>
      <Results searchParams={searchParams} />
    </Suspense>
  )
}

async function Results({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await connection()
  const { q = "" } = await searchParams
  const query = q.trim()
  const result = query ? await searchAll(query) : { influencers: [], mentions: [] }
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Search</h1>
        <form action="/search" className="mt-4">
          <input
            name="q"
            defaultValue={query}
            placeholder="@voice or $ticker"
            aria-label="Search"
            className="h-10 w-full max-w-lg rounded-lg border bg-card px-3 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
          />
        </form>
      </header>
      {!query ? (
        <p className="text-sm text-muted-foreground">Try a handle or a symbol.</p>
      ) : result.influencers.length + result.mentions.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No matches for {query}</EmptyTitle>
            <EmptyDescription>Tracked voices and detected tickers are the only index.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <section>
            <h2 className="mb-3 text-sm tracking-[0.16em] text-muted-foreground uppercase">Voices</h2>
            <ul className="flex flex-col gap-2">
              {result.influencers.map((voice) => (
                <li key={voice.id}>
                  <Link href={`/influencers/${voice.username}`} className="block rounded-lg border px-3 py-2">
                    <span className="block font-medium">{voice.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">@{voice.username}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="mb-3 text-sm tracking-[0.16em] text-muted-foreground uppercase">Calls</h2>
            <ul className="flex flex-col gap-2">
              {result.mentions.map((mention) => (
                <li key={mention.id}>
                  <Link href={`/shills/${mention.id}`} className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <span>
                      <span className="font-mono text-phosphor">${mention.symbol}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{mention.name}</span>
                    </span>
                    <span className={`font-mono text-sm ${roiClass(mention.roi7d ?? mention.roiNow)}`}>
                      {formatRoi(mention.roi7d ?? mention.roiNow)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  )
}
