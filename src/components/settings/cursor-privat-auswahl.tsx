'use client'

import type { CSSProperties, ReactNode } from 'react'
import { MousePointer2 } from 'lucide-react'
import { usePrivacy } from '@/components/providers/privacy-context'
import {
  useCursorStil, usePrivatStil, useMediaQuery,
  type CursorStil, type PrivatStil,
} from '@/lib/lokale-darstellung'
import { cn } from '@/lib/utils'

/**
 * Cursor und Stil der versteckten Zahlen. Gilt sofort und nur auf diesem Gerät
 * (siehe lib/lokale-darstellung.ts) — deshalb außerhalb des „Speichern“-Flusses.
 */
export function CursorPrivatAuswahl() {
  const [cursor, setCursor] = useCursorStil()
  const [privat, setPrivat] = usePrivatStil()
  const { hidden, toggle } = usePrivacy()
  const maus = useMediaQuery('(hover: hover) and (pointer: fine)')

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">Mauszeiger</p>
          <p className="text-xs text-muted-foreground">
            Passt sich dem Theme an. Gilt sofort, nur auf diesem Gerät
            {maus ? '' : ' — auf Touch-Geräten bleibt der normale Zeiger'}.
          </p>
        </div>
        <div role="radiogroup" aria-label="Mauszeiger" className="grid grid-cols-2 gap-2">
          {CURSOR_OPTIONEN.map(o => (
            <Option
              key={o.id}
              gewaehlt={cursor === o.id}
              onSelect={() => setCursor(o.id)}
              titel={o.titel}
              text={o.text}
            >
              {o.vorschau}
            </Option>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Versteckte Zahlen</p>
            <p className="text-xs text-muted-foreground">So sehen Beträge aus, wenn sie über das Auge ausgeblendet sind.</p>
          </div>
          <button
            type="button"
            onClick={toggle}
            className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            {hidden ? 'Zahlen einblenden' : 'Jetzt ausprobieren'}
          </button>
        </div>
        <div role="radiogroup" aria-label="Versteckte Zahlen" className="grid grid-cols-3 gap-2">
          {PRIVAT_OPTIONEN.map(o => (
            <Option
              key={o.id}
              gewaehlt={privat === o.id}
              onSelect={() => setPrivat(o.id)}
              titel={o.titel}
              text={o.text}
            >
              {/* Bewusst ohne .tabular-nums: die Vorschau soll den Stil zeigen, nicht selbst
                  vom globalen Privatmodus erfasst werden. */}
              <span className="font-mono text-base" style={o.stil} aria-hidden>
                12.480 €
              </span>
            </Option>
          ))}
        </div>
      </div>
    </div>
  )
}

function Option({
  gewaehlt, onSelect, titel, text, children,
}: {
  gewaehlt: boolean
  onSelect: () => void
  titel: string
  text: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={gewaehlt}
      onClick={onSelect}
      className={cn(
        'flex flex-col items-stretch gap-2 rounded-lg border p-2.5 text-left transition-colors',
        gewaehlt ? 'border-primary bg-primary/5' : 'border-border hover:border-foreground/30',
      )}
    >
      <span className="relative flex h-14 items-center justify-center overflow-hidden rounded-md bg-muted/40">
        {children}
      </span>
      <span>
        <span className={cn('block text-sm', gewaehlt && 'font-medium text-primary')}>{titel}</span>
        <span className="block text-[11px] leading-snug text-muted-foreground">{text}</span>
      </span>
    </button>
  )
}

/* ── Optionen ─────────────────────────────────────────────────────────────── */

/** Dieselbe Form wie der echte Cursor (PFEIL_PFAD in custom-cursor.tsx), hier in den Farben des aktuellen Themes. */
const PFEIL_PFAD = 'M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z'

function PfeilVorschau() {
  return (
    <svg viewBox="0 0 24 24" className="size-8" aria-hidden>
      <path d={PFEIL_PFAD} fill="var(--primary)" stroke="var(--card)" strokeWidth="1.7" strokeLinejoin="round" paintOrder="stroke" />
    </svg>
  )
}

const CURSOR_OPTIONEN: { id: CursorStil; titel: string; text: string; vorschau: ReactNode }[] = [
  {
    id: 'pfeil',
    titel: 'Theme-Pfeil',
    text: 'Schlanker Pfeil in den Farben deines Themes',
    vorschau: <PfeilVorschau />,
  },
  {
    id: 'system',
    titel: 'System',
    text: 'Unveränderter Standard-Zeiger',
    vorschau: <MousePointer2 className="size-5 text-muted-foreground" strokeWidth={1.5} />,
  },
]

const PRIVAT_OPTIONEN: { id: PrivatStil; titel: string; text: string; stil: CSSProperties }[] = [
  {
    id: 'balken',
    titel: 'Balken',
    text: 'Geschwärzt, mit zartem Verlauf',
    stil: {
      fontFamily: "'Athena Balken', sans-serif",
      fontSynthesis: 'none',
      color: 'transparent',
      WebkitTextFillColor: 'transparent',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      backgroundImage: 'linear-gradient(180deg, var(--privacy-balken-oben), var(--privacy-balken-unten))',
    },
  },
  {
    id: 'blur',
    titel: 'Milchglas',
    text: 'Unscharfer Schemen',
    stil: { filter: 'blur(0.32em)' },
  },
  {
    id: 'punkte',
    titel: 'Punkte',
    text: 'Altes Design (•••)',
    stil: { WebkitTextSecurity: 'disc' } as CSSProperties,
  },
]
