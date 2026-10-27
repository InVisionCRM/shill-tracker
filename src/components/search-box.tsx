"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

/** Live search: results update 250ms after typing stops. Enter still submits right away. */
export function SearchBox() {
  const initial = useSearchParams().get("q")?.trim() ?? ""
  const router = useRouter()
  const pathname = usePathname()
  const [value, setValue] = useState(initial)
  const [seen, setSeen] = useState(initial)
  const [pending, start] = useTransition()
  const last = useRef(initial)
  // Back/forward or a link can change ?q= without remounting; follow the URL instead of keeping a stale query.
  if (initial !== seen) {
    setSeen(initial)
    if (initial !== last.current) setValue(initial)
  }
  useEffect(() => {
    last.current = seen
  }, [seen])

  useEffect(() => {
    const query = value.trim()
    if (query === last.current) return
    const timer = window.setTimeout(() => {
      last.current = query
      start(() => {
        router.replace(query ? `${pathname}?q=${encodeURIComponent(query)}` : pathname, { scroll: false })
      })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [value, pathname, router])

  return (
    <form
      action="/search"
      className="mt-4 flex max-w-lg items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        const query = value.trim()
        last.current = query
        start(() => router.replace(query ? `${pathname}?q=${encodeURIComponent(query)}` : pathname, { scroll: false }))
      }}
    >
      <input
        name="q"
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="@voice or $ticker"
        aria-label="Search"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="search"
        className="h-10 w-full rounded-lg border bg-card px-3 font-mono text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 sm:text-sm"
      />
      <span aria-live="polite" className="w-16 font-mono text-xs text-muted-foreground">
        {pending ? "…" : ""}
      </span>
    </form>
  )
}
