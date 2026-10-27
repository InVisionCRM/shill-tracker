"use client"

import dynamic from "next/dynamic"

/** Toasts only matter after an interaction, so sonner loads after first paint. */
export const LazyToaster = dynamic(() => import("@/components/ui/sonner").then((mod) => mod.Toaster), { ssr: false })

/** The header dialog (base-ui Dialog, form, sonner) loads after first paint; the placeholder keeps the button's box. */
export const LazyTrackVoiceDialog = dynamic(() => import("./voice-actions").then((mod) => mod.TrackVoiceDialog), {
  ssr: false,
  loading: () => <span className="inline-block h-8 w-[7.5rem]" aria-hidden />,
})
