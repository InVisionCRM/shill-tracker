const UTC = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
})

/**
 * Says which price the entry uses when it is not the candle at the post minute.
 * exact: nothing to say. nearest_candle: the closest intraday candle. nearest_daily_close: only a daily close existed.
 */
export function PriceMatchNote({
  match,
  at,
  className,
}: {
  match: string | null | undefined
  at: Date | string | null | undefined
  className?: string
}) {
  if (!match || match === "exact") return null
  const date = at ? (typeof at === "string" ? new Date(at) : at) : null
  const when = date && !Number.isNaN(date.getTime()) ? `${UTC.format(date)} UTC` : null
  const daily = match === "nearest_daily_close"
  return (
    <span
      className={`block font-mono text-[10px] tracking-wide text-warn uppercase ${className ?? ""}`}
      title={
        daily
          ? "No intraday price exists for the post time; this is the closest daily close. Scores flag it as approximate."
          : "The closest available candle to the post time, not the post minute itself."
      }
    >
      {daily ? "Nearest daily close" : "Nearest candle"}
      {when ? ` · ${when}` : ""}
    </span>
  )
}
