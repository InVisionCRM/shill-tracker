export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy>
      <div className="shimmer h-8 w-48 rounded-lg bg-card" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="shimmer h-24 rounded-xl bg-card" />
        ))}
      </div>
      <div className="shimmer h-64 rounded-xl bg-card" />
    </div>
  )
}
