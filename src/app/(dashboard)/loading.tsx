export default function Loading() {
  return (
    <div className="p-8 space-y-6 animate-in fade-in duration-150">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="shimmer h-7 w-48 rounded-md" />
          <div className="shimmer h-4 w-32 rounded-md" />
        </div>
        <div className="shimmer h-8 w-32 rounded-md" />
      </div>

      {/* Content skeleton */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="border-b border-border bg-muted/40 px-4 py-3 flex gap-8">
          {[120, 80, 100, 90, 140].map((w, i) => (
            <div key={i} className="shimmer h-4 rounded-md" style={{ width: w }} />
          ))}
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="px-4 py-3.5 flex items-center gap-8">
              <div className="shimmer h-4 w-16 rounded-md shrink-0" />
              <div className="shimmer h-5 w-20 rounded-full" />
              <div className="shimmer h-4 w-24 rounded-md" />
              <div className="shimmer h-4 w-32 rounded-md" />
              <div className="shimmer h-4 flex-1 rounded-md" />
              <div className="shimmer h-4 w-20 rounded-md shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
