"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useReducedMotion } from "@/lib/client-hooks"
import { formatCompact, formatRoi, formatUsd, roiClass, dumpTone, scoreTone } from "@/lib/format"
import type { LeaderRow } from "@/lib/types"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { VoiceAvatar } from "./voice-avatar"

const SORTS = [
  { value: "credibility", label: "Credibility" },
  { value: "dump", label: "Dump risk" },
  { value: "median7", label: "Median 7d" },
  { value: "win7", label: "Win rate 7d" },
  { value: "portfolio", label: "$100 book, 7d" },
  { value: "shills", label: "Shills" },
  { value: "followers", label: "Followers" },
] as const

type SortKey = (typeof SORTS)[number]["value"]

export function Leaderboard({ rows }: { rows: LeaderRow[] }) {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("credibility")
  const [minShills, setMinShills] = useState("1")
  const reduce = useReducedMotion()
  const previousRanks = useRef<Map<string, number>>(new Map())
  const [deltas, setDeltas] = useState<Map<string, number>>(new Map())
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const min = Number(minShills) || 0
    return rows
      .filter((row) => row.shillCount >= min)
      .filter((row) => !needle || row.username.includes(needle) || row.name.toLowerCase().includes(needle))
      .slice()
      .sort((a, b) => compare(a, b, sort))
  }, [rows, query, sort, minShills])

  useEffect(() => {
    const next = new Map<string, number>()
    const delta = new Map<string, number>()
    filtered.forEach((row, index) => {
      const before = previousRanks.current.get(row.id)
      if (before != null && before !== index) delta.set(row.id, before - index)
      next.set(row.id, index)
    })
    previousRanks.current = next
    setDeltas(delta)
  }, [filtered])

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-5 text-muted-foreground">
        Ranked on each voice&apos;s first call of a ticker only. Repeat mentions are not scored or listed.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter voices"
          aria-label="Filter voices"
        />
        <Select
          value={sort}
          onValueChange={(value) => {
            if (value) setSort(value as SortKey)
          }}
        >
          <SelectTrigger className="sm:w-52" aria-label="Sort leaderboard">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {SORTS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select value={minShills} onValueChange={(value) => value && setMinShills(value)}>
          <SelectTrigger className="sm:w-40" aria-label="Minimum shills">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="1">1+ shills</SelectItem>
              <SelectItem value="3">3+ shills</SelectItem>
              <SelectItem value="5">5+ shills</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 md:hidden">
        {filtered.map((row, index) => (
          <Link
            key={row.id}
            href={`/influencers/${row.username}`}
            className={`glass-card w-[86%] shrink-0 snap-center rounded-2xl p-4 ${glowClass(row.medianRoi7d)}`}
          >
            <div className="flex items-center gap-3">
              <VoiceAvatar src={row.profileImageUrl} username={row.username} className="size-12" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{row.name}</span>
                <span className="block font-mono text-xs text-muted-foreground">
                  @{row.username} · {formatCompact(row.followersCount)}
                </span>
              </span>
              <RankMark index={index} delta={deltas.get(row.id) ?? 0} reduce={reduce} className="ml-auto" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <span>
                <span className="block text-[10px] tracking-wide text-muted-foreground uppercase">Credibility</span>
                <span className={`font-mono text-lg ${scoreTone(row.credibilityScore)}`}>
                  {row.credibilityScore == null ? "—" : Math.round(row.credibilityScore)}
                </span>
              </span>
              <span>
                <span className="block text-[10px] tracking-wide text-muted-foreground uppercase">Dump risk</span>
                <span className={`font-mono text-lg ${dumpTone(row.dumpRiskScore)}`}>
                  {row.dumpRiskScore == null ? "—" : Math.round(row.dumpRiskScore)}
                </span>
              </span>
              <span className={roiClass(row.medianRoi7d)}>
                <span className="block text-[10px] tracking-wide text-muted-foreground uppercase">Median 7d</span>
                <span className="font-mono">{formatRoi(row.medianRoi7d)}</span>
              </span>
              <span>
                <span className="block text-[10px] tracking-wide text-muted-foreground uppercase">Shills</span>
                <span className="font-mono">{row.shillCount}</span>
              </span>
            </div>
          </Link>
        ))}
        {filtered.length === 0 ? (
          <p className="w-full py-8 text-center text-sm text-muted-foreground">No voices match that filter.</p>
        ) : null}
      </div>
      <div className="hidden overflow-x-auto rounded-xl border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Voice</TableHead>
              <TableHead className="text-right">Followers</TableHead>
              <TableHead className="text-right">Shills</TableHead>
              <TableHead className="hidden text-right md:table-cell">Unique</TableHead>
              <TableHead className="text-right">Win 7d</TableHead>
              <TableHead className="text-right">Median 7d</TableHead>
              <TableHead className="hidden text-right lg:table-cell">$100 / 7d</TableHead>
              <TableHead className="text-right">Dump risk</TableHead>
              <TableHead className="text-right">Credibility</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row, index) => (
              <TableRow key={row.id} className={rowGlowClass(row.medianRoi7d)}>
                <TableCell className="font-mono text-muted-foreground">
                  <RankMark index={index} delta={deltas.get(row.id) ?? 0} reduce={reduce} />
                </TableCell>
                <TableCell>
                  <Link href={`/influencers/${row.username}`} className="flex items-center gap-3">
                    <VoiceAvatar src={row.profileImageUrl} username={row.username} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{row.name}</span>
                      <span className="block font-mono text-xs text-muted-foreground">@{row.username}</span>
                    </span>
                    {row.isDemo ? <Badge variant="outline">Demo</Badge> : null}
                  </Link>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatCompact(row.followersCount)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{row.shillCount}</TableCell>
                <TableCell className="hidden text-right font-mono tabular-nums md:table-cell">{row.uniqueTickers}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatRoi(row.winRate7d, 0)}</TableCell>
                <TableCell className={`text-right font-mono tabular-nums ${roiClass(row.medianRoi7d)}`}>
                  {formatRoi(row.medianRoi7d)}
                </TableCell>
                <TableCell className="hidden text-right font-mono tabular-nums lg:table-cell">
                  {row.portfolio7d == null ? "—" : formatUsd(row.portfolio7d)}
                </TableCell>
                <TableCell className={`text-right font-mono tabular-nums ${dumpTone(row.dumpRiskScore)}`}>
                  {row.dumpRiskScore == null ? "—" : Math.round(row.dumpRiskScore)}
                </TableCell>
                <TableCell className={`text-right font-mono tabular-nums ${scoreTone(row.credibilityScore)}`}>
                  {row.credibilityScore == null ? "—" : Math.round(row.credibilityScore)}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
                  No voices match that filter.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function RankMark({
  index,
  delta,
  reduce,
  className,
}: {
  index: number
  delta: number
  reduce: boolean | null
  className?: string
}) {
  return (
    <span className={`inline-flex items-baseline gap-1 font-mono text-xs text-muted-foreground tabular-nums ${className ?? ""}`}>
      <span className={delta !== 0 && !reduce ? "rank-tick inline-block" : "inline-block"}>#{index + 1}</span>
      {delta !== 0 ? (
        <span className={delta > 0 ? "text-gain" : "text-loss"}>{delta > 0 ? `up ${delta}` : `down ${Math.abs(delta)}`}</span>
      ) : null}
    </span>
  )
}

function glowClass(roi: number | null | undefined) {
  if (roi == null) return ""
  return roi >= 0 ? "glow-gain" : "glow-loss"
}

function rowGlowClass(roi: number | null | undefined) {
  if (roi == null) return ""
  return roi >= 0 ? "row-glow-gain" : "row-glow-loss"
}

function compare(a: LeaderRow, b: LeaderRow, sort: SortKey) {
  const value = (row: LeaderRow) => {
    if (sort === "credibility") return row.credibilityScore
    if (sort === "dump") return row.dumpRiskScore
    if (sort === "median7") return row.medianRoi7d
    if (sort === "win7") return row.winRate7d
    if (sort === "portfolio") return row.portfolio7d
    if (sort === "shills") return row.shillCount
    return row.followersCount
  }
  const av = value(a)
  const bv = value(b)
  if (av == null && bv == null) return a.username.localeCompare(b.username)
  if (av == null) return 1
  if (bv == null) return -1
  return bv - av
}
