import Link from 'next/link'
import { ChevronRight, FolderKanban, Pin } from 'lucide-react'
import { relativeDay } from '@/lib/assistant/sessions'
import type { ProjektZeile } from '@/lib/assistant/projekte'
import { NeuesProjekt } from '@/components/assistant/projekte/NeuesProjekt'

function klein(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

function untertitel(p: ProjektZeile): string {
  const chats = `${p.chatAnzahl} ${p.chatAnzahl === 1 ? 'Chat' : 'Chats'}`
  const dateien = `${p.dateiAnzahl} ${p.dateiAnzahl === 1 ? 'Datei' : 'Dateien'}`
  return `${chats} · ${dateien} · ${klein(relativeDay(p.updatedAt))}`
}

/** Eine Aktionszeile oben, darunter die Projekte als Zeilen in einem Rahmen. */
export function ProjektListe({ projekte }: { projekte: ProjektZeile[] }) {
  return (
    <div className="flex flex-col gap-3">
      <NeuesProjekt />

      {projekte.length === 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-dashed border-border px-4 py-4">
          <FolderKanban aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Ein Projekt bündelt Chats zu einem Thema: gemeinsame Anweisungen und Dateien gelten für
            jeden Chat darin.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {projekte.map((p) => (
            <li key={p.id}>
              <Link
                href={`/assistant/projekte/${p.id}`}
                className="flex min-h-14 items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {p.pinned && <Pin aria-label="Angeheftet" className="size-3 shrink-0 text-primary" />}
                    <span className="truncate">{p.name}</span>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{untertitel(p)}</span>
                </span>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
