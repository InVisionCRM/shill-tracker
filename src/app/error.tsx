"use client"

import { Button } from "@/components/ui/button"

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 py-10">
      <h1 className="text-2xl font-semibold">The tape hit an error</h1>
      <p className="max-w-lg text-sm text-muted-foreground">
        The page could not read the book. If this is a fresh checkout, run the migration and seed, and confirm
        DATABASE_URL.
      </p>
      <Button onClick={() => reset()}>Try again</Button>
    </div>
  )
}
