"use client"

import { Suspense } from "react"
import dynamic from "next/dynamic"
import type { ComponentProps } from "react"

// ssr:false bails out to client rendering up to the nearest <Suspense>. Each lazy piece gets its own
// boundary, so the bailout never reaches the page (which would client-render the hero and delay LCP).

const Toaster = dynamic(() => import("@/components/ui/sonner").then((mod) => mod.Toaster), { ssr: false })

/** Toasts only matter after an interaction, so sonner loads after first paint. */
export function LazyToaster(props: ComponentProps<typeof Toaster>) {
  return (
    <Suspense fallback={null}>
      <Toaster {...props} />
    </Suspense>
  )
}

const DIALOG_BOX = <span className="inline-block h-8 w-[7.5rem]" aria-hidden />

const TrackVoiceDialog = dynamic(() => import("./voice-actions").then((mod) => mod.TrackVoiceDialog), {
  ssr: false,
  loading: () => DIALOG_BOX,
})

/** The header dialog (base-ui Dialog, form, sonner) loads after first paint; the placeholder keeps the button's box. */
export function LazyTrackVoiceDialog() {
  return (
    <Suspense fallback={DIALOG_BOX}>
      <TrackVoiceDialog />
    </Suspense>
  )
}
