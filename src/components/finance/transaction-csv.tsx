'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Download, Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { HoverInfo } from '@/components/ui/hover-info'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ladeVorhandeneBuchungen } from '@/app/(dashboard)/finance/(transaktionen)/transactions/import-actions'
import { datumDe } from '@/components/transaktionen/filter/felder'
import { cn } from '@/lib/utils'
import {
  datumsSpanne,
  decodeCsv,
  leseImportText,
  pruefeDuplikate,
  type DuplikatStatus,
  type ImportZeile,
  type ZeilenFehler,
} from '@/lib/transaktionen/import'

// ─── ExportTransactionsButton ─────────────────────────────────────────────────

interface ExportTransactionsButtonProps {
  /** Filter der Seite (`filterAlsParameter`): der Export schreibt genau die Treffer dieser Filter. */
  params?: Record<string, string>
  /** Konto-Detail: alle Buchungen dieses Kontos. */
  accountId?: string
  label?: string
}

export function ExportTransactionsButton({ params, accountId, label = 'Export' }: ExportTransactionsButtonProps) {
  const sp = new URLSearchParams()
  if (accountId && !params?.account) sp.set('account_id', accountId)
  for (const [k, v] of Object.entries(params ?? {})) if (v) sp.set(k, v)
  const query = sp.toString()
  const href = query ? `/api/export/transactions?${query}` : '/api/export/transactions'

  const knopf = (
    <a href={href} download aria-label={params ? `${label}: exportiert genau die Treffer der aktuellen Filter` : label}>
      <Button variant="outline" size="sm" className="h-10 md:h-8" asChild={false}>
        <span className="flex items-center gap-1.5">
          <Download className="size-4" />
          {label}
        </span>
      </Button>
    </a>
  )

  if (!params) return knopf
  return (
    <HoverInfo bare titel="CSV-Export" text="Exportiert genau die Treffer der aktuellen Filter." popClassName="left-auto right-0">
      {knopf}
    </HoverInfo>
  )
}

// ─── ImportTransactionsDialog ─────────────────────────────────────────────────

type Schritt = 'datei' | 'vorschau' | 'ergebnis'
type Ansicht = 'alle' | 'neu' | 'vorhanden' | 'fehler'

/** Eine Anfrage an /api/import/transactions darf höchstens 5000 Zeilen haben; kleiner halten. */
const BLOCK = 1000
/** Mehr Karten auf einmal zu zeichnen ruckelt am Handy. Alle/Keine wirken trotzdem auf die ganze Ansicht. */
const MAX_KARTEN = 100
const MAX_DATEI_BYTES = 10 * 1024 * 1024

