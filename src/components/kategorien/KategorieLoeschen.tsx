'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ladeLoeschFolgen,
  verschiebeBuchungenUndLoesche,
  type LoeschFolgen,
} from '@/app/(dashboard)/finance/(transaktionen)/categories/actions'
import { zielGruppen, type KategorieBasis } from '@/lib/kategorien/berechnen'

const KEIN_ZIEL = '__none__'

/**
 * Löschen mit Folgen: der Dialog fragt beim Öffnen frisch ab, was an der Kategorie hängt, und
 * nennt es. Hat sie Unterkategorien, wird das Löschen blockiert (die Datenbank würde sie sonst still
 * zu Hauptkategorien machen). Hängen Buchungen oder Verträge daran, kann man sie in eine andere
 * Kategorie verschieben, statt sie unkategorisiert zurückzulassen.
 */
export function KategorieLoeschen({
  category,
  alle,
  className,
}: {
  category: KategorieBasis
  alle: KategorieBasis[]
  className?: string
}) {
  const router = useRouter()
  const [offen, setOffen] = useState(false)
  const [folgen, setFolgen] = useState<LoeschFolgen | null>(null)
  const [ladefehler, setLadefehler] = useState<string | null>(null)
  const [ziel, setZiel] = useState(KEIN_ZIEL)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, start] = useTransition()

  useEffect(() => {
    if (!offen) return
    let aktuell = true
    ladeLoeschFolgen(category.id).then((r) => {
      if (!aktuell) return
      if (r.error || !r.folgen) setLadefehler(r.error ?? 'Die Folgen konnten nicht ermittelt werden')
      else setFolgen(r.folgen)
    })
    return () => { aktuell = false }
  }, [offen, category.id])

  const gruppen = useMemo(() => zielGruppen(alle, category.id), [alle, category.id])

  function aendere(neu: boolean) {
    setOffen(neu)
    // Beim Öffnen und Schließen frisch beginnen: veraltete Zahlen wären hier gefährlich.
    setFolgen(null)
    setLadefehler(null)
    setFehler(null)
    setZiel(KEIN_ZIEL)
  }

  function loesche() {
    setFehler(null)
    start(async () => {
      const r = await verschiebeBuchungenUndLoesche(category.id, ziel === KEIN_ZIEL ? null : ziel)
      if (r.error) {
        setFehler(r.error)
        return
      }
      setOffen(false)
      router.refresh()
    })
  }

  const buchungenGesamt = folgen ? folgen.buchungen + folgen.bankBuchungen : 0
  const blockiert = (folgen?.unterkategorien ?? 0) > 0
  const hatAnhang = buchungenGesamt > 0 || (folgen?.vertraege ?? 0) > 0

  return (
    <Dialog open={offen} onOpenChange={aendere}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={`size-10 text-muted-foreground hover:text-destructive md:size-8 ${className ?? ''}`}
          aria-label={`${category.name} löschen`}
        >
          <Trash2 className="size-4 md:size-3.5" aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Kategorie löschen?</DialogTitle>
          <DialogDescription>
            <strong className="break-words text-foreground">{category.name}</strong> wird unwiderruflich gelöscht.
          </DialogDescription>
        </DialogHeader>

        {!folgen && !ladefehler && <p className="text-sm text-muted-foreground">Prüfe, was daran hängt…</p>}
        {ladefehler && <p className="text-sm text-destructive" role="alert">{ladefehler}</p>}

        {folgen && blockiert && (
          <p className="rounded-md border border-border bg-muted/40 p-3 text-sm" role="alert">
            Die Kategorie hat {folgen.unterkategorien} {folgen.unterkategorien === 1 ? 'Unterkategorie' : 'Unterkategorien'}.
            Sie würden sonst still zu Hauptkategorien. Lösche oder verschiebe sie zuerst (Bearbeiten, „Übergeordnet“).
          </p>
        )}

        {folgen && !blockiert && (
          <div className="space-y-3 text-sm">
            {hatAnhang ? (
              <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
                {buchungenGesamt > 0 && (
                  <li>
                    <span className="font-medium text-foreground">{buchungenGesamt}</span>{' '}
                    {buchungenGesamt === 1 ? 'Buchung' : 'Buchungen'}
                    {folgen.bankBuchungen > 0 && folgen.buchungen > 0
                      ? ` (${folgen.buchungen} manuell, ${folgen.bankBuchungen} Bank)`
                      : folgen.bankBuchungen > 0 ? ' (Bank)' : ' (manuell)'}
                  </li>
                )}
                {folgen.vertraege > 0 && (
                  <li>
                    <span className="font-medium text-foreground">{folgen.vertraege}</span>{' '}
                    {folgen.vertraege === 1 ? 'Vertrag' : 'Verträge'}
                  </li>
                )}
              </ul>
            ) : (
              <p className="text-muted-foreground">Es hängen keine Buchungen oder Verträge daran.</p>
            )}

            {hatAnhang && (
              <div className="space-y-1.5">
                <Label htmlFor="kat-ziel">Was soll mit ihnen passieren?</Label>
                <Select value={ziel} onValueChange={setZiel}>
                  <SelectTrigger id="kat-ziel" className="h-10 w-full text-base sm:h-9 sm:text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value={KEIN_ZIEL}>Ohne Kategorie lassen</SelectItem>
                    {gruppen.map((g) => (
                      <SelectGroup key={g.wurzel.id}>
                        <SelectLabel>{g.wurzel.name}</SelectLabel>
                        {g.ziele.map((z) => (
                          <SelectItem key={z.id} value={z.id}>
                            {z.parent_id ? `${g.wurzel.name} › ${z.name}` : z.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {ziel === KEIN_ZIEL
                    ? 'Sie bleiben erhalten, verlieren aber ihre Kategorie und tauchen unter „Ohne Kategorie“ auf.'
                    : 'Sie werden verschoben, Bankbuchungen gelten danach als manuell zugeordnet (Regeln und KI überschreiben sie nicht).'}
                </p>
              </div>
            )}
          </div>
        )}

        {fehler && <p className="text-sm text-destructive" role="alert">{fehler}</p>}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" className="h-10 sm:h-9" onClick={() => aendere(false)}>
            Abbrechen
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="h-10 sm:h-9"
            onClick={loesche}
            disabled={laeuft || !folgen || blockiert}
          >
            {laeuft ? 'Wird gelöscht…' : ziel === KEIN_ZIEL || !hatAnhang ? 'Löschen' : 'Verschieben und löschen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
