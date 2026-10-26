'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/**
 * Händler/Beschreibung einer Buchung -- standardmässig einzeilig abgeschnitten, damit die
 * Tabelle nicht ausufert. Bank-Verwendungszwecke sind oft deutlich länger als die Spalte
 * (IBAN, Uhrzeit, Referenznummer, ...), deshalb per Klick als Popover vollständig lesbar,
 * mit Knopf zum Kopieren des vollen Textes.
 */
export function TransactionDescriptionCell({
  merchant,
  description,
  badge,
}: {
  merchant: string | null
  description: string | null
  badge?: React.ReactNode
}) {
  const [kopiert, setKopiert] = useState(false)
  const primary = merchant || description
  const hasSecondary = !!(merchant && description)

  if (!primary) return <span className="text-muted-foreground">—</span>

  async function kopieren() {
    try {
      await navigator.clipboard.writeText([merchant, description].filter(Boolean).join('\n'))
      setKopiert(true)
      setTimeout(() => setKopiert(false), 1500)
    } catch {
      // Zwischenablage nicht erlaubt (z. B. unsicherer Kontext): der Text bleibt markierbar.
    }
  }

  return (
    <Popover onOpenChange={(o) => { if (!o) setKopiert(false) }}>
      {/* Tap-Fläche am Handy mindestens 40 px hoch; ab md wieder zeilenhoch. */}
      <PopoverTrigger className="flex min-h-10 w-full min-w-0 cursor-pointer flex-col justify-center text-left md:min-h-0">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-foreground">{primary}</span>
          {badge}
        </span>
        {hasSecondary && (
          <span className="block truncate text-xs text-muted-foreground">{description}</span>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 max-w-[calc(100vw-2rem)] space-y-1 text-sm"
      >
        <p className="break-words font-medium text-foreground">{primary}</p>
        {hasSecondary && (
          <p className="whitespace-pre-wrap break-words text-muted-foreground">{description}</p>
        )}
        <button
          type="button"
          onClick={kopieren}
          className="mt-1 inline-flex min-h-10 items-center gap-1.5 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground md:min-h-0"
        >
          {kopiert ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {kopiert ? 'Kopiert' : 'Text kopieren'}
        </button>
      </PopoverContent>
    </Popover>
  )
}
