import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCompact, formatRoi, formatUsd, roiClass } from "@/lib/format"

export function StatBento({
  followers,
  shills,
  firstCalls,
  credibility,
  dumpRisk,
  pumpDumpCount,
  median7d,
  win7d,
  book7d,
}: {
  followers: number
  shills: number
  firstCalls: number
  credibility: number | null
  dumpRisk: number | null
  pumpDumpCount: number
  median7d: number | null
  win7d: number | null
  book7d: number | null
}) {
  return (
    <section aria-label="Score summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Card className="col-span-2 glass-card">
        <CardHeader>
          <CardDescription>Credibility</CardDescription>
          <CardTitle className="font-mono text-4xl tabular-nums">
            {credibility == null ? "—" : Math.round(credibility)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs leading-5 text-muted-foreground">
            Prefers the 7 day print once three first calls have settled. Small samples stay near uncertain.
          </p>
        </CardContent>
      </Card>
      <Card className="glass-card">
        <CardHeader>
          <CardDescription>Dump risk</CardDescription>
          <CardTitle className="font-mono text-3xl tabular-nums">{dumpRisk == null ? "—" : Math.round(dumpRisk)}</CardTitle>
        </CardHeader>
        <CardContent>
          {pumpDumpCount > 0 ? (
            <Badge variant="destructive">
              {pumpDumpCount} pump then dump
            </Badge>
          ) : (
            <Badge variant="outline">No dump flag</Badge>
          )}
        </CardContent>
      </Card>
      <Card className="glass-card">
        <CardHeader>
          <CardDescription>Median 7d</CardDescription>
          <CardTitle className={`font-mono text-3xl tabular-nums ${roiClass(median7d)}`}>{formatRoi(median7d)}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">First call on each ticker.</p>
        </CardContent>
      </Card>
      <Card className="glass-card">
        <CardHeader>
          <CardDescription>Win rate 7d</CardDescription>
          <CardTitle className="font-mono text-3xl tabular-nums">{formatRoi(win7d, 0)}</CardTitle>
        </CardHeader>
      </Card>
      <Card className="glass-card">
        <CardHeader>
          <CardDescription>$100 book, 7d</CardDescription>
          <CardTitle className="font-mono text-3xl tabular-nums">{book7d == null ? "—" : formatUsd(book7d)}</CardTitle>
        </CardHeader>
      </Card>
      <Card className="glass-card">
        <CardHeader>
          <CardDescription>Shills</CardDescription>
          <CardTitle className="font-mono text-3xl tabular-nums">{formatCompact(shills)}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">{firstCalls.toLocaleString("en-US")} first calls</p>
        </CardContent>
      </Card>
      <Card className="glass-card">
        <CardHeader>
          <CardDescription>Followers</CardDescription>
          <CardTitle className="font-mono text-3xl tabular-nums">{formatCompact(followers)}</CardTitle>
        </CardHeader>
      </Card>
    </section>
  )
}
