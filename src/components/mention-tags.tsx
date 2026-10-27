import { Badge } from "@/components/ui/badge"
import { callKindLabel } from "@/lib/detect/kinds"

export function mentionMuted(callKind?: string | null, priceStatus?: string | null) {
  if (priceStatus === "unverifiable") return "opacity-60"
  if (callKind && callKind !== "call") return "opacity-60"
  return ""
}

export function MentionTags({
  callKind,
  priceStatus,
  assetState,
  resolutionConfidence,
}: {
  callKind?: string | null
  priceStatus?: string | null
  assetState?: string | null
  resolutionConfidence?: string | null
}) {
  const kind = callKindLabel(callKind)
  return (
    <>
      {kind ? <Badge variant="outline">{kind}</Badge> : null}
      {priceStatus === "unverifiable" ? <Badge variant="outline">Unverifiable</Badge> : null}
      {assetState === "dead" ? <Badge variant="outline">Dead</Badge> : null}
      {assetState === "rugged" ? <Badge variant="destructive">Rugged</Badge> : null}
      {resolutionConfidence === "ambiguous" ? <Badge variant="outline">Ambiguous</Badge> : null}
    </>
  )
}
