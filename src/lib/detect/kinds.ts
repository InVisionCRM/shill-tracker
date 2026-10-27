export type CallKind = "call" | "retro_brag" | "commentary" | "negative" | "joke"

export function countsTowardScore(mention: {
  callKind?: string | null
  priceStatus?: string | null
  resolutionStatus?: string | null
}) {
  if ((mention.callKind ?? "call") !== "call") return false
  if (mention.resolutionStatus === "unresolved" || mention.resolutionStatus === "rejected") return false
  if (mention.priceStatus === "unverifiable" || mention.priceStatus === "excluded") return false
  return true
}

export function callKindLabel(kind: string | null | undefined) {
  switch (kind) {
    case "retro_brag":
      return "Retro"
    case "commentary":
      return "Commentary"
    case "negative":
      return "Negative"
    case "joke":
      return "Joke"
    default:
      return null
  }
}
