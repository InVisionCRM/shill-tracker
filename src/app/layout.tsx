import type { Metadata } from "next"
import type { ReactNode } from "react"
import { Geist, Geist_Mono } from "next/font/google"
import { ThemeProvider } from "next-themes"
import { TooltipProvider } from "@/components/ui/tooltip"
import { LazyToaster } from "@/components/lazy-client"
import { AppFrame } from "@/components/shell"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: {
    default: "Shill Tracker",
    template: "%s · Shill Tracker",
  },
  description:
    "Archive every post from tracked X accounts, detect crypto tickers, and score what the call did to the price.",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <ThemeProvider attribute="class" forcedTheme="dark" enableSystem={false}>
          <TooltipProvider>
            <AppFrame quotes={[]} latest={[]}>{children}</AppFrame>
            <LazyToaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
