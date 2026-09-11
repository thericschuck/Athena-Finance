import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/server'
import { ReportsClient } from './ReportsClient'

export type ReportRow = {
  id:           string
  type:         'monthly' | 'annual'
  period_start: string
  period_end:   string
  title:        string
  html:         string
  sent_at:      string | null
  generated_at: string
}

export default async function ReportsPage() {
  const { supabase, user } = await getAuthUser()
  if (!user) redirect('/login')

  const [{ data: reports }, { data: reminder }] = await Promise.all([
    supabase
      .from('reports')
      .select('id, type, period_start, period_end, title, html, sent_at, generated_at')
      .eq('user_id', user.id)
      .order('period_start', { ascending: false }),
    supabase
      .from('insights')
      .select('id, title, body, payload')
      .eq('user_id', user.id)
      .eq('type', 'annual_report_reminder')
      .is('dismissed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const lastFullYear = new Date().getFullYear() - 1

  return (
    <ReportsClient
      reports={(reports ?? []) as ReportRow[]}
      reminder={reminder ? { title: reminder.title, body: reminder.body } : null}
      suggestedYear={lastFullYear}
    />
  )
}
