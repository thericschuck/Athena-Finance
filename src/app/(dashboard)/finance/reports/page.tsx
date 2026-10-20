import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/server'
import { ReportsClient } from './ReportsClient'
import { getReports, getAnnualReportReminder } from '@/lib/data/finance-budget'

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

  const [reports, reminder] = await Promise.all([
    getReports(supabase, user.id),
    getAnnualReportReminder(supabase, user.id),
  ])

  const lastFullYear = new Date().getFullYear() - 1

  return (
    <ReportsClient
      reports={reports as ReportRow[]}
      reminder={reminder ? { title: reminder.title, body: reminder.body } : null}
      suggestedYear={lastFullYear}
    />
  )
}