const euro = (n: number) =>
  `${n >= 0 ? '+' : '−'}${Math.abs(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

interface ImportTransactionsDialogProps {
  accountId: string
  accountName: string
  onSuccess?: () => void
  /** Gesteuert öffnen (z. B. vom Konto-Wähler). Ohne diese Props bringt der Dialog seinen eigenen Knopf mit. */
  open?: boolean
  onOpenChange?: (offen: boolean) => void
  hideTrigger?: boolean
}

export function ImportTransactionsDialog({
  accountId,
  accountName,
  onSuccess,
  open: offenProp,
  onOpenChange,
  hideTrigger = false,
}: ImportTransactionsDialogProps) {
  const router = useRouter()
  const [offenIntern, setOffenIntern] = useState(false)
  const open = offenProp ?? offenIntern
  const [schritt, setSchritt] = useState<Schritt>('datei')
  const [format, setFormat] = useState('')
  const [zeilen, setZeilen] = useState<ImportZeile[]>([])
  const [fehlerZeilen, setFehlerZeilen] = useState<ZeilenFehler[]>([])
  /** `null` = Duplikatprüfung läuft noch. */
  const [status, setStatus] = useState<DuplikatStatus[] | null>(null)
  const [pruefHinweis, setPruefHinweis] = useState<string | null>(null)
  const [auswahl, setAuswahl] = useState<Set<number>>(new Set())
  const [ansicht, setAnsicht] = useState<Ansicht>('alle')
  const [importiere, setImportiere] = useState(false)
  const [ergebnis, setErgebnis] = useState<{ importiert: number; fehler: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pruefNr = useRef(0)

  // Verhindert, dass der Browser zur abgelegten Datei navigiert, solange der Dialog offen ist.
  useEffect(() => {
    if (!open) return
    const prevent = (e: DragEvent) => e.preventDefault()
    document.addEventListener('dragover', prevent)
    document.addEventListener('drop', prevent)
    return () => {
      document.removeEventListener('dragover', prevent)
      document.removeEventListener('drop', prevent)
    }
  }, [open])

  function reset() {
    pruefNr.current++
    setSchritt('datei')
    setFormat('')
    setZeilen([])
    setFehlerZeilen([])
    setStatus(null)
    setPruefHinweis(null)
    setAuswahl(new Set())
    setAnsicht('alle')
    setErgebnis(null)
    setError(null)
    setImportiere(false)
    setIsDragging(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function setOffen(v: boolean) {
    if (offenProp === undefined) setOffenIntern(v)
    onOpenChange?.(v)
    if (!v) reset()
  }

  async function pruefeVorhandene(neueZeilen: ImportZeile[]) {
    const nr = ++pruefNr.current
    const span = datumsSpanne(neueZeilen)
    const alleNeu = () => {
      setStatus(neueZeilen.map(() => 'neu'))
      setAuswahl(new Set(neueZeilen.map((_, i) => i)))
    }
    if (!span) {
      setStatus([])
      return
    }
    try {
      const res = await ladeVorhandeneBuchungen({ accountId, von: span.von, bis: span.bis })
      if (nr !== pruefNr.current) return
      if (!res.ok) {
        setPruefHinweis(`Die Prüfung auf bereits vorhandene Buchungen ist fehlgeschlagen (${res.error}). Alle Zeilen sind vorausgewählt: bitte selbst prüfen.`)
        alleNeu()
        return
      }
      const st = pruefeDuplikate(neueZeilen, res.buchungen)
      setStatus(st)
      setAuswahl(new Set(st.flatMap((s, i) => (s === 'neu' ? [i] : []))))
      if (res.abgeschnitten) {
        setPruefHinweis('Im Zeitraum liegen mehr als 5.000 Buchungen, die Prüfung auf Duplikate ist unvollständig.')
      }
    } catch (err) {
      if (nr !== pruefNr.current) return
      setPruefHinweis(`Die Prüfung auf bereits vorhandene Buchungen ist fehlgeschlagen (${err instanceof Error ? err.message : 'Fehler'}). Alle Zeilen sind vorausgewählt: bitte selbst prüfen.`)
      alleNeu()
    }
  }

  function handleFileContent(text: string) {
    setError(null)
    const r = leseImportText(text)
    if (!('zeilen' in r)) {
      setError(r.fehler)
      return
    }
    setFormat(r.format)
    setZeilen(r.zeilen)
    setFehlerZeilen(r.fehler)
    setStatus(null)
    setPruefHinweis(null)
    setAuswahl(new Set())
    setAnsicht(r.zeilen.length === 0 ? 'fehler' : 'alle')
    setSchritt('vorschau')
    void pruefeVorhandene(r.zeilen)
  }

  function handleFile(file: File) {
    setError(null)
    if (/\.(xlsx?|ods)$/i.test(file.name)) {
      setError('Excel-Dateien werden nicht gelesen. Bitte in Excel als „CSV (Trennzeichen-getrennt)“ speichern.')
      return
    }
    if (file.size > MAX_DATEI_BYTES) {
      setError('Die Datei ist größer als 10 MB.')
      return
    }
    // Kodierung erkennen statt raten: UTF-8 (eigener Export, mit BOM) oder Windows-1252 (Banken).
    const reader = new FileReader()
    reader.onload = (e) => {
      const buffer = e.target?.result
      if (!(buffer instanceof ArrayBuffer)) {
        setError('Fehler beim Lesen der Datei.')
        return
      }
      handleFileContent(decodeCsv(buffer))
    }
    reader.onerror = () => setError('Fehler beim Lesen der Datei.')
    reader.readAsArrayBuffer(file)
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  // ─── Auswahl und Ansichten ──────────────────────────────────────────────────

  const zaehler = useMemo(() => {
    const z = { neu: 0, vorhanden: 0, aehnlich: 0 }
    for (const s of status ?? []) z[s]++
    return z
  }, [status])

  /** Indizes der Zeilen in der aktuellen Ansicht. */
  const sichtbar = useMemo(() => {
    if (ansicht === 'fehler') return []
    return zeilen.flatMap((_, i) => {
      const s = status?.[i] ?? 'neu'
      if (ansicht === 'neu') return s === 'neu' ? [i] : []
      if (ansicht === 'vorhanden') return s !== 'neu' ? [i] : []
      return [i]
    })
  }, [ansicht, zeilen, status])

  function umschalten(i: number) {
    setAuswahl(prev => {
      const n = new Set(prev)
      if (n.has(i)) n.delete(i)
      else n.add(i)
      return n
    })
  }

  function alleSetzen(an: boolean) {
    setAuswahl(prev => {
      const n = new Set(prev)
      for (const i of sichtbar) {
        // „Alle wählen“ nimmt nur NEUE Zeilen mit: was als vorhanden/ähnlich erkannt ist, würde sonst doppelt
        // gebucht (die Vorschau verspricht, dass Vorhandenes abgewählt bleibt). Einzeln lässt es sich weiter wählen.
        if (an) {
          if ((status?.[i] ?? 'neu') === 'neu') n.add(i)
        } else n.delete(i)
      }
      return n
    })
  }

  // ─── Import ─────────────────────────────────────────────────────────────────

  async function handleImport() {
    const gewaehlt = zeilen.filter((_, i) => auswahl.has(i))
    if (gewaehlt.length === 0) return
    setImportiere(true)
    setError(null)
    let importiert = 0
    const fehler: string[] = []
    try {
      for (let start = 0; start < gewaehlt.length; start += BLOCK) {
        const block = gewaehlt.slice(start, start + BLOCK).map(z => ({
          date: z.date,
          amount: z.amount,
          description: z.description,
          merchant: z.merchant,
          category_name: z.category_name,
        }))
        const res = await fetch('/api/import/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account_id: accountId, rows: block }),
        })
        const data = (await res.json().catch(() => ({}))) as { imported?: number; errors?: string[]; error?: string }
        importiert += data.imported ?? 0
        if (Array.isArray(data.errors)) fehler.push(...data.errors)
        if (!res.ok) {
          fehler.push(data.error ?? 'Import fehlgeschlagen.')
          break
        }
      }
    } catch (err) {
      fehler.push(err instanceof Error ? err.message : 'Unbekannter Fehler.')
    } finally {
      setImportiere(false)
    }

    if (fehler.length === 0 && importiert > 0) {
      setOffen(false)
      if (onSuccess) onSuccess()
      else router.refresh()
      return
    }
    // Teilweise oder gar nicht importiert: Ergebnis zeigen, nichts verschweigen.
    setErgebnis({ importiert, fehler })
    setSchritt('ergebnis')
    if (importiert > 0) router.refresh()
  }

  const anzahlGewaehlt = auswahl.size
  const pruefung = status === null

  return (
    <Dialog open={open} onOpenChange={setOffen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="h-10 md:h-8">
            <Upload className="size-4 mr-1.5" />
            CSV Import
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="flex max-h-[90dvh] flex-col gap-3 p-4 sm:max-w-2xl sm:p-6">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="truncate">Importieren: {accountName}</DialogTitle>
          <DialogDescription>
            {schritt === 'datei' && 'Bank-Export oder eigene CSV-Datei einlesen.'}
            {schritt === 'vorschau' && 'Prüfen, was importiert wird. Bereits vorhandene Buchungen sind abgewählt.'}
            {schritt === 'ergebnis' && 'Ergebnis des Imports.'}
          </DialogDescription>
        </DialogHeader>

        {schritt === 'datei' && (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            <div
              role="button"
              tabIndex={0}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  fileInputRef.current?.click()
                }
              }}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors sm:p-10',
                isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30',
              )}
            >
              <Upload className="size-7 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium">CSV-Datei auswählen oder hier ablegen</p>
                <p className="mt-1 text-xs text-muted-foreground">.csv oder .txt, Sparkasse, DKB, ING, Raiffeisenbank oder Athena-Export</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,text/csv,text/plain,application/vnd.ms-excel"
                className="hidden"
                onChange={onFileChange}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Beträge werden als EUR gebucht. Vor dem Import wird mit den vorhandenen Buchungen des Kontos
              (auch aus dem Bank-Sync) abgeglichen: gleiches Datum, gleicher Betrag, gleicher Text.
            </p>
            {error && <p className="text-sm text-danger">{error}</p>}
          </div>
        )}

        {schritt === 'vorschau' && (
          <>
            <div className="space-y-2">
              <p className="text-sm">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{format}</span>{' '}
                {pruefung ? (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" /> Prüfe auf vorhandene Buchungen …
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    <b className="font-semibold text-foreground">{zaehler.neu}</b> neu ·{' '}
                    <b className="font-semibold text-foreground">{zaehler.vorhanden}</b> bereits vorhanden
                    {zaehler.aehnlich > 0 && <> · <b className="font-semibold text-warning">{zaehler.aehnlich}</b> möglich vorhanden</>}
                    {fehlerZeilen.length > 0 && <> · <b className="font-semibold text-danger">{fehlerZeilen.length}</b> mit Fehler</>}
                  </span>
                )}
              </p>
              {pruefHinweis && <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">{pruefHinweis}</p>}

              <div className="flex flex-wrap items-center gap-1.5">
                {([
                  ['alle', `Alle (${zeilen.length})`],
                  ['neu', `Neu (${zaehler.neu})`],
                  ['vorhanden', `Vorhanden (${zaehler.vorhanden + zaehler.aehnlich})`],
                  ...(fehlerZeilen.length > 0 ? [['fehler', `Fehler (${fehlerZeilen.length})`]] : []),
                ] as [Ansicht, string][]).map(([key, text]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAnsicht(key)}
                    aria-pressed={ansicht === key}
                    className={cn(
                      'inline-flex h-10 items-center rounded-full border px-3 text-sm transition-colors sm:h-8',
                      ansicht === key ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {text}
                  </button>
                ))}
              </div>

              {ansicht !== 'fehler' && sichtbar.length > 0 && (
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{anzahlGewaehlt} von {zeilen.length} gewählt</span>
                  <span className="flex gap-1">
                    <button type="button" onClick={() => alleSetzen(true)} className="inline-flex h-10 items-center rounded-md px-2.5 hover:bg-muted hover:text-foreground sm:h-8">Alle neuen wählen</button>
                    <button type="button" onClick={() => alleSetzen(false)} className="inline-flex h-10 items-center rounded-md px-2.5 hover:bg-muted hover:text-foreground sm:h-8">Keine</button>
                  </span>
                </div>
              )}
            </div>

            {/* Karten statt breiter Tabelle: am Handy ohne seitliches Scrollen lesbar. */}
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pr-0.5">
              {ansicht === 'fehler'
                ? fehlerZeilen.slice(0, 200).map(f => (
                    <div key={f.nr} className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm">
                      <p className="font-medium text-danger">Zeile {f.nr}: {f.grund}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{f.roh}</p>
                    </div>
                  ))
                : sichtbar.slice(0, MAX_KARTEN).map(i => {
                    const z = zeilen[i]
                    const s = status?.[i] ?? 'neu'
                    const an = auswahl.has(i)
                    return (
                      <button
                        key={i}
                        type="button"
                        role="checkbox"
                        aria-checked={an}
                        onClick={() => umschalten(i)}
                        className={cn(
                          'flex w-full min-h-14 items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                          an ? 'border-primary/40 bg-primary/5' : 'border-border opacity-70 hover:opacity-100',
                        )}
                      >
                        <span className={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border', an ? 'border-primary bg-primary text-primary-foreground' : 'border-input')} aria-hidden>
                          {an && <Check className="size-3.5" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="text-xs tabular-nums text-muted-foreground">{datumDe(z.date)}</span>
                            <span className={cn('text-sm font-medium tabular-nums', z.amount >= 0 ? 'text-success' : 'text-danger')}>{euro(z.amount)}</span>
                          </span>
                          <span className="block truncate text-sm">{z.merchant || z.description || '—'}</span>
                          {z.merchant && z.description && <span className="block truncate text-xs text-muted-foreground">{z.description}</span>}
                          {(s !== 'neu' || z.category_name) && (
                            <span className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                              {s === 'vorhanden' && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">Bereits vorhanden</span>}
                              {s === 'aehnlich' && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-warning">Möglich vorhanden (gleicher Betrag, anderer Text)</span>}
                              {z.category_name && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{z.category_name}</span>}
                            </span>
                          )}
                        </span>
                      </button>
                    )
                  })}
              {ansicht !== 'fehler' && sichtbar.length > MAX_KARTEN && (
                <p className="px-1 py-2 text-xs text-muted-foreground">… und {sichtbar.length - MAX_KARTEN} weitere in dieser Ansicht (werden mit „Alle neuen wählen“ bzw. „Keine“ mitgezählt).</p>
              )}
              {ansicht === 'fehler' && fehlerZeilen.length > 200 && (
                <p className="px-1 py-2 text-xs text-muted-foreground">… und {fehlerZeilen.length - 200} weitere Fehlerzeilen.</p>
              )}
              {ansicht !== 'fehler' && sichtbar.length === 0 && (
                <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                  {pruefung ? 'Wird geprüft …' : 'Keine Zeilen in dieser Ansicht.'}
                </p>
              )}
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border pt-3">
              <Button variant="outline" className="h-10" onClick={() => { reset() }} disabled={importiere}>
                Zurück
              </Button>
              <Button className="h-10" onClick={handleImport} disabled={importiere || pruefung || anzahlGewaehlt === 0}>
                {importiere && <Loader2 className="size-4 animate-spin" />}
                {importiere ? 'Importiere …' : `${anzahlGewaehlt} Buchungen importieren`}
              </Button>
            </div>
          </>
        )}

        {schritt === 'ergebnis' && ergebnis && (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            <p className="text-sm">
              <b>{ergebnis.importiert}</b> Buchungen importiert
              {ergebnis.fehler.length > 0 && <>, <b className="text-danger">{ergebnis.fehler.length}</b> Meldungen vom Server</>}.
            </p>
            {ergebnis.fehler.length > 0 && (
              <ul className="space-y-1 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
                {ergebnis.fehler.slice(0, 50).map((f, i) => <li key={i}>{f}</li>)}
                {ergebnis.fehler.length > 50 && <li>… und {ergebnis.fehler.length - 50} weitere</li>}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              Beim erneuten Import derselben Datei werden bereits importierte Buchungen als „vorhanden“ erkannt und abgewählt.
            </p>
            <div className="flex justify-end">
              <Button className="h-10" onClick={() => setOffen(false)}>Schließen</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── ImportTransactionsChooser ────────────────────────────────────────────────

/**
 * „Import“ auf der Transaktionen-Seite: erst das Konto wählen, dann der CSV-Import für dieses Konto.
 * Bei genau einem Konto entfällt die Auswahl.
 */
export function ImportTransactionsChooser({ accounts }: { accounts: { id: string; name: string }[] }) {
  const [popOffen, setPopOffen] = useState(false)
  const [wahl, setWahl] = useState<{ id: string; name: string } | null>(null)

  const knopf = (
    <Button variant="outline" size="sm" className="h-10 md:h-8" disabled={accounts.length === 0}>
      <Upload className="size-4" />
      Import
    </Button>
  )

  return (
    <>
      {accounts.length === 1 ? (
        <span onClick={() => setWahl(accounts[0])}>{knopf}</span>
      ) : (
        <Popover open={popOffen} onOpenChange={setPopOffen}>
          <PopoverTrigger asChild>{knopf}</PopoverTrigger>
          <PopoverContent align="end" className="w-[min(16rem,calc(100vw-2rem))] p-1">
            <p className="px-2 py-1.5 text-xs text-muted-foreground">In welches Konto importieren?</p>
            <div className="max-h-72 overflow-y-auto">
              {accounts.map(a => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => { setPopOffen(false); setWahl(a) }}
                  className="flex min-h-10 w-full items-center rounded-md px-2 text-left text-sm hover:bg-muted"
                >
                  <span className="truncate">{a.name}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
      {wahl && (
        <ImportTransactionsDialog
          key={wahl.id}
          accountId={wahl.id}
          accountName={wahl.name}
          open
          onOpenChange={(v) => { if (!v) setWahl(null) }}
          hideTrigger
        />
      )}
    </>
  )
}
