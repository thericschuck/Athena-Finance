/**
 * Persistiert einen fertig gerenderten Report: PDF in den Storage-Bucket `reports`
 * (Pfad `{user_id}/{type}-{periodStart}.pdf`, gleiches Muster wie `belege`/`valuables`),
 * HTML + Rohdaten in die Tabelle `reports`. `upsert` auf (user_id, type, period_start) macht
 * einen erneuten Lauf für denselben Zeitraum idempotent — ein zweiter Cron-Tick am selben Tag
 * ersetzt den Report, statt einen zweiten anzulegen.
 */
import type { ReportData, ReportType } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export async function persistReport(
  supabase: SupabaseClient<Database>,
  userId: string,
  args: {
    type:        ReportType
    periodStart: string
    periodEnd:   string
    title:       string
    html:        string
    data:        ReportData
    pdfBuffer:   Buffer
  },
): Promise<{ id: string; pdfPath: string }> {
  const pdfPath = `${userId}/${args.type}-${args.periodStart}.pdf`

  const { error: uploadErr } = await supabase.storage
    .from('reports')
    .upload(pdfPath, args.pdfBuffer, { contentType: 'application/pdf', upsert: true })
  if (uploadErr) throw new Error(uploadErr.message)

  const { data: row, error } = await supabase
    .from('reports')
    .upsert({
      user_id:      userId,
      type:         args.type,
      period_start: args.periodStart,
      period_end:   args.periodEnd,
      title:        args.title,
      html:         args.html,
      data:         args.data,
      pdf_path:     pdfPath,
      generated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,type,period_start' })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  return { id: row.id as string, pdfPath }
}

export async function markReportSent(
  supabase: SupabaseClient<Database>,
  reportId: string,
): Promise<void> {
  await supabase.from('reports').update({ sent_at: new Date().toISOString() }).eq('id', reportId)
}
