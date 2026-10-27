"use client"

import { Suspense } from "react"
import dynamic from "next/dynamic"
import type { ComponentProps } from "react"
import { CHART_BOX } from "./chart-box"

const SKELETON = <div className={`${CHART_BOX} animate-pulse rounded-md bg-muted/40`} aria-hidden />

const EquityChart = dynamic(() => import("./equity-chart").then((mod) => mod.EquityChart), {
  ssr: false,
  loading: () => SKELETON,
})

/** Loads the chart code after first paint; the skeleton holds the exact same box. Own Suspense so the
 * ssr:false bailout stays inside this box. */
export function LazyEquityChart(props: ComponentProps<typeof EquityChart>) {
  return (
    <Suspense fallback={SKELETON}>
      <EquityChart {...props} />
    </Suspense>
  )
}
