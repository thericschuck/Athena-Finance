import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { BewegungFlow, BewegungSnapshot } from '@/lib/verlauf/bewegung'

type Client = SupabaseClient<Database>

const PAGE = 1000
const MAX_PAGES = 10

/**
 * Tägliche Snapshots (aufsteigend). Seitenweise: PostgREST kappt jede Antwort still bei 1.000
 * Zeilen, und die Tage summieren sich über die Jahre.
 */
export async function getBewegungSnapshots(supabase: Client, userId: string): Promise<BewegungSnapshot[]> {
  const out: BewegungSnapshot[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from('net_worth_snapshots')
      .select('snapshot_date, net_worth, total_depot, total_crypto')
      .eq('user_id', userId)
      .order('snapshot_date', { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1)
    if (error) throw new Error(`net_worth_snapshots: ${error.message}`)
    if (!data || data.length === 0) break
    for (const r of data) {
      out.push({
        datum: String(r.snapshot_date).slice(0, 10),
        net_worth: Number(r.net_worth ?? 0),
        total_depot: Number(r.total_depot ?? 0),
        total_crypto: Number(r.total_crypto ?? 0),
      })
    }
    if (data.length < PAGE) break
  }
  return out
}

/** Monatssummen je Art aus `monthly_flow_totals` (eine Zeile je Monat, also klein). */
export async function getBewegungFlows(supabase: Client, userId: string): Promise<BewegungFlow[]> {
  const { data, error } = await supabase
    .from('monthly_flow_totals')
    .select('month, echt_income, echt_expense, anlage_income, anlage_expense')
    .eq('user_id', userId)
    .order('month', { ascending: true })
    .limit(PAGE)
  if (error) throw new Error(`monthly_flow_totals: ${error.message}`)
  const n = (v: number | null) => Number(v ?? 0)
  return (data ?? []).map(r => ({
    month: String(r.month).slice(0, 10),
    echt_income: n(r.echt_income),
    echt_expense: n(r.echt_expense),
    anlage_income: n(r.anlage_income),
    anlage_expense: n(r.anlage_expense),
  }))
}
