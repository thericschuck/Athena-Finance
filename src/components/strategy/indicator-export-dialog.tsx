'use client'

import { useState, useRef } from 'react'
import { Download, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export function IndicatorExportDialog() {
  const [open, setOpen] = useState(false)
  const [withBacktests, setWithBacktests] = useState(false)

  function handleExport() {
    const url = `/api/export/indicators?with_backtests=${withBacktests}`
    window.location.href = url
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="size-4 mr-1.5" />
          Export
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Indikatoren exportieren</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={withBacktests}
              onChange={(e) => setWithBacktests(e.target.checked)}
              className="size-4 rounded border-border accent-primary"
            />
            <span className="text-sm">Backtests mit exportieren</span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button size="sm" onClick={handleExport}>
              <Download className="size-4 mr-1.5" />
              Exportieren
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── CSV columns we accept (case-insensitive) ────────────────────────────────
const BOOL_COLS = new Set(['repaints', 'is_forbidden'])

type ParsedRow = {
  name: string
  author?: string
  type?: string
  subtype?: string
  tv_url?: string
  repaints?: boolean
  is_forbidden?: boolean
  forbidden_reason?: string
  notes?: string
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []

  // Auto-detect separator
  const sep = lines[0].includes(';') ? ';' : ','

  const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase())

  return lines.slice(1).flatMap(line => {
    const cells = line.split(sep).map(c => c.trim().replace(/^"|"$/g, ''))
    if (cells.every(c => c === '')) return []

    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = cells[i] ?? '' })

    if (!row['name']) return []

    const parsed: ParsedRow = { name: row['name'] }
    if (row['author'])           parsed.author           = row['author']
    if (row['type'])             parsed.type             = row['type']
    if (row['subtype'])          parsed.subtype          = row['subtype']
    if (row['tv_url'])           parsed.tv_url           = row['tv_url']
    if (row['forbidden_reason']) parsed.forbidden_reason = row['forbidden_reason']
    if (row['notes'])            parsed.notes            = row['notes']

    for (const col of BOOL_COLS) {
      if (row[col] !== undefined) {
        (parsed as Record<string, unknown>)[col] = ['1', 'true', 'ja', 'yes'].includes(row[col].toLowerCase())
      }
    }

    return [parsed]
  })
}

export function IndicatorImportDialog() {
  const [open, setOpen]       = useState(false)
  const [rows, setRows]       = useState<ParsedRow[]>([])
  const [dragging, setDragging] = useState(false)
  const [status, setStatus]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const parsed = parseCSV(text)
      setRows(parsed)
      setStatus(parsed.length === 0 ? 'Keine gültigen Zeilen gefunden.' : null)
    }
    reader.readAsText(file, 'utf-8')
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  async function handleImport() {
    if (rows.length === 0) return
    setLoading(true)
    setStatus(null)
    try {
      const res = await fetch('/api/import/indicators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ indicators: rows }),
      })
      const json = await res.json()
      if (!res.ok) {
        setStatus(`Fehler: ${json.error ?? 'Unbekannt'}`)
      } else {
        setStatus(`${json.imported_indicators} Indikatoren importiert.`)
        setRows([])
        // Refresh page to show new indicators
        setTimeout(() => { window.location.reload() }, 800)
      }
    } catch {
      setStatus('Netzwerkfehler beim Import.')
    } finally {
      setLoading(false)
    }
  }

  function onOpenChange(v: boolean) {
    setOpen(v)
    if (!v) { setRows([]); setStatus(null) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="size-4 mr-1.5" />
          Import
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Indikatoren importieren</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4 pt-2">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg px-6 py-8 text-center cursor-pointer transition-colors
              ${dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'}`}
          >
            <Upload className="size-6 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">CSV-Datei ablegen oder klicken</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Spalten: name, author, type, subtype, tv_url, repaints, is_forbidden, forbidden_reason, notes
            </p>
            <input ref={inputRef} type="file" className="hidden" onChange={onFileChange} />
          </div>

          {/* Preview table */}
          {rows.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-muted-foreground text-left">
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Author</th>
                      <th className="px-3 py-2 font-medium">Typ</th>
                      <th className="px-3 py-2 font-medium">Subtyp</th>
                      <th className="px-3 py-2 font-medium text-center">Repaints</th>
                      <th className="px-3 py-2 font-medium text-center">Verboten</th>
                      <th className="px-3 py-2 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className={i < rows.length - 1 ? 'border-b border-border' : ''}>
                        <td className="px-3 py-2 font-medium max-w-[140px] truncate">{r.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.author ?? '—'}</td>
                        <td className="px-3 py-2">{r.type ?? '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.subtype ?? '—'}</td>
                        <td className="px-3 py-2 text-center">{r.repaints ? '✓' : '—'}</td>
                        <td className="px-3 py-2 text-center">{r.is_forbidden ? '✓' : '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[140px] truncate">{r.notes ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {status && (
            <p className={`text-sm ${status.startsWith('Fehler') ? 'text-destructive' : 'text-muted-foreground'}`}>
              {status}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-border mt-2">
          <span className="text-sm text-muted-foreground">
            {rows.length > 0 ? `${rows.length} Zeilen erkannt` : ''}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button size="sm" onClick={handleImport} disabled={rows.length === 0 || loading}>
              <Upload className="size-4 mr-1.5" />
              {loading ? 'Importieren…' : `${rows.length} importieren`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
