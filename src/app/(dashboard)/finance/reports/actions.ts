'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parseInput, issueMessage } from '@/lib/api/validate'
import { uuid } from '@/lib/api/schemas'
import { createClient } from '@/lib/supabase/server'
import { buildReportData, yearPeriod } from '@/lib/reports/build'
import { renderReportHtml } from '@/lib/reports/render-html'
import { renderReportPdf } from '@/lib/reports/render-pdf'
import { persistReport, markReportSent } from '@/lib/reports/store'
import { sendReportEmail } from '@/lib/reports/email'
import { getReportForEmail, getReportPdfPath } from '@/lib/data/finance-budget'

const annualArgs = z.object({
  year: z.number().int().min(2000).max(2100),
  opts: z.object({ sendEmail: z.boolean().optional(), includeTax: z.boolean().optional() }).optional(),
})

/**
 * Jahresreport wird NICHT automatisch erzeugt — Eric will vor dem Versand noch etwas prüfen
 * können (siehe Chat-Vorgabe). Läuft deshalb ausschließlich über diesen Button, mit dem
 * user-scoped Client statt der Service-Role: RLS auf `reports` und dem Storage-Bucket greift
 * hier also normal, kein Sonderpfad nötig.
 */
export async function generateAnnualReport(
  year: number,
  opts?: { sendEmail?: boolean; includeTax?: boolean },
): Promise<{ success: true; reportId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const args = parseInput(annualArgs, { year, opts })
  if (!args.ok) return { error: issueMessage(args) }

  const period = yearPeriod(year)
  const title  = `Jahresreport ${period.label}`

  try {
    const data      = await buildReportData(supabase, user.id, period, { includeTax: opts?.includeTax })
    const html     = renderReportHtml(data)
    const pdfBuffer = await renderReportPdf(data)

    const { id } = await persistReport(supabase, user.id, {
      type:        'annual',
      periodStart: period.periodStart,
      periodEnd:   period.periodEnd,
      title,
      html,
      data,
      pdfBuffer,
    })

    if (opts?.sendEmail && user.email) {
      await sendReportEmail({ to: user.email, subject: title, html, pdfBuffer, pdfFilename: `${title}.pdf` })
      await markReportSent(supabase, id)
    }

    revalidatePath('/finance/reports')
    return { success: true, reportId: id }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Jahresreport fehlgeschlagen' }
  }
}

export async function sendExistingReportEmail(reportId: string): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  if (!user.email) return { error: 'Kein E-Mail-Adresse am Konto hinterlegt' }
  const idP = parseInput(uuid, reportId)
  if (!idP.ok) return { error: issueMessage(idP) }

  const { data: report, error } = await getReportForEmail(supabase, user.id, reportId)
  if (error || !report) return { error: 'Report nicht gefunden' }

  const { data: pdfBlob, error: downloadErr } = await supabase.storage
    .from('reports')
    .download(report.pdf_path as string)
  if (downloadErr || !pdfBlob) return { error: 'PDF konnte nicht geladen werden' }

  const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer())

  try {
    await sendReportEmail({
      to:          user.email,
      subject:     report.title,
      html:        report.html,
      pdfBuffer,
      pdfFilename: `${report.title}.pdf`,
    })
    await markReportSent(supabase, reportId)
    revalidatePath('/finance/reports')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Mail-Versand fehlgeschlagen' }
  }
}

export async function getReportDownloadUrl(reportId: string): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const idP = parseInput(uuid, reportId)
  if (!idP.ok) return { error: issueMessage(idP) }

  const { data: report, error } = await getReportPdfPath(supabase, user.id, reportId)
  if (error || !report?.pdf_path) return { error: 'Report nicht gefunden' }

  const { data: signed, error: signErr } = await supabase.storage
    .from('reports')
    .createSignedUrl(report.pdf_path as string, 60 * 5)
  if (signErr || !signed) return { error: 'Signierter Link fehlgeschlagen' }

  return { url: signed.signedUrl }
}
