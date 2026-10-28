"use client"

import { lazy, Suspense, useState } from "react"
import { buttonVariants } from "@/components/ui/button"

// The dialog (base-ui Dialog, form, sonner) is not needed to paint or hydrate the header,
// so its code is fetched only when someone clicks.
const TrackVoiceDialog = lazy(() => import("./voice-actions").then((mod) => ({ default: mod.TrackVoiceDialog })))
const UntrackDialog = lazy(() => import("./voice-actions").then((mod) => ({ default: mod.UntrackButton })))
const QueueCta = lazy(() => import("./voice-actions").then((mod) => ({ default: mod.QueueVoiceCta })))

export function TrackVoiceButton() {
  const [wanted, setWanted] = useState(false)
  const button = (
    <button type="button" className={buttonVariants()} onClick={() => setWanted(true)} aria-busy={wanted || undefined}>
      Track a voice
    </button>
  )
  if (!wanted) return button
  return (
    <Suspense fallback={button}>
      <TrackVoiceDialog defaultOpen />
    </Suspense>
  )
}

/** Same idea for "Stop tracking" on voice pages: the alert dialog code loads on click. */
export function UntrackLauncher({ username }: { username: string }) {
  const [wanted, setWanted] = useState(false)
  const button = (
    <button
      type="button"
      className={buttonVariants({ variant: "outline" })}
      onClick={() => setWanted(true)}
      aria-busy={wanted || undefined}
    >
      Stop tracking
    </button>
  )
  if (!wanted) return button
  return (
    <Suspense fallback={button}>
      <UntrackDialog username={username} defaultOpen />
    </Suspense>
  )
}

/** Search-miss CTA: queue the searched handle with one click, code loaded only when shown. */
export function QueueVoiceButton({ username }: { username: string }) {
  const fallback = (
    <button type="button" className={buttonVariants({ variant: "outline" })} disabled aria-busy>
      Queue @{username} to track
    </button>
  )
  return (
    <Suspense fallback={fallback}>
      <QueueCta username={username} />
    </Suspense>
  )
}
