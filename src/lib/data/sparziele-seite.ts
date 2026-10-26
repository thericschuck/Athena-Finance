import { requireAuthUser } from '@/lib/supabase/server'
import { getSettings } from '@/lib/settings'
import { getSavingsGoals } from '@/lib/data/finance-planning'
import { heuteBerlin } from '@/lib/transaktionen/formular'
import { kennzahlen, phaseVon, sortiereOffene, type Kennzahlen, type ZielDaten } from '@/lib/sparziele/berechnen'

/** Ziel mit Notiz (fuer das Bearbeiten-Formular). */
export type Ziel = ZielDaten & { notes: string | null }

export interface SparzieleSeite {
  heute: string
  locale: string
  dateFormat: string
  offen: Ziel[]
  erreicht: Ziel[]
  beendet: Ziel[]
  k: Kennzahlen
  gesamt: number
}

/** Alle Daten der Sparziele-Seite: Ziele des Nutzers, nach Phase getrennt und sortiert, plus Kennzahlen. */
export async function ladeSparzieleSeite(): Promise<SparzieleSeite> {
  const { supabase, user } = await requireAuthUser()
  const [rows, settings] = await Promise.all([
    getSavingsGoals(supabase, user!.id),
    getSettings(user!.id),
  ])
  const heute = heuteBerlin()
  // numeric kommt je nach Treiber als Text: einmal sauber in Zahlen wandeln
  const ziele: Ziel[] = rows.map(r => ({
    id: r.id,
    notes: r.notes,
    description: r.description,
    status: r.status,
    priority: r.priority,
    target_amount: Number(r.target_amount),
    current_amount: Number(r.current_amount ?? 0),
    target_date: r.target_date,
    monthly_savings_rate: r.monthly_savings_rate === null ? null : Number(r.monthly_savings_rate),
    savings_rate_start_date: r.savings_rate_start_date,
  }))
  return {
    heute,
    locale: (settings.number_format as string) ?? 'de-DE',
    dateFormat: (settings.date_format as string) ?? 'dd.MM.yyyy',
    offen: sortiereOffene(ziele.filter(z => phaseVon(z) === 'offen')),
    erreicht: ziele.filter(z => phaseVon(z) === 'erreicht'),
    beendet: ziele.filter(z => phaseVon(z) === 'beendet'),
    k: kennzahlen(ziele, heute),
    gesamt: ziele.length,
  }
}
