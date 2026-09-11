'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Download, Mail, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import { generateAnnualReport, sendExistingReportEmail, getReportDownloadUrl } from './actions'
import type { ReportRow } from './page'

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

interface Props {
  reports:       ReportRow[]
  reminder:      { title: string; body: string | null } | null
  suggestedYear: number
}

export function ReportsClient({ reports, reminder, suggestedYear }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [viewing, setViewing] = useState<ReportRow | null>(null)

  const monthly = reports.filter(r => r.type === 'monthly')
  const annual  = reports.filter(r => r.type === 'annual')

  const handleGenerateAnnual = () => {
    setError(null)
    startTransition(async () => {
      const result = await generateAnnualReport(suggestedYear)
      if ('error' in result) setError(result.error)
      else router.refresh()
    })
  }

  const handleDownload = async (id: string) => {
    setBusyId(id)
    setError(null)
    try {
      const result = await getReportDownloadUrl(id)
      if ('error' in result) setError(result.error)
      else window.open(result.url, '_blank')
    } finally {
      setBusyId(null)
    }
  }

  const handleSendEmail = async (id: string) => {
    setBusyId(id)
    setError(null)
    try {
      const result = await sendExistingReportEmail(id)
      if ('error' in result) setError(result.error)
      else router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Monatsreports laufen automatisch am 1. jedes Monats und werden per Mail zugeschickt.
          Der Jahresreport wird bewusst nur manuell angestoßen.
        </p>
      </div>

      {reminder && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 space-y-1">
          <div className="text-sm font-medium">{reminder.title}</div>
          {reminder.body && <div className="text-sm text-muted-foreground">{reminder.body}</div>}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Jahresreport</h2>
        <div className="rounded-lg border border-border bg-card px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm text-muted-foreground">
            Fasst das ganze Jahr {suggestedYear} zusammen — vor dem Versand in Ruhe prüfbar.
          </p>
          <Button onClick={handleGenerateAnnual} disabled={isPending} size="sm">
            {isPending
              ? <Loader2 className="size-4 animate-spin" />
              : <Sparkles className="size-4" />}
            Jahresreport {suggestedYear} erstellen
          </Button>
        </div>
      </section>

      <ReportList title="Jahresreports" rows={annual} busyId={busyId}
        onView={setViewing} onDownload={handleDownload} onSendEmail={handleSendEmail} />
      <ReportList title="Monatsreports" rows={monthly} busyId={busyId}
        onView={setViewing} onDownload={handleDownload} onSendEmail={handleSendEmail} />

      <Sheet open={viewing !== null} onOpenChange={open => !open && setViewing(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl p-0">
          <SheetHeader className="px-4 pt-4">
            <SheetTitle>{viewing?.title}</SheetTitle>
            <SheetDescription>
              {viewing && `${fmtDate(viewing.period_start)} – ${fmtDate(viewing.period_end)}`}
            </SheetDescription>
          </SheetHeader>
          {viewing && (
            <iframe
              title={viewing.title}
              srcDoc={viewing.html}
              className="w-full flex-1 border-0"
              sandbox=""
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function ReportList({
  title, rows, busyId, onView, onDownload, onSendEmail,
}: {
  title:       string
  rows:        ReportRow[]
  busyId:      string | null
  onView:      (r: ReportRow) => void
  onDownload:  (id: string) => void
  onSendEmail: (id: string) => void
}) {
  if (rows.length === 0) return null
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {rows.map(r => (
          <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap">
            <div>
              <div className="text-sm font-medium">{r.title}</div>
              <div className="text-xs text-muted-foreground">
                Erzeugt am {fmtDate(r.generated_at)}
                {r.sent_at ? ` · per Mail verschickt am ${fmtDate(r.sent_at)}` : ' · noch nicht verschickt'}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => onView(r)}>
                <FileText className="size-4" /> Ansehen
              </Button>
              <Button variant="ghost" size="sm" disabled={busyId === r.id} onClick={() => onDownload(r.id)}>
                <Download className="size-4" /> PDF
              </Button>
              <Button variant="ghost" size="sm" disabled={busyId === r.id} onClick={() => onSendEmail(r.id)}>
                <Mail className="size-4" /> {r.sent_at ? 'Erneut senden' : 'Per Mail senden'}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
