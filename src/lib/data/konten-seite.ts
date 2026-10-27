import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { ScopeContext } from '@/lib/haushalt/scope'
import {
  getAccounts,
  getBankBalances,
  getLetzteBuchungen,
  getManualBalanceSums,
  getUnifiedBalanceSums,
} from '@/lib/data/finance-accounts'
import { fetchBalanceHistory } from '@/lib/account-history'
import { computeAccountBalances } from '@/lib/finance/dashboard-calc'
import { baueKontoZeilen, type BankInfo } from '@/lib/konten/berechnen'
import type { KontoVerlauf, KontoZeile } from '@/lib/konten/typen'
import { getSettings } from '@/lib/settings'
import { getDepotsSummaries, type DepotWithSummary } from '@/app/actions/depot'
import { periodCutoff, type Period } from '@/lib/period'

/**
 * Daten der Konten-Liste (`/finance/accounts`). Alles in einer Welle: keine Abfrage hängt vom
 * Ergebnis einer anderen ab (Begründung der Saldenhistorie in `fetchBalanceHistory`).
 *
 * Der Kontostand eines bankverknüpften Kontos ist der von der Bank gemeldete (FinTS liefert nur ein
 * Zeitfenster, die Buchungssumme wäre falsch); bei den übrigen die Summe der manuellen Buchungen.
 * Zusätzlich die Summe ALLER Buchungen, um die Abweichung zum Bank-Saldo zu zeigen.
 */
export interface KontenSeitenDaten {
  period: Period
  zeilen: KontoZeile[]
  depots: DepotWithSummary[]
  locale: string
}

type DB = SupabaseClient<Database>

export async function ladeKontenSeite(supabase: DB, ctx: ScopeContext, period: Period): Promise<KontenSeitenDaten> {
  const cutoff = periodCutoff(period)
  const [konten, manuell, bank, unified, settings, depots, history] = await Promise.all([
    getAccounts(supabase, ctx),
    getManualBalanceSums(supabase, ctx),
    getBankBalances(supabase, ctx),
    getUnifiedBalanceSums(supabase, ctx),
    getSettings(ctx.userId),
    getDepotsSummaries(),
    fetchBalanceHistory(supabase, { from: cutoff }),
  ])

  // Manuelle Konten: Frische = letzte Buchung. Bankkonten brauchen das nicht (Sync-Zeitpunkt).
  const letzteBuchung = await getLetzteBuchungen(
    supabase,
    ctx,
    konten.filter((k) => !k.bank_iban).map((k) => k.id),
  )

  const bankByIban = new Map<string, BankInfo>(
    bank.map((b) => [b.account_iban, { gebucht: Number(b.booked_balance), fetchedAt: b.fetched_at }]),
  )
  const salden = computeAccountBalances(
    konten,
    manuell,
    new Map([...bankByIban].map(([iban, b]) => [iban, b.gebucht])),
  )

  const verlauf = new Map<string, KontoVerlauf>()
  for (const row of history) {
    const e = verlauf.get(row.account_id)
    if (e) {
      e.values.push(row.balance)
      e.last = row.snapshot_date
    } else {
      verlauf.set(row.account_id, { values: [row.balance], first: row.snapshot_date, last: row.snapshot_date })
    }
  }

  return {
    period,
    zeilen: baueKontoZeilen({
      konten,
      salden,
      buchungssummen: new Map(unified.map((u) => [u.account_id, Number(u.balance)])),
      bankByIban,
      letzteBuchung,
      verlauf,
    }),
    depots,
    locale: (settings.number_format as string) ?? 'de-DE',
  }
}
