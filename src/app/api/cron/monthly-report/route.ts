import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { buildReportData, monthPeriod } from '@/lib/reports/build'
import { renderReportHtml } from '@/lib/reports/render-html'
import { renderReportPdf } from '@/lib/reports/render-pdf'
import { persistReport, markReportSent } from '@/lib/reports/store'
import { sendReportEmail } from '@/lib/reports/email'
import { requireCron } from '@/lib/api/auth'

// PDF-Rendering (react-pdf) plus ein Mail-Versand mit Anhang — großzügiger als die reinen
// Datenbank-Crons, aber deutlich unter dem Limit von /api/assistant.
export const maxDuration = 120

function adminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * GET /api/cron/monthly-report
 *
 * Läuft am 1. jedes Monats für den soeben abgelaufenen Monat — einziger echter Nutzer wie
 * beim Bank-Sync-Cron, deshalb dasselbe Single-Tenant-Muster über feste Env-Vars statt einer
 * Nutzerschleife (siehe BANK_SYNC_USER_ID in /api/cron/bank-sync).
 *
 * Nach dem Dezember-Lauf legt sie zusätzlich einen Hinweis an, der an den Jahresreport
 * erinnert — ein direkter Write in `insights`, kein Athena-Werkzeugaufruf und damit ohne
 * Bestätigungspflicht, weil hier keine Bank-Freitexte verarbeitet werden und der Hinweis
 * jederzeit über `dismissInsight` wieder verschwindet (siehe docs/athenas-takt.html,
 * Abschnitt III).
 */
export async function GET(req: NextRequest) {
  const denied = requireCron(req)
  if (denied) return denied

  const userId    = process.env.REPORT_USER_ID
  const recipient = process.env.REPORT_RECIPIENT_EMAIL
  if (!userId || !recipient) {
    return NextResponse.json(
      { error: 'REPORT_USER_ID / REPORT_RECIPIENT_EMAIL nicht konfiguriert' },
      { status: 500 },
    )
  }

  const today = new Date()
  const prevMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))
  const year  = prevMonth.getUTCFullYear()
  const month = prevMonth.getUTCMonth() + 1
  const period = monthPeriod(year, month)
  const title = `Monatsreport ${period.label}`

  const supabase = adminClient()

  try {
    const data      = await buildReportData(supabase, userId, period)
    const html      = renderReportHtml(data)
    const pdfBuffer = await renderReportPdf(data)

    const { id } = await persistReport(supabase, userId, {
      type:        'monthly',
      periodStart: period.periodStart,
      periodEnd:   period.periodEnd,
      title,
      html,
      data,
      pdfBuffer,
    })

    await sendReportEmail({
      to:          recipient,
      subject:     title,
      html,
      pdfBuffer,
      pdfFilename: `${title}.pdf`,
    })
    await markReportSent(supabase, id)

    const reminderCreated = month === 12
      ? await ensureAnnualReportReminder(supabase, userId, year)
      : false

    return NextResponse.json({ ok: true, reportId: id, period: period.label, reminderCreated })
  } catch (err) {
    return NextResponse.json({
      ok:    false,
      error: err instanceof Error ? err.message : 'Monatsreport fehlgeschlagen',
    }, { status: 500 })
  }
}

async function ensureAnnualReportReminder(
  supabase: SupabaseClient<Database>,
  userId: string,
  year: number,
): Promise<boolean> {
  const { data: existing } = await supabase
    .from('insights')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'annual_report_reminder')
    .contains('payload', { year })
    .maybeSingle()
  if (existing) return false

  const { error } = await supabase.from('insights').insert({
    user_id:  userId,
    type:     'annual_report_reminder',
    severity: 'info',
    title:    `Jahresreport ${year} jetzt erstellen`,
    body:     'Alle zwölf Monatsreports liegen vor — der Jahresreport lässt sich jetzt unter '
            + 'Finance → Reports manuell anstoßen und vor dem Versand noch prüfen.',
    payload:  { year },
  })
  return !error
}
