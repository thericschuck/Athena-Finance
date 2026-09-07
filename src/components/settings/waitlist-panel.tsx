'use client'

import { useState } from 'react'
import { Check, Copy, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { WaitlistRow } from '@/lib/waitlist'

const DATE = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })
const TIME = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })

/**
 * Die Interessenten-Liste der Landing Page, hier nur zum Ansehen.
 *
 * Bewusst ohne Löschen, Bearbeiten oder Exportieren als Datei: die Daten kommen
 * über ein öffentliches Formular herein und werden serverseitig mit dem
 * Service-Role-Schlüssel gelesen (siehe lib/waitlist.ts). Jede Schreibaktion hier
 * bräuchte denselben Weg noch einmal, und dafür gibt es bislang keinen Anlass —
 * austragen passiert laut Zusage auf der Seite per Antwort-Mail.
 *
 * Was es dagegen gibt, ist das Kopieren aller Adressen: das ist der eine Vorgang,
 * für den die Liste überhaupt existiert — irgendwann geht eine einzige Nachricht
 * an alle raus, und dafür braucht es die Adressen in der Zwischenablage, nicht in
 * einem Dashboard.
 */
export function WaitlistPanel({ rows }: { rows: WaitlistRow[] }) {
  const [copied, setCopied] = useState(false)

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(rows.map(r => r.email).join(', '))
      setCopied(true)
      // Zurücksetzen statt dauerhaft „Kopiert" stehen zu lassen: sonst weiß man
      // beim zweiten Klick nicht, ob er angekommen ist.
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Ohne Clipboard-Berechtigung (unsicherer Kontext) bleibt der Knopf stumm —
      // eine Fehlermeldung hilft hier niemandem weiter.
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Warteliste</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Wer sich über <span className="font-medium text-foreground">/interesse</span> eingetragen hat.
          Nur für dich sichtbar, keine Bearbeitung.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <Mail className="size-4" />
          </span>
          <div>
            <p className="text-2xl font-semibold tabular-nums leading-none">{rows.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {rows.length === 1 ? 'Eintrag' : 'Einträge'}
            </p>
          </div>
        </div>
        {rows.length > 0 && (
          <Button variant="outline" size="sm" onClick={copyAll}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? 'Kopiert' : 'Alle Adressen kopieren'}
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-10 text-center">
          <p className="text-sm text-muted-foreground">Noch niemand eingetragen.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {rows.map(row => {
            const d = new Date(row.created_at)
            return (
              <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
                {/* `break-all`, weil eine lange Adresse ohne Leerzeichen sonst
                    die Zeile aufzieht und die Karte seitlich überläuft. */}
                <span className="min-w-0 flex-1 break-all text-sm">{row.email}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {DATE.format(d)} · {TIME.format(d)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
