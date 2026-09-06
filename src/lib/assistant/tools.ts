import { tool } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'
import {
  WRITE_ACTIONS,
  describeWriteAction,
  validateWriteAction,
  type WriteActionName,
} from '@/lib/assistant/actions'
import type { AiLogger } from '@/lib/assistant/logger'
import { KATEGORIEN } from '@/lib/valuables'

type DB = SupabaseClient<Database>

/**
 * Harte Obergrenze für zeilenbasierte Tools — unabhängig davon, was das
 * Modell anfragt (siehe Plan, "Zeilenbasierte Tools vs. Aggregat-Tools").
 * Kein Tool liest je mehr als das, egal welches `limit` im Input steht.
 */
const ROW_CAP = 200

/**
 * Markiert Freitextfelder aus Nutzer-/Bank-/Fremdquellen als ausdrücklich
 * NICHT vertrauenswürdig, bevor sie ins Tool-Ergebnis (und damit in den
 * Modell-Kontext) wandern — siehe Plan, "Prompt-Injection — konkrete
 * Gegenmaßnahmen". `merchant`/`description`/`notes`/... können Text
 * enthalten, den eine Bank oder der Nutzer selbst eingetragen hat; das
 * Feld heißt danach `untrusted_<name>` statt z. B. nur `description`,
 * damit der System-Prompt darauf verweisen kann, ohne dass das Modell den
 * Unterschied zwischen "Anweisung" und "Daten" selbst erraten muss.
 */
function untrust<T extends Record<string, unknown>>(row: T, fields: (keyof T)[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row }
  for (const field of fields) {
    const key = String(field)
    if (key in out) {
      out[`untrusted_${key}`] = out[key]
      delete out[key]
    }
  }
  return out
}

export type AthenaToolOptions = {
  /** Für Speicher-Schreibzugriffe und Aktionsvorschläge: an welche Konversation
      und welche Antwort-Nachricht sie gehängt werden. */
  conversationId: string
  messageId: string
  logger: AiLogger
  /** Aus ai_settings: darf Athena von sich aus Fakten speichern? */
  autoMemory: boolean
  /** Aus ai_settings: sind Speicher-Werkzeuge überhaupt verfügbar? */
  memoryEnabled: boolean
}

/**
 * Baut den vollständigen Werkzeuggürtel für EINEN authentifizierten Nutzer.
 *
 * Jedes Tool schließt über `supabase`/`userId` aus dem umgebenden Request — das
 * Zod-Input-Schema enthält deshalb bewusst KEIN `userId`/`accountId`-Feld, das
 * Modell kann fremde Daten also nicht einmal versuchen anzufragen, weil das
 * Schema es strukturell nicht zulässt. Pro Request neu aufgebaut, kein
 * modulweiter/geteilter Zustand zwischen Nutzern.
 *
 * Drei Klassen von Werkzeugen, mit absichtlich unterschiedlichem Risiko:
 *  - **Lesend** auf Finanzdaten: führen sofort aus.
 *  - **Speicher/Wissensbasis**: schreiben sofort, aber nur in Athenas eigene
 *    Notizen. Alles davon ist im UI sichtbar, editierbar und löschbar, und
 *    jeder Schreibzugriff steht im System-Log. Diese hinter eine Bestätigung zu
 *    setzen würde bedeuten, dass Eric jeden gemerkten Fakt einzeln wegklickt —
 *    der Preis wäre höher als das Risiko, das hier bei "eine Notiz ist falsch"
 *    liegt.
 *  - **Schreibend auf Finanzdaten**: führen NIE aus, sondern legen nur einen
 *    Vorschlag in ai_pending_actions an (siehe actions.ts).
 */
