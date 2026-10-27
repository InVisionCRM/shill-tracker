import { Suspense } from "react"
import { connection } from "next/server"
import { FeedBoard } from "@/components/feed-board"
import { getFeed } from "@/lib/queries"
import { toFeed } from "@/lib/serialize"

export const metadata = {
  title: "Feed",
  description: "The latest shills from tracked X accounts with the price at the post and how the token moved since.",
}

export default function FeedPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Opening the feed…</p>}>
      <Feed />
    </Suspense>
  )
}

async function Feed() {
  await connection()
  const items = (await getFeed(60)).map(toFeed)
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-mono text-xs tracking-[0.18em] text-phosphor uppercase">Feed</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Every shill, newest first.</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          This list polls every 12 seconds. A new ingest shows up without a refresh. Mark prices move when the live
          quote changes. Seed paths stay put.
        </p>
      </div>
      <FeedBoard initial={items} />
    </div>
  )
}
