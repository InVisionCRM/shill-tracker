"use client"

import dynamic from "next/dynamic"
import { CHART_BOX } from "./chart-box"

/** Loads the chart code after first paint; the skeleton holds the exact same box. */
export const LazyEquityChart = dynamic(() => import("./equity-chart").then((mod) => mod.EquityChart), {
  ssr: false,
  loading: () => <div className={`${CHART_BOX} animate-pulse rounded-md bg-muted/40`} aria-hidden />,
})