export function buildAthenaTools(supabase: DB, userId: string, options: AthenaToolOptions) {
  return {
    // ── Konten ─────────────────────────────────────────────────────────────
    getAccounts: tool({
      description:
        'Listet alle Konten des Nutzers (Giro, Tagesgeld, Bausparer, Geschäftsanteile, …) mit Typ, ' +
        'Währung, Institut und aktuellem Saldo. Für die Vermögensentwicklung über Zeit siehe getNetWorthTrend.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from('accounts')
          .select('id, name, type, currency, institution, is_active')
          .eq('user_id', userId)
          .order('sort_order')
        if (error) return { error: error.message }

        // Salden bewusst aus `account_balances` und nicht selbst nachgerechnet:
        // das ist dieselbe Tabelle, aus der fn_take_snapshot summiert. Eine zweite
        // Rechnung hier hätte genau den Effekt, den wir gerade abgestellt haben —
        // Athena nennt andere Zahlen als das Dashboard.
        const ids = (data ?? []).map(a => a.id)
        const saldoMap = new Map<string, { balance: number; stand: string }>()
        if (ids.length > 0) {
          const { data: balances } = await supabase
            .from('account_balances')
            .select('account_id, balance, snapshot_date')
            .in('account_id', ids)
            .order('snapshot_date', { ascending: false })
          // Absteigend sortiert — der erste Treffer je Konto ist der jüngste Stand.
          for (const b of balances ?? []) {
            if (!saldoMap.has(b.account_id)) {
              saldoMap.set(b.account_id, { balance: Number(b.balance), stand: b.snapshot_date })
            }
          }
        }

        return {
          accounts: (data ?? []).map(a => ({
            ...a,
            balance:      saldoMap.get(a.id)?.balance ?? null,
            balance_date: saldoMap.get(a.id)?.stand   ?? null,
          })),
        }
      },
    }),

    // ── Transaktionen (Detail, paginiert) ────────────────────────────────────
    getTransactions: tool({
      description:
        'Liest einzelne Buchungen in einem Zeitraum, optional gefiltert nach Kategorie/Konto/Typ. ' +
        'Für Fragen über längere Zeiträume ("wie hat sich mein Sparverhalten über 6 Monate entwickelt") ' +
        'ZUERST getSpendingSummary versuchen — das liefert kompakte Summen statt vieler Einzelzeilen. ' +
        'Dieses Tool ist für gezielte Detailsuche ("zeig mir die Buchung von Amazon letzte Woche").',
      inputSchema: z.object({
        startDate: z.string().describe('ISO-Datum (YYYY-MM-DD), inklusive'),
        endDate: z.string().describe('ISO-Datum (YYYY-MM-DD), inklusive'),
        categoryId: z.string().optional(),
        accountId: z.string().optional(),
        type: z.enum(['income', 'expense', 'transfer']).optional(),
        limit: z.number().int().min(1).max(ROW_CAP).default(50),
        offset: z.number().int().min(0).default(0),
      }),
      execute: async ({ startDate, endDate, categoryId, accountId, type, limit, offset }) => {
        const cappedLimit = Math.min(limit, ROW_CAP)
        // unified_transactions (see migration 20260821010000) merges in FinTS-synced bank
        // transactions for linked accounts, so the assistant sees the same picture as Finance.
        let query = supabase
          .from('unified_transactions')
          // `source` MUSS mit: categorizeTransactions braucht es, um beim
          // Schreiben die richtige Quelltabelle (transactions vs.
          // bank_transactions) zu treffen — die View führt beide zusammen.
          .select(
            'id, date, amount, signed_amount, currency, type, flow_kind, merchant, description, category_id, category_name, account_id, source',
            { count: 'exact' },
          )
          .eq('user_id', userId)
          .gte('date', startDate)
          .lte('date', endDate)
          .order('date', { ascending: false })
          .range(offset, offset + cappedLimit - 1)
        if (categoryId) query = query.eq('category_id', categoryId)
        if (accountId) query = query.eq('account_id', accountId)
        if (type) query = query.eq('type', type)

        const { data, error, count } = await query
        if (error) return { error: error.message }

        const items = (data ?? []).map((row) => untrust(row, ['merchant', 'description']))
        const total = count ?? items.length
        const hasMore = offset + items.length < total
        return {
          items,
          totalCount: total,
          hasMore,
          nextOffset: hasMore ? offset + cappedLimit : null,
          truncated: limit > ROW_CAP,
        }
      },
    }),

    // ── Ausgaben-Zusammenfassung (Aggregat) ──────────────────────────────────
    getSpendingSummary: tool({
      description:
        'Summiert Einnahmen/Ausgaben über einen Zeitraum, gruppiert nach Kategorie oder Monat — ' +
        'kompaktes Ergebnis unabhängig von der Zeitraumlänge. Der bevorzugte Weg für Planungsfragen ' +
        '("kann ich mir X leisten", "wie viel gebe ich normalerweise für Y aus").',
      inputSchema: z.object({
        startDate: z.string().describe('ISO-Datum (YYYY-MM-DD), inklusive'),
        endDate: z.string().describe('ISO-Datum (YYYY-MM-DD), inklusive'),
        groupBy: z.enum(['category', 'month']).default('category'),
      }),
      execute: async ({ startDate, endDate, groupBy }) => {
        const { data, error } = await supabase
          .from('unified_transactions')
          .select('amount, amount_base, type, date, category_id, category_name')
          .eq('user_id', userId)
          .gte('date', startDate)
          .lte('date', endDate)
          // Nur echte Einnahmen/Ausgaben. `neq('type','transfer')` reichte nicht:
          // Krypto-Kaeufe, Bauspar-Einzahlungen und Schuldenrueckzahlungen zaehlten
          // als Konsum mit — siehe unified_transactions.flow_kind.
          .eq('flow_kind', 'echt')
        if (error) return { error: error.message }

        const groups = new Map<string, { label: string; income: number; expense: number }>()
        for (const row of data ?? []) {
          if (row.date == null || row.amount == null || row.type == null) continue
          const key =
            groupBy === 'month'
              ? row.date.slice(0, 7)
              : (row.category_id ?? 'uncategorized')
          const label =
            groupBy === 'month'
              ? row.date.slice(0, 7)
              : (row.category_name ?? 'Ohne Kategorie')
          const entry = groups.get(key) ?? { label, income: 0, expense: 0 }
          const betrag = row.amount_base ?? row.amount
          if (row.type === 'income') entry.income += betrag
          else entry.expense += betrag
          groups.set(key, entry)
        }

        return {
          groupBy,
          groups: Array.from(groups.values()).sort((a, b) => b.expense - a.expense),
        }
      },
    }),

    // ── Verträge ─────────────────────────────────────────────────────────────
    getContracts: tool({
      description: 'Listet wiederkehrende Verträge (Miete, Versicherung, Abos, …) mit Frequenz, Betrag und Kündigungsfrist.',
      inputSchema: z.object({
        activeOnly: z.boolean().default(true),
        limit: z.number().int().min(1).max(ROW_CAP).default(100),
      }),
      execute: async ({ activeOnly, limit }) => {
        let query = supabase
          .from('contracts')
          .select('id, name, provider, type, frequency, amount, currency, start_date, end_date, notice_days, auto_renews, is_active')
          .eq('user_id', userId)
          .order('name')
          .limit(Math.min(limit, ROW_CAP))
        if (activeOnly) query = query.eq('is_active', true)
        const { data, error } = await query
        if (error) return { error: error.message }
        return { contracts: (data ?? []).map((row) => untrust(row, ['provider'])) }
      },
    }),

    // ── Schulden ──────────────────────────────────────────────────────────────
    getDebts: tool({
      description: 'Listet Schulden/Kredite (geliehen oder verliehen) mit ausstehendem Betrag, Zinssatz und monatlicher Rate.',
      inputSchema: z.object({
        activeOnly: z.boolean().default(true),
      }),
      execute: async ({ activeOnly }) => {
        let query = supabase
          .from('debts')
          .select('id, name, type, creditor, original_amount, outstanding, interest_rate, monthly_payment, due_date, is_active')
          .eq('user_id', userId)
          .order('outstanding', { ascending: false })
        if (activeOnly) query = query.eq('is_active', true)
        const { data, error } = await query
        if (error) return { error: error.message }
        return { debts: (data ?? []).map((row) => untrust(row, ['creditor'])) }
      },
    }),

    // ── Sparziele ─────────────────────────────────────────────────────────────
    getGoals: tool({
      description: 'Listet Sparziele mit Zielbetrag, aktuellem Stand, Zieldatum und monatlicher Sparrate.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from('savings_goals')
          .select('id, description, target_amount, current_amount, target_date, monthly_savings_rate, priority, status')
          .eq('user_id', userId)
          .order('priority')
        if (error) return { error: error.message }
        return { goals: (data ?? []).map((row) => untrust(row, ['description'])) }
      },
    }),

    // ── Fixkosten/Budget ──────────────────────────────────────────────────────
    getBudget: tool({
      description:
        'Liefert das Fixkosten-Budget: Budget-Kategorien mit monatlichem Rahmen, die einzelnen Budget-Posten ' +
        'darin, und die Einkommens-Zielvorgaben (Puffer/Steuer/Sparanteil) für die Mindestgehalt-Berechnung.',
      inputSchema: z.object({}),
      execute: async () => {
        const [categories, items, targets] = await Promise.all([
          supabase.from('budget_categories').select('id, name, monthly_budget').eq('user_id', userId).order('sort_order'),
          supabase.from('budget_items').select('id, category_id, name, unit_price, quantity, interval_days').eq('user_id', userId),
          supabase.from('income_targets').select('id, label, buffer_pct, tax_pct, savings_pct').eq('user_id', userId),
        ])
        if (categories.error) return { error: categories.error.message }
        if (items.error) return { error: items.error.message }
        if (targets.error) return { error: targets.error.message }
        return {
          categories: categories.data ?? [],
          items: (items.data ?? []).map((row) => untrust(row, ['name'])),
          incomeTargets: targets.data ?? [],
        }
      },
    }),

    // ── Depot ─────────────────────────────────────────────────────────────────
    getDepotHoldings: tool({
      description: 'Aktueller Depot-Bestand (per FinTS synchronisiert): Wertpapiere, Stückzahl, Kurswert.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from('depot_holdings')
          .select('isin, name, pieces, market_value, total_value, acquisition_price, currency, valuation_date')
          .eq('user_id', userId)
          .order('total_value', { ascending: false })
        if (error) return { error: error.message }
        return { holdings: (data ?? []).map((row) => untrust(row, ['name'])) }
      },
    }),

    // ── Crypto ────────────────────────────────────────────────────────────────
    getCryptoPortfolio: tool({
      description: 'Aktuelles Crypto-/Asset-Portfolio mit Menge, Einstandspreis und letztem bekannten Marktwert.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data: assets, error: assetsError } = await supabase
          .from('assets')
          .select('id, name, symbol, type, quantity, avg_buy_price, currency, portfolio_name')
          .eq('user_id', userId)
        if (assetsError) return { error: assetsError.message }
        if (!assets || assets.length === 0) return { assets: [] }

        const assetIds = assets.map((a) => a.id)
        const { data: valuations, error: valuationsError } = await supabase
          .from('asset_valuations')
          .select('asset_id, price_per_unit, total_value, valuation_date')
          .in('asset_id', assetIds)
          .order('valuation_date', { ascending: false })
        if (valuationsError) return { error: valuationsError.message }

        // Nur die jeweils neueste Bewertung pro Asset — valuations ist schon
        // nach valuation_date absteigend sortiert, der erste Treffer pro
        // asset_id gewinnt.
        const latestByAsset = new Map<string, { price_per_unit: number; total_value: number; valuation_date: string }>()
        for (const v of valuations ?? []) {
          if (!latestByAsset.has(v.asset_id)) latestByAsset.set(v.asset_id, v)
        }

        return {
          assets: assets.map((a) => ({
            ...a,
            latestValuation: latestByAsset.get(a.id) ?? null,
          })),
        }
      },
    }),

    // ── Vermögensverlauf (Aggregat, monatsweise verdichtet) ──────────────────
    getNetWorthTrend: tool({
      description:
        'Vermögensverlauf der letzten N Monate (Netto-Vermögen und Aufschlüsselung nach Konto/Depot/Crypto/Schulden), ' +
        'ein Wert pro Monat statt täglicher Rohdaten — geeignet für Trendfragen.',
      inputSchema: z.object({
        months: z.number().int().min(1).max(36).default(6),
      }),
      execute: async ({ months }) => {
        const since = new Date()
        since.setMonth(since.getMonth() - months)
        const sinceIso = since.toISOString().slice(0, 10)

        const { data, error } = await supabase
          .from('net_worth_snapshots')
          .select(
            'snapshot_date, net_worth, total_checking, total_investment, total_savings, total_cash, total_bausparer, total_depot, total_crypto, total_debts',
          )
          .eq('user_id', userId)
          .gte('snapshot_date', sinceIso)
          .order('snapshot_date', { ascending: true })
        if (error) return { error: error.message }

        // Ein Snapshot pro Monat statt jedem Tag — der letzte verfügbare
        // innerhalb des Monats gewinnt (überschreibt beim Durchlaufen in
        // aufsteigender Datumsreihenfolge).
        const byMonth = new Map<string, (typeof data)[number]>()
        for (const row of data ?? []) {
          byMonth.set(row.snapshot_date.slice(0, 7), row)
        }

        return { months: Array.from(byMonth.values()) }
      },
    }),

    // ── Vertrauensschicht: taugen die Zahlen ueberhaupt? ─────────────────────
    checkDataQuality: tool({
      description:
        'Prüft, ob die Zahlen tragen, auf die sich alle anderen Werkzeuge stützen: Alter und Lücken der ' +
        'Snapshots, Abweichung zwischen Bankstand und App-Saldo je Konto, hängende Bank-Syncs, Anteil ' +
        'unkategorisierter Buchungen, Alter der Kurs-Caches. Liefert fertige Befunde mit Schweregrad — ' +
        'du musst keine eigenen Schwellen erfinden. Aufrufen BEVOR du eine Vermögens-, Verlaufs- oder ' +
        'Saldozahl nennst, und immer dann, wenn eine Zahl unplausibel wirkt.',
      inputSchema: z.object({}),
      execute: async () => {
        const heute = new Date()
        const iso = (d: Date) => d.toISOString().slice(0, 10)
        const tageSeit = (wert: string | null | undefined): number | null => {
          if (!wert) return null
          const diff = heute.getTime() - new Date(wert).getTime()
          return Math.floor(diff / 86_400_000)
        }
        const vorTagen = (n: number) => {
          const d = new Date(heute)
          d.setDate(d.getDate() - n)
          return iso(d)
        }

        const befunde: { schwere: 'kritisch' | 'hinweis'; text: string }[] = []
        const melde = (schwere: 'kritisch' | 'hinweis', text: string) => befunde.push({ schwere, text })

        // 1) Snapshots — Alter, Lücken, Nullwerte.
        const { data: snaps, error: snapErr } = await supabase
          .from('net_worth_snapshots')
          .select('snapshot_date, net_worth, total_checking')
          .eq('user_id', userId)
          .gte('snapshot_date', vorTagen(30))
          .order('snapshot_date', { ascending: false })
        if (snapErr) return { error: snapErr.message }

        const letzterSnapshot = snaps?.[0]?.snapshot_date ?? null
        const snapshotAlter   = tageSeit(letzterSnapshot)
        // Lücken: wie viele der letzten 30 Tage haben gar keinen Snapshot.
        const vorhandeneTage = new Set((snaps ?? []).map(s => s.snapshot_date))
        const luecken: string[] = []
        for (let i = 1; i <= 30; i++) {
          const tag = vorTagen(i)
          if (!vorhandeneTage.has(tag)) luecken.push(tag)
        }
        const nullTage = (snaps ?? [])
          .filter(s => Number(s.net_worth) === 0 || Number(s.total_checking) === 0)
          .map(s => s.snapshot_date)

        if (snapshotAlter === null) {
          melde('kritisch', 'Es gibt überhaupt keinen Snapshot der letzten 30 Tage. Jede Vermögenszahl wäre geraten.')
        } else if (snapshotAlter > 1) {
          melde('kritisch', `Der jüngste Snapshot ist vom ${letzterSnapshot} und damit ${snapshotAlter} Tage alt — der Cron läuft nicht.`)
        }
        if (luecken.length > 3) {
          melde('kritisch', `${luecken.length} der letzten 30 Tage haben keinen Snapshot (u. a. ${luecken.slice(0, 3).join(', ')}). Der Verlauf hat Löcher.`)
        } else if (luecken.length > 0) {
          melde('hinweis', `Einzelne Tage ohne Snapshot: ${luecken.join(', ')}.`)
        }
        if (nullTage.length > 0) {
          melde('kritisch', `${nullTage.length} Snapshot-Tage stehen auf 0 € (u. a. ${nullTage.slice(0, 3).join(', ')}) — das ist ein Rechenfehler, kein leeres Konto.`)
        }

        // 2) Konten — App-Saldo gegen Bankstand, und wie frisch die Buchungen sind.
        const { data: konten, error: kontenErr } = await supabase
          .from('accounts')
          .select('id, name, type, bank_iban')
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('sort_order')
        if (kontenErr) return { error: kontenErr.message }

        const kontoIds = (konten ?? []).map(k => k.id)
        const saldoMap = new Map<string, { balance: number; stand: string }>()
        if (kontoIds.length > 0) {
          const { data: salden } = await supabase
            .from('account_balances')
            .select('account_id, balance, snapshot_date')
            .in('account_id', kontoIds)
            .order('snapshot_date', { ascending: false })
          for (const s of salden ?? []) {
            if (!saldoMap.has(s.account_id)) {
              saldoMap.set(s.account_id, { balance: Number(s.balance), stand: s.snapshot_date })
            }
          }
        }

        const { data: bankStaende } = await supabase
          .from('bank_balance')
          .select('account_iban, booked_balance, fetched_at')
          .eq('user_id', userId)
        const bankMap = new Map(
          (bankStaende ?? []).map(b => [b.account_iban, { stand: Number(b.booked_balance), geholt: b.fetched_at }]),
        )

        // Jüngste Buchung je Konto: eine winzige Abfrage pro Konto statt einer
        // grossen über alle Zeilen — PostgREST kann kein max() je Gruppe.
        const letzteBuchungen = await Promise.all(
          (konten ?? []).map(async k => {
            const { data } = await supabase
              .from('unified_transactions')
              .select('date')
              .eq('user_id', userId)
              .eq('account_id', k.id)
              .order('date', { ascending: false })
              .limit(1)
            return [k.id, data?.[0]?.date ?? null] as const
          }),
        )
        const buchungMap = new Map(letzteBuchungen)

        const kontenBericht = (konten ?? []).map(k => {
          const saldo = saldoMap.get(k.id) ?? null
          const bank  = k.bank_iban ? bankMap.get(k.bank_iban) ?? null : null
          const diff  = saldo && bank ? Math.round((saldo.balance - bank.stand) * 100) / 100 : null
          const letzteBuchung = buchungMap.get(k.id) ?? null

          if (saldo && bank && diff !== null && Math.abs(diff) > 1) {
            melde(
              'kritisch',
              `${k.name}: App zeigt ${saldo.balance} €, die Bank meldet ${bank.stand} € — ${diff} € Unterschied. ` +
              'Nenne den Saldo dieses Kontos nicht, ohne das dazuzusagen.',
            )
          }
          if (k.bank_iban) {
            const bankAlter = tageSeit(bank?.geholt ?? null)
            if (bankAlter === null) {
              melde('kritisch', `${k.name} ist mit einer IBAN verknüpft, aber es liegt kein einziger Bankstand vor — der Sync hat für dieses Konto nie funktioniert.`)
            } else if (bankAlter > 3) {
              melde('hinweis', `${k.name}: letzter Bank-Sync vor ${bankAlter} Tagen.`)
            }
            const buchungsAlter = tageSeit(letzteBuchung)
            if (buchungsAlter !== null && buchungsAlter > 14) {
              melde('hinweis', `${k.name}: jüngste Buchung ist ${buchungsAlter} Tage alt — entweder war nichts los oder der Abruf hängt.`)
            }
          }

          return {
            name:            k.name,
            typ:             k.type,
            bank_verknuepft: k.bank_iban !== null,
            saldo_app:       saldo?.balance ?? null,
            saldo_stand:     saldo?.stand ?? null,
            saldo_bank:      bank?.stand ?? null,
            bank_geholt_am:  bank?.geholt?.slice(0, 10) ?? null,
            differenz:       diff,
            letzte_buchung:  letzteBuchung,
          }
        })

        // 3) Buchungen — wie viel davon ist ungepflegt.
        const seit90 = vorTagen(90)
        const { count: buchungenGesamt } = await supabase
          .from('unified_transactions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('flow_kind', 'echt')
          .gte('date', seit90)
        const { count: buchungenOhneKategorie } = await supabase
          .from('unified_transactions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('flow_kind', 'echt')
          .gte('date', seit90)
          .is('category_id', null)

        const anteilOhneKategorie =
          buchungenGesamt && buchungenGesamt > 0
            ? Math.round(((buchungenOhneKategorie ?? 0) / buchungenGesamt) * 1000) / 10
            : 0
        if (anteilOhneKategorie > 10) {
          melde(
            'hinweis',
            `${anteilOhneKategorie} % der echten Buchungen der letzten 90 Tage haben keine Kategorie ` +
            `(${buchungenOhneKategorie} von ${buchungenGesamt}). Jede Auswertung nach Kategorie ist um diesen Anteil unvollständig.`,
          )
        }

        // 4) Kurse — ein alter Cache macht Krypto- und Depotwerte still falsch.
        const { data: kryptoPreis } = await supabase
          .from('crypto_price_cache')
          .select('updated_at')
          .order('updated_at', { ascending: false })
          .limit(1)
        const { data: fondsPreis } = await supabase
          .from('fund_price_cache')
          .select('fetched_at')
          .order('fetched_at', { ascending: false })
          .limit(1)

        const kryptoAlterStunden = kryptoPreis?.[0]?.updated_at
          ? Math.floor((heute.getTime() - new Date(kryptoPreis[0].updated_at).getTime()) / 3_600_000)
          : null
        const fondsAlterTage = tageSeit(fondsPreis?.[0]?.fetched_at ?? null)

        if (kryptoAlterStunden === null) {
          melde('hinweis', 'Es liegt kein einziger Krypto-Kurs vor.')
        } else if (kryptoAlterStunden > 72) {
          melde('kritisch', `Die Krypto-Kurse sind ${kryptoAlterStunden} Stunden alt — jeder Krypto-Wert ist damit veraltet.`)
        } else if (kryptoAlterStunden > 24) {
          melde('hinweis', `Die Krypto-Kurse sind ${kryptoAlterStunden} Stunden alt.`)
        }
        if (fondsAlterTage !== null && fondsAlterTage > 7) {
          melde('hinweis', `Die Fondskurse sind ${fondsAlterTage} Tage alt — der Depotwert hinkt entsprechend nach.`)
        }

        return {
          geprueft_am: iso(heute),
          // `ok` ist die Zahl, an der du dich orientierst: false heisst, dass vor
          // jeder Vermoegenszahl der Befund steht — nicht danach als Fussnote.
          ok: befunde.every(b => b.schwere !== 'kritisch'),
          befunde,
          kennzahlen: {
            letzter_snapshot:              letzterSnapshot,
            snapshot_alter_tage:           snapshotAlter,
            snapshot_luecken_30t:          luecken.length,
            snapshot_nulltage_30t:         nullTage.length,
            buchungen_echt_90t:            buchungenGesamt ?? 0,
            buchungen_ohne_kategorie_90t:  buchungenOhneKategorie ?? 0,
            anteil_ohne_kategorie_prozent: anteilOhneKategorie,
            krypto_kurse_alter_stunden:    kryptoAlterStunden,
            fondskurse_alter_tage:         fondsAlterTage,
          },
          konten: kontenBericht,
        }
      },
    }),

    // ── Kategorien ────────────────────────────────────────────────────────────
    getCategories: tool({
      description:
        'Listet alle Kategorien mit ID, Name, Typ (expense/income/neutral), Hierarchie ' +
        '(`parentId`/`path`), Monatsbudget, Farbe und Emoji. Die IDs brauchst du, um ' +
        'getTransactions/getSpendingSummary zu filtern und um categorizeTransactions, ' +
        'updateCategory, deleteCategories oder mergeCategories vorzuschlagen. ' +
        'Wie stark eine Kategorie tatsächlich genutzt wird, steht hier NICHT — dafür getCategoryUsage.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from('categories')
          .select('id, name, type, parent_id, budget_monthly, color, icon')
          .eq('user_id', userId)
          .order('sort_order')
        if (error) return { error: error.message }
        const byId = new Map((data ?? []).map((c) => [c.id, c]))
        return {
          // Die App kennt genau zwei Ebenen — das steht hier mit im Ergebnis,
          // damit das Modell es nicht aus der Datenlage erraten muss.
          maxDepth: 2,
          categories: (data ?? []).map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            parentId: c.parent_id,
            path: c.parent_id ? `${byId.get(c.parent_id)?.name ?? '?'} › ${c.name}` : c.name,
            budgetMonthly: c.budget_monthly,
            color: c.color,
            icon: c.icon,
          })),
        }
      },
    }),

    // ── Kategorie-Nutzung (Aggregat) ─────────────────────────────────────────
    getCategoryUsage: tool({
      description:
        'Nutzung pro Kategorie über die letzten N Monate: Anzahl Buchungen, Summe, letzte ' +
        'Verwendung, Anzahl Unterkategorien und verknüpfter Verträge — plus wie viele Buchungen ' +
        'ganz ohne Kategorie sind und welche Buchungstexte dahinter am häufigsten vorkommen. ' +
        'Das ist die Grundlage, um die Kategorien zu PFLEGEN: ungenutzte Kategorien erkennen, ' +
        'Sammelkategorien mit sehr vielen Buchungen in Unterkategorien aufteilen, Dubletten ' +
        'finden, Lücken schließen. Vor jedem Vorschlag zu deleteCategories oder mergeCategories ' +
        'zuerst hier nachsehen.',
      inputSchema: z.object({
        months: z.number().int().min(1).max(36).default(12),
      }),
      execute: async ({ months }) => {
        const since = new Date()
        since.setMonth(since.getMonth() - months)
        const sinceIso = since.toISOString().slice(0, 10)

        const [categories, transactions, contracts] = await Promise.all([
          supabase
            .from('categories')
            .select('id, name, type, parent_id, budget_monthly')
            .eq('user_id', userId)
            .order('sort_order'),
          supabase
            .from('unified_transactions')
            .select('category_id, type, amount, date, description, merchant')
            .eq('user_id', userId)
            .gte('date', sinceIso),
          supabase
            .from('contracts')
            .select('category_id')
            .eq('user_id', userId)
            .eq('is_active', true),
        ])
        if (categories.error) return { error: categories.error.message }
        if (transactions.error) return { error: transactions.error.message }
        if (contracts.error) return { error: contracts.error.message }

        type Bucket = { count: number; income: number; expense: number; lastUsed: string | null }
        const empty = (): Bucket => ({ count: 0, income: 0, expense: 0, lastUsed: null })
        const buckets = new Map<string, Bucket>()
        // Buchungstexte der unkategorisierten Buchungen, damit der Vorschlag für
        // eine fehlende Kategorie auf echten Zahlungsempfängern beruht und nicht
        // auf einer Vermutung.
        const uncategorizedMerchants = new Map<string, number>()

        for (const row of transactions.data ?? []) {
          const key = row.category_id ?? '__none__'
          const bucket = buckets.get(key) ?? empty()
          bucket.count += 1
          if (row.type === 'income') bucket.income += row.amount ?? 0
          else if (row.type === 'expense') bucket.expense += row.amount ?? 0
          if (row.date && (bucket.lastUsed == null || row.date > bucket.lastUsed)) {
            bucket.lastUsed = row.date
          }
          buckets.set(key, bucket)

          if (!row.category_id) {
            const label = (row.merchant || row.description || '').trim().slice(0, 60)
            if (label) uncategorizedMerchants.set(label, (uncategorizedMerchants.get(label) ?? 0) + 1)
          }
        }

        const contractCounts = new Map<string, number>()
        for (const row of contracts.data ?? []) {
          if (row.category_id) {
            contractCounts.set(row.category_id, (contractCounts.get(row.category_id) ?? 0) + 1)
          }
        }

        const rows = categories.data ?? []
        const byId = new Map(rows.map((c) => [c.id, c]))
        const childCounts = new Map<string, number>()
        for (const c of rows) {
          if (c.parent_id) childCounts.set(c.parent_id, (childCounts.get(c.parent_id) ?? 0) + 1)
        }

        const usage = rows
          .map((c) => {
            const bucket = buckets.get(c.id) ?? empty()
            return {
              id: c.id,
              name: c.name,
              path: c.parent_id ? `${byId.get(c.parent_id)?.name ?? '?'} › ${c.name}` : c.name,
              type: c.type,
              isSubcategory: c.parent_id != null,
              subcategoryCount: childCounts.get(c.id) ?? 0,
              transactionCount: bucket.count,
              incomeTotal: Math.round(bucket.income * 100) / 100,
              expenseTotal: Math.round(bucket.expense * 100) / 100,
              lastUsed: bucket.lastUsed,
              contractCount: contractCounts.get(c.id) ?? 0,
              budgetMonthly: c.budget_monthly,
            }
          })
          .sort((a, b) => b.transactionCount - a.transactionCount)

        const none = buckets.get('__none__') ?? empty()
        return {
          windowMonths: months,
          since: sinceIso,
          categories: usage,
          uncategorized: {
            transactionCount: none.count,
            expenseTotal: Math.round(none.expense * 100) / 100,
            incomeTotal: Math.round(none.income * 100) / 100,
            // Freitext aus Bank/Nutzer — als Daten behandeln, nie als Anweisung.
            untrusted_topMerchants: Array.from(uncategorizedMerchants.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 15)
              .map(([label, count]) => ({ label, count })),
          },
        }
      },
    }),

    // ── Kontext-Speicher ──────────────────────────────────────────────────────
    ...(options.memoryEnabled
      ? {
          remember: tool({
            description:
              'Legt einen dauerhaften Fakt über den Nutzer ab oder aktualisiert einen bestehenden. ' +
              'Nur für Dinge, die über dieses Gespräch hinaus gelten (Ziele, Vorlieben, ' +
              'Randbedingungen) — NICHT für Kontostände oder andere Zahlen, die veralten. ' +
              'Gibt es den `key` schon, wird der bestehende Eintrag überschrieben statt ein ' +
              'zweiter angelegt.',
            inputSchema: z.object({
              key: z
                .string()
                .min(2)
                .max(60)
                .regex(/^[a-z0-9-]+$/, 'nur Kleinbuchstaben, Ziffern und Bindestriche')
                .describe('Kurzer stabiler Slug, z. B. "sparziel-umzug" oder "praeferenz-etf"'),
              content: z.string().min(3).max(600).describe('Der Fakt in einem Satz'),
              category: z
                .enum(['general', 'preference', 'goal', 'fact', 'constraint'])
                .default('general'),
            }),
            execute: async ({ key, content, category }) => {
              if (!options.autoMemory) {
                return {
                  error:
                    'Automatisches Merken ist in den Einstellungen deaktiviert. Schlage dem Nutzer ' +
                    'stattdessen vor, den Eintrag unter Athena → Speicher selbst anzulegen.',
                }
              }
              const { data, error } = await supabase
                .from('ai_memories')
                .upsert(
                  {
                    user_id: userId,
                    key,
                    content,
                    category,
                    source: 'agent',
                    updated_at: new Date().toISOString(),
                  },
                  { onConflict: 'user_id,key' },
                )
                .select('id, key')
                .single()
              if (error) return { error: error.message }
              await options.logger({
                event: 'memory.write',
                message: key,
                meta: { key, category, content },
              })
              return { saved: true, key: data.key }
            },
          }),

          searchMemory: tool({
            description:
              'Durchsucht den Kontext-Speicher nach älteren Einträgen. Die zuletzt benutzten ' +
              'Einträge stehen bereits in deinem System-Prompt — dieses Werkzeug brauchst du nur, ' +
              'wenn du dort nichts Passendes findest und vermutest, dass es einen älteren Eintrag gibt.',
            inputSchema: z.object({ query: z.string().min(2) }),
            execute: async ({ query }) => {
              const { data, error } = await supabase.rpc('search_ai_memories', {
                q: query,
                max_results: 10,
              })
              if (error) return { error: error.message }
              return { memories: data ?? [] }
            },
          }),

          forget: tool({
            description:
              'Löscht einen Eintrag aus dem Kontext-Speicher — nutze das, wenn ein gespeicherter ' +
              'Fakt nachweislich überholt ist und nicht bloß aktualisiert werden soll.',
            inputSchema: z.object({ key: z.string().min(2).max(60) }),
            execute: async ({ key }) => {
              const { data, error } = await supabase
                .from('ai_memories')
                .delete()
                .eq('user_id', userId)
                .eq('key', key)
                .select('key')
              if (error) return { error: error.message }
              if (!data || data.length === 0) return { error: `Kein Eintrag mit key "${key}"` }
              await options.logger({ event: 'memory.delete', message: key, meta: { key } })
              return { deleted: true, key }
            },
          }),
        }
      : {}),

    // ── Wissensbasis ──────────────────────────────────────────────────────────
    searchKnowledge: tool({
      description:
        'Durchsucht die Wissensbasis (eigene Notizen, Anlageregeln, gespeicherte Recherchen) und ' +
        'liefert den Volltext der Treffer. Der Index mit allen Titeln steht in deinem System-Prompt — ' +
        'wenn ein Titel zur Frage passt, lies ihn hiermit, BEVOR du antwortest.',
      inputSchema: z.object({
        query: z.string().min(2),
        limit: z.number().int().min(1).max(10).default(4),
      }),
      execute: async ({ query, limit }) => {
        const { data, error } = await supabase.rpc('search_ai_knowledge', {
          q: query,
          max_results: limit,
        })
        if (error) return { error: error.message }
        // Der Inhalt stammt aus einer vom Nutzer gepflegten oder aus dem Web
        // übernommenen Quelle — gleiche Behandlung wie Bank-Freitext.
        return {
          documents: (data ?? []).map((doc) =>
            untrust(doc as unknown as Record<string, unknown>, ['content', 'title']),
          ),
        }
      },
    }),

    saveKnowledge: tool({
      description:
        'Legt einen Eintrag in der Wissensbasis an — für recherchierte Zusammenfassungen oder ' +
        'Regeln, die dauerhaft nützlich bleiben. Bei Web-Recherche immer `sourceUrl` mitgeben. ' +
        'Nicht für Kurzlebiges und nicht als Ersatz für den Kontext-Speicher (dort steht, was über ' +
        'den Nutzer gilt; hier steht Wissen über die Welt).',
      inputSchema: z.object({
        title: z.string().min(3).max(200),
        content: z.string().min(20).max(20000),
        tags: z.array(z.string().max(40)).max(10).default([]),
        sourceUrl: z.string().url().nullish(),
      }),
      execute: async ({ title, content, tags, sourceUrl }) => {
        const { data, error } = await supabase
          .from('ai_knowledge')
          .insert({
            user_id: userId,
            title,
            content,
            tags,
            source_url: sourceUrl ?? null,
            source: 'agent',
          })
          .select('id')
          .single()
        if (error) return { error: error.message }
        await options.logger({
          event: 'knowledge.write',
          message: title,
          meta: { id: data.id, tags, sourceUrl: sourceUrl ?? null },
        })
        return { saved: true, id: data.id }
      },
    }),

    // ── Inventar ──────────────────────────────────────────────────────────────
    getValuables: tool({
      description:
        'Listet das Inventar: Wertgegenstände wie Uhren, Schmuck, Feuerzeuge, Lederwaren — mit ' +
        'Kategorie, Marke, Modell, Zustand, aktuellem Wert und wie viele Bilder daran hängen. ' +
        'Der Weg zur `id`, die generateValuableArtwork und getValuableImages brauchen. ' +
        'Das Inventar steckt NICHT in getNetWorthTrend — der Sammlungswert ist eine Schätzung ' +
        'und wird bewusst getrennt geführt.',
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe('Freitextsuche über Name, Marke und Modell. Leer = alles.'),
        kategorie: z
          .string()
          .optional()
          .describe(`Einer von: ${KATEGORIEN.map((k) => k.key).join(', ')}`),
        ohneBild: z
          .boolean()
          .default(false)
          .describe('Nur Stücke, an denen noch gar kein Bild hängt'),
        limit: z.number().int().min(1).max(ROW_CAP).default(50),
      }),
      execute: async ({ query, kategorie, ohneBild, limit }) => {
        let q = supabase
          .from('valuables_current')
          // Als EIN String-Literal: supabase-js leitet den Zeilentyp aus dem Literal ab,
          // eine zusammengesetzte Zeichenkette macht daraus `unknown`.
          .select('id, name, kategorie, marke, modell, referenz, zustand, notizen, aktueller_wert, waehrung, gekauft_am, kaufpreis, bild_anzahl, foto_anzahl')
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('sort_order')
          .limit(Math.min(limit, ROW_CAP))

        if (kategorie) q = q.eq('kategorie', kategorie)
        if (ohneBild) q = q.eq('bild_anzahl', 0)
        if (query?.trim()) {
          const like = `%${query.trim().replace(/[%,]/g, '')}%`
          q = q.or(`name.ilike.${like},marke.ilike.${like},modell.ilike.${like}`)
        }

        const { data, error } = await q
        if (error) return { error: error.message }
        // `notizen` ist Freitext von Eric und geht in den Bildprompt ein — als Daten
        // markieren, nicht als Anweisung lesen (siehe untrust).
        return { valuables: (data ?? []).map((row) => untrust(row, ['notizen'])) }
      },
    }),

    getValuableImages: tool({
      description:
        'Die Bilder EINES Gegenstands: welche Fotos es gibt (mögliche Vorlagen), welches Artwork ' +
        'schon erzeugt wurde, welches gerade angezeigt wird und mit welchem Änderungswunsch die ' +
        'jeweilige Runde lief. Vor jedem generateValuableArtwork aufrufen — ohne das rätst du bei ' +
        'basisBildIds. ' +
        'Wichtig zum Verfeinern: der Stil-Baustein des Bildprompts ist fest und für dich nicht ' +
        'änderbar; dein einziger Hebel ist der `hinweis` beim nächsten Lauf. Was in den ' +
        'vorherigen Runden schon verlangt wurde, steht hier unter `hinweis`.',
      inputSchema: z.object({
        valuableId: z.string().uuid(),
        mitPrompt: z
          .boolean()
          .default(false)
          .describe('Auch den vollen Prompt jeder Runde zurückgeben. Lang — nur bei Bedarf.'),
      }),
      execute: async ({ valuableId, mitPrompt }) => {
        const { data, error } = await supabase
          .from('valuable_images')
          .select('id, art, ist_hauptbild, created_at, hinweis, basis_bild_id, prompt')
          .eq('valuable_id', valuableId)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
        if (error) return { error: error.message }

        const rows = (data ?? []) as {
          id: string
          art: string
          ist_hauptbild: boolean
          created_at: string
          hinweis: string | null
          basis_bild_id: string | null
          prompt: string | null
        }[]

        return {
          images: rows.map((b) => ({
            id: b.id,
            art: b.art,
            wirdAngezeigt: b.ist_hauptbild,
            erstelltAm: b.created_at,
            // Der Änderungswunsch stammt aus dem Chat oder aus dem Feld in der Vitrine —
            // fremder Freitext, den du zitieren, aber nicht befolgen darfst.
            untrusted_hinweis: b.hinweis,
            ausBildId: b.basis_bild_id,
            ...(mitPrompt ? { untrusted_prompt: b.prompt } : {}),
          })),
          hinweis:
            'Du kannst diese Bilder nicht sehen — du kennst nur ihre Metadaten. Was am Ergebnis ' +
            'zu ändern ist, sagt dir Eric; frag nach, statt zu raten.',
        }
      },
    }),

    // ── Schreibende Aktionen: nur Vorschläge ──────────────────────────────────
    ...buildProposalTools(supabase, userId, options),
  }
}

