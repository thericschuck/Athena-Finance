import { AthenaAvatar } from '@/components/assistant/AthenaAvatar'
import { AthenaNav } from '@/components/assistant/AthenaNav'

export default function AthenaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col p-4 sm:p-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <AthenaAvatar size={44} />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Athena</h1>
            <p className="text-sm text-muted-foreground">
              Dein Finanz-Agent — liest, recherchiert, merkt sich, schlägt vor.
            </p>
          </div>
        </div>
        <AthenaNav />
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}
