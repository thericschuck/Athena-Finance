import { AthenaAvatar } from '@/components/assistant/AthenaAvatar'
import { AthenaNav } from '@/components/assistant/AthenaNav'

/**
 * Eine Kopfzeile: Medaillon, Name, Reiter. Der frühere Untertitel ist entfallen — er stand über
 * dem Chat und kostete am Handy eine ganze Zeile, die der Verlauf besser brauchen kann.
 */
export default function AthenaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4 sm:p-8">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex shrink-0 items-center gap-2.5">
          <AthenaAvatar size={32} />
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Athena</h1>
        </div>
        <AthenaNav />
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}
