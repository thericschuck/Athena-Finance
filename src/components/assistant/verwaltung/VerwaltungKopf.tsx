'use client'

import { Info, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/**
 * Kopfleiste von Speicher und Wissen: Suchfeld, Info-Popover (der Erklärtext) und „Neu" in EINER
 * Zeile. Der Erklärtext steht hinter dem Info-Icon, damit er den Kopf nicht beherrscht.
 */
export function VerwaltungKopf({
  suche,
  onSuche,
  platzhalter,
  info,
  onNeu,
}: {
  suche: string
  onSuche: (wert: string) => void
  platzhalter: string
  info: string
  onNeu: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={suche}
          onChange={(e) => onSuche(e.target.value)}
          placeholder={platzhalter}
          aria-label={platzhalter}
          className="h-10 pl-9"
        />
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="size-10 shrink-0" aria-label="Was ist das?">
            <Info className="size-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] text-sm text-muted-foreground">
          {info}
        </PopoverContent>
      </Popover>
      <Button onClick={onNeu} className="h-10 shrink-0">
        <Plus className="size-4" />
        Neu
      </Button>
    </div>
  )
}