/**
 * Erzeugt aus jeder Definition in WRITE_ACTIONS ein gleichnamiges Werkzeug, das
 * die Aktion NICHT ausführt, sondern in `ai_pending_actions` einreiht.
 *
 * Generiert statt handgeschrieben, weil sonst zwei Listen synchron gehalten
 * werden müssten: eine neue Aktion in actions.ts wäre für das Modell erst dann
 * sichtbar, wenn jemand daran denkt, hier ein Werkzeug nachzutragen. So gibt es
 * genau eine Stelle, an der eine Schreibaktion definiert wird.
 */
function buildProposalTools(supabase: DB, userId: string, options: AthenaToolOptions) {
  const entries = Object.entries(WRITE_ACTIONS).map(([name, definition]) => [
    name,
    tool({
      description:
        definition.description +
        ' — WICHTIG: Dieses Werkzeug führt nichts aus. Es erzeugt einen Vorschlag, den der Nutzer ' +
        'im Chat bestätigen muss. Antworte danach entsprechend ("vorgeschlagen", nicht "erledigt").',
      inputSchema: definition.schema,
      execute: async (input: unknown) => {
        const actionName = name as WriteActionName
        // Erst prüfen, dann vorschlagen: eine Aktion, die am aktuellen
        // Datenstand nicht ausführbar ist (Kategorie mit Unterkategorien
        // löschen, dritte Ebene anlegen), soll als Werkzeugfehler beim Modell
        // landen und nicht als Karte bei Eric, die beim Klick scheitert.
        // Der Fehler landet über onStepFinish ohnehin in ai_tool_calls und im
        // System-Log — hier deshalb kein zweiter Log-Eintrag.
        const problem = await validateWriteAction(actionName, input, { supabase, userId })
        if (problem) return { error: `Vorschlag nicht möglich: ${problem}` }

        const { label, summary, details } = await describeWriteAction(actionName, input, {
          supabase,
          userId,
        })
        const { data, error } = await supabase
          .from('ai_pending_actions')
          .insert({
            user_id: userId,
            conversation_id: options.conversationId,
            message_id: options.messageId,
            action: actionName,
            input: input as Json,
            summary,
            status: 'pending',
          })
          .select('id')
          .single()
        if (error) return { error: error.message }
        await options.logger({
          event: 'action.proposed',
          message: summary,
          meta: { actionId: data.id, action: actionName, input },
        })
        // `details` gehen bewusst durch die Werkzeugausgabe und nicht über eine
        // eigene Spalte: so landen sie mit den Nachrichten-Parts in ai_messages
        // und stehen beim Wiederöffnen der Session unverändert wieder da.
        return {
          status: 'pending_confirmation',
          actionId: data.id,
          label,
          summary,
          details,
          note: 'Wartet auf die Bestätigung des Nutzers. Noch wurde NICHTS geändert.',
        }
      },
    }),
  ])
  return Object.fromEntries(entries) as Record<string, ReturnType<typeof tool>>
}

export type AthenaTools = ReturnType<typeof buildAthenaTools>
