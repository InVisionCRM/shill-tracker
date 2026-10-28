import { Suspense } from "react"
import Link from "next/link"
import { Outcome } from "@/components/outcome"
import { connection } from "next/server"
import { SearchBox } from "@/components/search-box"
import { QueueVoiceButton } from "@/components/track-voice-button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { normalizeUsername } from "@/lib/http"
import { searchAll } from "@/lib/queries"

export const metadata = { title: "Search", description: "Find a tracked X account or a ticker and see every priced call." }

export default function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Search</h1>
        <Suspense fallback={<div className="mt-4 h-10 max-w-lg rounded-lg border bg-card" aria-hidden />}>
          <SearchBox />
        </Suspense>
      </header>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Searching…</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function Results({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await connection()
  const { q = "" } = await searchParams
  const query = q.trim()
  const result = query ? await searchAll(query) : { influencers: [], mentions: [] }
  const handle = query && !query.startsWith("$") ? normalizeUsername(query) : null
  return (
    <div className="flex flex-col gap-6">
      {!query ? (
        <p className="text-sm text-muted-foreground">Try a handle or a symbol.</p>
      ) : result.influencers.length + result.mentions.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No matches for {query}</EmptyTitle>
            <EmptyDescription>Tracked voices and detected tickers are the only index.</EmptyDescription>
          </EmptyHeader>
          {handle ? <QueueVoiceButton username={handle} /> : null}
        </Empty>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <section>
            <h2 className="mb-3 text-sm tracking-[0.16em] text-muted-foreground uppercase">Voices</h2>
            {result.influencers.length === 0 && handle ? <QueueVoiceButton username={handle} /> : null}
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
                    <Outcome row={mention} />
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
