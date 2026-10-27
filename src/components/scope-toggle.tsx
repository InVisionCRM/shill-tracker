"use client"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

export function ScopeToggle({
  value,
  onChange,
}: {
  value: "first" | "all"
  onChange: (value: "first" | "all") => void
}) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(next) => {
        const picked = next[next.length - 1]
        if (picked === "first" || picked === "all") onChange(picked)
      }}
      spacing={0}
      size="sm"
      variant="outline"
      className="w-full sm:w-fit"
      aria-label="Which mentions to score"
    >
      <ToggleGroupItem value="first" className="flex-1 sm:flex-none">
        First calls
      </ToggleGroupItem>
      <ToggleGroupItem value="all" className="flex-1 sm:flex-none">
        All mentions
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
