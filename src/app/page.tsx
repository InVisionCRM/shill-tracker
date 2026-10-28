import { Suspense } from "react"
import Link from "next/link"
import { connection } from "next/server"
import { FeedBoard } from "@/components/feed-board"
import { getFeed } from "@/lib/queries"
import { toFeed } from "@/lib/serialize"

export const metadata = {
  title: "Tape",
  description: "Every ticker PulseChain voices shill on X, once each at the first call, with the price at the post and the move since.",
}

export default function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Every ticker they shilled. The price when they said it. What it did after.
        </h1>
        <p className="text-sm text-muted-foreground">
          One row per ticker per voice, at the first call.{" "}
          <Link href="/leaderboard" className="text-phosphor hover:underline">
            Leaderboard
          </Link>
        </p>
      </section>
      <Suspense fallback={<div className="min-h-[100svh]" aria-hidden />}>
        <LatestCalls />
      </Suspense>
    </div>
  )
}

async function LatestCalls() {
  await connection()
  const feed = await getFeed(12)
  return <FeedBoard initial={feed.map(toFeed)} />
}
