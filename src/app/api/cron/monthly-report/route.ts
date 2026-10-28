import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { buildReportData, monthPeriod } from '@/lib/reports/build'
import { renderReportHtml } from '@/lib/reports/render-html'
import { renderReportPdf } from '@/lib/reports/render-pdf'
import { persistReport, markReportSent } from '@/lib/reports/store'
import { sendReportEmail } from '@/lib/reports/email'
import { requireCron } from '@/lib/api/auth'
import { bestimmeReportZiele } from '@/lib/reports/ziele'

// PDF-Rendering (react-pdf) plus ein Mail-Versand mit Anhang — großzügiger als die reinen
// Datenbank-Crons, aber deutlich unter dem Limit von /api/assistant.
export const maxDuration = 120

/**
 * GET /api/cron/monthly-report
 *
 * Läuft am 1. jedes Monats für den soeben abgelaufenen Monat. Mit REPORT_USER_ID (+ REPORT_RECIPIENT_EMAIL) für genau
 * einen Nutzer (bisheriges Verhalten); ohne REPORT_USER_ID für jeden Nutzer mit Konto, Empfänger aus auth.users.
 * ACHTUNG Haushalt: Fehlt REPORT_USER_ID, geht der Report per Mail an ALLE Nutzer mit Konto, also auch an den Testaccount bzw.
 * später Malik. Reports sind owner-only (je Nutzer nur eigene Daten). Vor Phase 4 REPORT_USER_ID setzen, wenn das nicht gewollt ist.
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

  const today = new Date()
  const prevMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))
  const year  = prevMonth.getUTCFullYear()
  const month = prevMonth.getUTCMonth() + 1
  const period = monthPeriod(year, month)
  const title = `Monatsreport ${period.label}`

  const supabase = createAdminClient()

  // Mit REPORT_USER_ID (+ REPORT_RECIPIENT_EMAIL) wie bisher genau ein Nutzer. Ohne beide Variablen: Schleife ueber alle
  // Nutzer mit Konto; die Empfaengeradresse kommt dann aus auth.users (Admin-API). Siehe lib/reports/ziele.ts.
  const envUser = process.env.REPORT_USER_ID
  const envRecipient = process.env.REPORT_RECIPIENT_EMAIL
  let kandidaten: string[] = []
  if (!envUser) {
    const { data: konten, error } = await supabase.from('accounts').select('user_id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    kandidaten = (konten ?? []).map(k => k.user_id)
  }
  const ziele = bestimmeReportZiele({ userId: envUser, recipient: envRecipient }, kandidaten)
  if (ziele.length === 0) {
    return NextResponse.json(
      { error: 'REPORT_USER_ID / REPORT_RECIPIENT_EMAIL nicht konfiguriert und kein Nutzer mit Konto gefunden' },
      { status: 500 },
    )
  }

  const sendeFuer = async (userId: string, recipientVorgabe: string | null) => {
    let recipient = recipientVorgabe
    if (!recipient) {
      const { data, error } = await supabase.auth.admin.getUserById(userId)
      recipient = data?.user?.email ?? null
      if (!recipient) throw new Error(error?.message ?? 'Keine E-Mail-Adresse am Konto hinterlegt')
    }

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
    return { reportId: id, reminderCreated }
  }

  // Ein-Ziel-Fall (Env gesetzt): Antwortformat und Statuscodes unveraendert.
  if (envUser) {
    try {
      const { reportId, reminderCreated } = await sendeFuer(ziele[0].userId, ziele[0].recipient)
      return NextResponse.json({ ok: true, reportId, period: period.label, reminderCreated })
    } catch (err) {
      return NextResponse.json({
        ok:    false,
        error: err instanceof Error ? err.message : 'Monatsreport fehlgeschlagen',
      }, { status: 500 })
    }
  }

  // Mehrpersonen-Betrieb: nacheinander, ein Fehler bricht die uebrigen nicht ab. Reports sind owner-only (je Person).
  const results: Record<string, unknown>[] = []
  for (const z of ziele) {
    try {
      results.push({ user_id: z.userId, ...(await sendeFuer(z.userId, z.recipient)) })
    } catch (e) {
      results.push({ user_id: z.userId, error: e instanceof Error ? e.message : 'Monatsreport fehlgeschlagen' })
    }
  }
  const failed = results.filter(r => 'error' in r).length
  return NextResponse.json({ ok: failed === 0, period: period.label, results }, { status: failed === 0 ? 200 : 207 })
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
