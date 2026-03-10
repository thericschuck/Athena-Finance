'use client'

import { useState, useRef, useEffect } from 'react'
import { Download, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim())
  if (lines.length === 0) return { headers: [], rows: [] }

  function parseLine(line: string, sep: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        inQuotes = !inQuotes
      } else if (line[i] === sep && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += line[i]
      }
    }
    result.push(current.trim())
    return result
  }

  const sep = lines[0].includes(';') ? ';' : ','
  const headers = parseLine(lines[0], sep)
  const rows = lines.slice(1).map((l) => parseLine(l, sep))
  return { headers, rows }
}

// ─── Amount Parsing ───────────────────────────────────────────────────────────

function parseGermanAmount(raw: string): number {
  if (!raw) return 0
  const str = raw.trim()
  // "1.234,56 S" → Soll (debit) → negative
  const isSoll = /\s+S$/.test(str)
  const cleaned = str.replace(/\s+[SH]$/, '').replace(/\./g, '').replace(',', '.')
  const value = parseFloat(cleaned)
  if (isNaN(value)) return 0
  return isSoll ? -Math.abs(value) : value
}

// ─── Bank Format Detection ────────────────────────────────────────────────────

type BankFormat = 'athena' | 'sparkasse' | 'dkb' | 'ing' | 'raiffeisenbank' | 'unknown'

interface MappedRow {
  date: string
  amount: number
  description?: string
  merchant?: string
  category_name?: string
}

function detectFormat(headers: string[]): BankFormat {
  const h = headers.map((x) => x.toLowerCase())
  const has = (kw: string) => h.some((x) => x.includes(kw.toLowerCase()))

  if ((has('datum') || has('date')) && (has('betrag') || has('amount'))) return 'athena'
  if (has('buchungstag') && has('auftraggeber') && has('betrag')) return 'sparkasse'
  if (has('buchungstag') && has('gläubiger-id')) return 'dkb'
  if (has('buchung') && has('auftraggeber/empfänger') && has('valuta')) return 'ing'
  if (has('buchungsdatum') || (has('umsatz') && has('wert'))) return 'raiffeisenbank'
  return 'unknown'
}

function formatLabel(format: BankFormat): string {
  const labels: Record<BankFormat, string> = {
    athena: 'Athena (eigenes Format)',
    sparkasse: 'Sparkasse',
    dkb: 'DKB',
    ing: 'ING',
    raiffeisenbank: 'Raiffeisenbank',
    unknown: 'Unbekannt',
  }
  return labels[format]
}

function mapRows(
  format: BankFormat,
  headers: string[],
  rows: string[][]
): MappedRow[] {
  function idx(name: string): number {
    return headers.findIndex((h) => h.toLowerCase().includes(name.toLowerCase()))
  }

  function get(row: string[], name: string): string {
    const i = idx(name)
    return i >= 0 ? (row[i] ?? '') : ''
  }

  function getExact(row: string[], name: string): string {
    const i = headers.findIndex((h) => h === name)
    return i >= 0 ? (row[i] ?? '') : ''
  }

  switch (format) {
    case 'athena':
      return rows.map((row) => ({
        date: parseSparkasseDate(get(row, 'datum') || get(row, 'date')),
        amount: parseFloat((get(row, 'betrag') || get(row, 'amount')).replace(',', '.')) || 0,
        description: get(row, 'beschreibung') || get(row, 'description') || undefined,
        merchant: get(row, 'haendler') || get(row, 'merchant') || undefined,
        category_name: get(row, 'kategorie') || get(row, 'category') || undefined,
      }))

    case 'sparkasse':
      return rows.map((row) => ({
        date: parseSparkasseDate(get(row, 'Buchungstag')),
        amount: parseGermanAmount(get(row, 'Betrag')),
        description: get(row, 'Buchungstext') || undefined,
        merchant:
          getExact(row, 'Auftraggeber / Beguenstigter') ||
          getExact(row, 'Auftraggeber/Empfänger') ||
          get(row, 'Auftraggeber') ||
          undefined,
      }))

    case 'dkb':
      return rows.map((row) => ({
        date: parseSparkasseDate(get(row, 'Buchungstag')),
        amount: parseGermanAmount(get(row, 'Betrag')),
        description: get(row, 'Buchungstext') || undefined,
        merchant: get(row, 'Gläubigername') || undefined,
      }))

    case 'ing':
      return rows.map((row) => ({
        date: parseSparkasseDate(get(row, 'Buchung')),
        amount: parseGermanAmount(get(row, 'Betrag')),
        description: get(row, 'Buchungstext') || undefined,
        merchant: get(row, 'Auftraggeber/Empfänger') || undefined,
      }))

    case 'raiffeisenbank':
      return rows.map((row) => ({
        date: parseSparkasseDate(
          get(row, 'Buchungsdatum') || get(row, 'Buchungstag')
        ),
        amount: parseGermanAmount(get(row, 'Umsatz') || get(row, 'Betrag')),
        description:
          get(row, 'Buchungstext') || get(row, 'Verwendungszweck') || undefined,
        merchant:
          get(row, 'Empfänger/Auftraggeber') ||
          get(row, 'Empfänger') ||
          get(row, 'Auftraggeber') ||
          undefined,
      }))

    default:
      return []
  }
}

