"use client"

import { lazy, Suspense, useState } from "react"
import { buttonVariants } from "@/components/ui/button"

// The dialog (base-ui Dialog, form, sonner) is not needed to paint or hydrate the header,
// so its code is fetched only when someone clicks.
const TrackVoiceDialog = lazy(() => import("./voice-actions").then((mod) => ({ default: mod.TrackVoiceDialog })))

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
