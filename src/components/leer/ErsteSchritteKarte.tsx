'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { ErsteSchritteListe } from './ErsteSchritteListe'
import type { Schritt } from '@/lib/leer/erste-schritte'

const KEY = 'athena_erste_schritte_aus'

/**
 * Kompakte Karte „Erste Schritte“ über dem Dashboard (nur wenn noch Konto oder Buchungen fehlen).
 * Ausblendbar: die Wahl merkt sich der Browser (localStorage, in try/catch; ohne Speicher bleibt
 * die Karte sichtbar). Wer sie früher ausgeblendet hat, sieht sie höchstens einen Frame lang.
 */
export function ErsteSchritteKarte({ schritte }: { schritte: Schritt[] }) {
  const [aus, setAus] = useState(false)
  useEffect(() => {
    try { if (window.localStorage.getItem(KEY) === '1') setAus(true) } catch { /* Speicher gesperrt: Karte bleibt */ }
  }, [])
  if (aus) return null

  const ausblenden = () => {
    setAus(true)
    try { window.localStorage.setItem(KEY, '1') } catch { /* nicht schlimm */ }
  }

  return (
    <section aria-label="Erste Schritte" className="min-w-0 rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Erste Schritte</h2>
          <p className="text-xs text-muted-foreground">
            Noch ist wenig da. Mit diesen Schritten füllt sich dein Dashboard.{' '}
            <Link href="/settings" className="underline-offset-4 hover:text-foreground hover:underline">Bank verbinden</Link>
          </p>
        </div>
        <button
          type="button"
          onClick={ausblenden}
          aria-label="Erste Schritte ausblenden"
          className="-m-2 flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <ErsteSchritteListe schritte={schritte} />
    </section>
  )
}