function parseSparkasseDate(raw: string): string {
  // dd.MM.yyyy → yyyy-MM-dd
  const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (match) return `${match[3]}-${match[2]}-${match[1]}`
  return raw
}

// ─── ExportTransactionsButton ─────────────────────────────────────────────────

interface ExportTransactionsButtonProps {
  accountId?: string
  label?: string
}

export function ExportTransactionsButton({
  accountId,
  label = 'CSV Export',
}: ExportTransactionsButtonProps) {
  const href = accountId
    ? `/api/export/transactions?account_id=${accountId}`
    : `/api/export/transactions`

  return (
    <a href={href} download>
      <Button variant="outline" size="sm" asChild={false}>
        <span className="flex items-center gap-1.5">
          <Download className="size-4" />
          {label}
        </span>
      </Button>
    </a>
  )
}

// ─── ImportTransactionsDialog ─────────────────────────────────────────────────

interface ImportTransactionsDialogProps {
  accountId: string
  accountName: string
  onSuccess?: () => void
}

export function ImportTransactionsDialog({
  accountId,
  accountName,
  onSuccess,
}: ImportTransactionsDialogProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)
  const [detectedFormat, setDetectedFormat] = useState<BankFormat>('unknown')
  const [mappedRows, setMappedRows] = useState<MappedRow[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Prevent the browser from navigating to the dropped file when dialog is open
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
    setStep(1)
    setDetectedFormat('unknown')
    setMappedRows([])
    setError(null)
    setIsImporting(false)
    setIsDragging(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleFileContent(text: string) {
    setError(null)
    const { headers, rows } = parseCSV(text)
    if (headers.length === 0) {
      setError('Die Datei scheint leer zu sein.')
      return
    }
    const format = detectFormat(headers)
    setDetectedFormat(format)

    if (format === 'unknown') {
      setError(
        'Das Format konnte nicht erkannt werden. Unterstützte Formate: Athena, Sparkasse, DKB, ING, Raiffeisenbank.'
      )
      return
    }

    const mapped = mapRows(format, headers, rows).filter(
      (r) => r.date && r.amount !== 0
    )
    if (mapped.length === 0) {
      setError('Es wurden keine gültigen Transaktionen gefunden.')
      return
    }
    setMappedRows(mapped)
    setStep(2)
  }

  function handleFile(file: File) {
    // Read as Latin-1 first; covers most German bank exports (Sparkasse, DKB, etc.)
    // For UTF-8 files (Athena export) Latin-1 is a no-op for ASCII content.
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      handleFileContent(text)
    }
    reader.onerror = () => setError('Fehler beim Lesen der Datei.')
    reader.readAsText(file, 'windows-1252')
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

  async function handleImport() {
    setIsImporting(true)
    setError(null)
    try {
      const res = await fetch('/api/import/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, rows: mappedRows }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Import fehlgeschlagen.')
        return
      }
      setOpen(false)
      reset()
      if (onSuccess) {
        onSuccess()
      } else {
        window.location.reload()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler.')
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="size-4 mr-1.5" />
          CSV Import
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Transaktionen importieren – {accountName}
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Unterstützte Formate: Athena, Sparkasse, DKB, ING, Raiffeisenbank
            </p>

            {/* Drag & Drop Zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed
                cursor-pointer p-10 transition-colors
                ${isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-muted/30'
                }
              `}
            >
              <Upload className="size-8 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium">CSV-Datei hier ablegen</p>
                <p className="text-xs text-muted-foreground mt-1">oder klicken zum Auswählen (.csv, .txt)</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={onFileChange}
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4 min-h-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                Erkanntes Format: {formatLabel(detectedFormat)}
              </span>
              <span className="text-sm text-muted-foreground">
                {mappedRows.length} Transaktionen werden importiert
              </span>
            </div>

            {/* Preview table */}
            <div className="rounded-lg border border-border overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Datum</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Betrag</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground hidden sm:table-cell">Beschreibung</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground hidden sm:table-cell">Händler</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground hidden md:table-cell">Kategorie</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {mappedRows.slice(0, 10).map((row, i) => (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{row.date}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-medium ${row.amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {row.amount >= 0 ? '+' : ''}{row.amount.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 max-w-[150px] truncate text-muted-foreground hidden sm:table-cell">
                        {row.description || '—'}
                      </td>
                      <td className="px-3 py-2 max-w-[120px] truncate hidden sm:table-cell">
                        {row.merchant || '—'}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">
                        {row.category_name || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {mappedRows.length > 10 && (
                <p className="px-3 py-2 text-xs text-muted-foreground border-t border-border">
                  … und {mappedRows.length - 10} weitere
                </p>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <div className="flex items-center justify-between pt-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setStep(1); setError(null) }}
                disabled={isImporting}
              >
                Zurück
              </Button>
              <Button
                size="sm"
                onClick={handleImport}
                disabled={isImporting}
              >
                {isImporting ? 'Importiere…' : `${mappedRows.length} Transaktionen importieren`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
