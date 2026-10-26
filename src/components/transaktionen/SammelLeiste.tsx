'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectSeparator, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { AVOID_ATTRIBUTE } from '@/lib/hooks/use-avoid-overlap'
import { groupCategoriesByParent } from '@/lib/finance/category-groups'
import type { CategoryOptionRow } from '@/lib/data/finance-transactions'
import {
  bulkLoesche, bulkSetzeKategorie,
} from '@/app/(dashboard)/finance/(transaktionen)/transactions/actions'
import { useAuswahl } from './AuswahlProvider'
import {
  alleGewaehlt, auswahlAlsZeilen, auswahlZusammenfassung, ergebnisText, manuelleIds, type AuswahlZeile,
} from './auswahl'

const OHNE = '__none__'
const MAX = 200

/**
 * Feste Leiste unten im Auswahlmodus: „n ausgewählt“, Kategorie setzen, Löschen (nur wenn manuelle
 * Buchungen dabei sind), Abbrechen. Markiert sich als freizuhaltende Fläche, damit Athenas schwebender
 * Knopf nach oben ausweicht statt „Löschen“ zu verdecken.
 */
export function SammelLeiste({
  zeilen, categories,
}: {
  zeilen: readonly AuswahlZeile[]
  categories: CategoryOptionRow[]
}) {
  const { modus, auswahl, beenden, leeren, seiteUmschalten } = useAuswahl()
  const router = useRouter()
  const [laeuft, startTransition] = useTransition()
  const [meldung, setMeldung] = useState<{ text: string; fehler: boolean } | null>(null)
  const [selectWert, setSelectWert] = useState('')

  if (!modus) return null

  const { anzahl, manuell, bank } = auswahlZusammenfassung(auswahl)
  const zuViele = anzahl > MAX
  const alle = alleGewaehlt(auswahl, zeilen)
  const gruppen = groupCategoriesByParent(categories)

  function nachAktion(text: string) {
    setMeldung({ text, fehler: false })
    leeren()
    setSelectWert('')
    router.refresh()
  }

  function setzeKategorie(wert: string) {
    setSelectWert(wert)
    setMeldung(null)
    startTransition(async () => {
      const res = await bulkSetzeKategorie(auswahlAlsZeilen(auswahl), wert === OHNE ? null : wert)
      if (res.error) {
        setMeldung({ text: res.error, fehler: true })
        setSelectWert('')
      } else nachAktion(ergebnisText(res.geaendert ?? 0, 'geändert'))
    })
  }

  function loesche() {
    setMeldung(null)
    startTransition(async () => {
      const res = await bulkLoesche(manuelleIds(auswahl))
      if (res.error) setMeldung({ text: res.error, fehler: true })
      else nachAktion(ergebnisText(res.geloescht ?? 0, 'gelöscht'))
    })
  }

  return (
    <div
      {...{ [AVOID_ATTRIBUTE]: '' }}
      role="region"
      aria-label="Sammelaktionen"
      className="sticky bottom-3 z-30 mt-3 space-y-2 rounded-lg border border-border bg-popover p-2.5 shadow-lg sm:flex sm:flex-wrap sm:items-center sm:gap-2 sm:space-y-0"
    >
      <div className="flex min-w-0 items-center gap-2 sm:mr-auto">
        <span className="text-sm font-medium tabular-nums" aria-live="polite">
          {anzahl} ausgewählt
        </span>
        <button
          type="button"
          onClick={() => seiteUmschalten(zeilen)}
          className="inline-flex h-10 items-center rounded-md px-2 text-xs text-primary hover:bg-accent sm:h-8"
        >
          {alle ? 'Seite abwählen' : 'Alle auf dieser Seite'}
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="ml-auto sm:hidden"
          onClick={beenden}
          aria-label="Abbrechen"
        >
          <X aria-hidden />
        </Button>
      </div>

      {meldung && (
        <p className={`text-xs ${meldung.fehler ? 'text-danger' : 'text-muted-foreground'}`} role={meldung.fehler ? 'alert' : 'status'}>
          {meldung.text}
        </p>
      )}
      {zuViele && <p className="text-xs text-danger" role="alert">Höchstens {MAX} Buchungen auf einmal.</p>}

      <div className="flex items-center gap-2">
        <Select value={selectWert} onValueChange={setzeKategorie} disabled={anzahl === 0 || zuViele || laeuft}>
          <SelectTrigger className="h-10 min-w-0 flex-1 sm:h-8 sm:w-52 sm:flex-none" aria-label="Kategorie setzen">
            <SelectValue placeholder="Kategorie setzen…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={OHNE}>Ohne Kategorie</SelectItem>
            {gruppen.map(({ parent, children }) => (
              <SelectGroup key={parent.id}>
                <SelectSeparator />
                <SelectItem value={parent.id}>{parent.name}</SelectItem>
                {children.map(c => (
                  <SelectItem key={c.id} value={c.id} className="pl-6">{c.name}</SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>

        {manuell > 0 && (
          <ConfirmDialog
            title={`${manuell} ${manuell === 1 ? 'Buchung' : 'Buchungen'} löschen?`}
            description={`Die manuell erfassten Buchungen werden unwiderruflich gelöscht.${bank > 0 ? ` ${bank} Bankbuchung${bank === 1 ? '' : 'en'} in der Auswahl ${bank === 1 ? 'bleibt' : 'bleiben'} bestehen: Bankbuchungen lassen sich nicht löschen.` : ''}`}
            onConfirm={loesche}
          >
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0 text-danger sm:h-8"
              disabled={zuViele || laeuft}
            >
              <Trash2 className="size-3.5" aria-hidden />
              Löschen ({manuell})
            </Button>
          </ConfirmDialog>
        )}

        <Button type="button" variant="ghost" className="hidden h-8 sm:inline-flex" onClick={beenden}>
          Abbrechen
        </Button>
      </div>
    </div>
  )
}
