import { Skeleton } from '@/components/ui/skeleton'

/** Projektdetail: Kopfzeile, Reiter, Inhaltsfläche. */
export default function Loading() {
  return (
    <div className="flex max-w-3xl flex-col gap-4 animate-in fade-in duration-150">
      <Skeleton className="h-10 w-2/3 rounded-md" />
      <div className="flex gap-2">
        <Skeleton className="h-10 w-32 rounded-full" />
        <Skeleton className="h-10 w-24 rounded-full" />
        <Skeleton className="h-10 w-24 rounded-full" />
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}
