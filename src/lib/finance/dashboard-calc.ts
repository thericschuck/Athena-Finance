/**
 * Reine Berechnungen für das Dashboard (vorher inline in dashboard/page.tsx).
 * Keine Imports außerhalb dieser Datei, damit `node --test` sie direkt laden kann.
 * Verhalten 1:1 aus der Seite übernommen — nur `now`/`today` kommen jetzt als Parameter.
 */

// ─── Verträge ────────────────────────────────────────────────────────────────
export type ContractRow = {
  id: string; name: string; provider: string | null; frequency: string
  amount: number; currency: string; end_date: string | null
  notice_days: number; auto_renews: boolean; account_id: string | null
}

function startOfDay(d: Date): Date {
  const t = new Date(d); t.setHours(0, 0, 0, 0)
  return t
}

export function daysUntil(d: Date, today: Date): number {
  const t = startOfDay(today)
  return Math.ceil((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24))
}

export function toMonthly(amount: number, frequency: string): number {
  const map: Record<string, number> = {
    weekly: 52 / 12, biweekly: 26 / 12,
    monthly: 1, quarterly: 1 / 3, biannual: 1 / 6, yearly: 1 / 12,
  }
  return amount * (map[frequency] ?? 1)
}

function addFrequency(d: Date, f: string) {
  if (f === 'weekly')    d.setDate(d.getDate() + 7)
  else if (f === 'biweekly')  d.setDate(d.getDate() + 14)
  else if (f === 'monthly')   d.setMonth(d.getMonth() + 1)
  else if (f === 'quarterly') d.setMonth(d.getMonth() + 3)
  else if (f === 'biannual')  d.setMonth(d.getMonth() + 6)
  else if (f === 'yearly')    d.setFullYear(d.getFullYear() + 1)
}

export function getNextRenewal(c: ContractRow, today: Date): Date | null {
  if (!c.end_date) return null
  const t = startOfDay(today)
  const d = new Date(c.end_date)
  if (d >= t) return d
  if (!c.auto_renews) return null
  let i = 0
  while (d < t && i++ < 200) addFrequency(d, c.frequency)
  return d >= t ? d : null
}

export type UpcomingContract = ContractRow & { renewalDate: Date; deadlineDate: Date; days: number }

/** Verträge, deren Kündigungsfrist in <= `withinDays` Tagen (oder bereits) abläuft, dringendste zuerst. */
export function computeUpcomingRenewals(contracts: ContractRow[], today: Date, withinDays = 45): UpcomingContract[] {
  return contracts
    .map(c => {
      const renewalDate = getNextRenewal(c, today)
      if (!renewalDate) return null
      const deadlineDate = new Date(renewalDate)
      deadlineDate.setDate(deadlineDate.getDate() - c.notice_days)
      return { ...c, renewalDate, deadlineDate, days: daysUntil(deadlineDate, today) }
    })
    .filter((c): c is UpcomingContract => c !== null && c.days <= withinDays)
    .sort((a, b) => a.days - b.days)
}

export type FixedCostContract = { id: string; name: string; monthly: number; accountId: string | null }

export function buildFixedCosts(contracts: ContractRow[]): { contracts: FixedCostContract[]; total: number } {
  const list = contracts
    .filter(c => c.currency === 'EUR')
    .map(c => ({ id: c.id, name: c.name, monthly: toMonthly(c.amount, c.frequency), accountId: c.account_id }))
    .sort((a, b) => b.monthly - a.monthly)
  return { contracts: list, total: list.reduce((s, c) => s + c.monthly, 0) }
}

// ─── Konten ──────────────────────────────────────────────────────────────────
// Spiegelt die Bucket-Zuordnung aus fn_take_snapshot (v3). Muss deckungsgleich
// bleiben: sonst rechnet der heutige Punkt im Verlauf anders als alle davor.
// `investment` hat seit 2026-09-02 seinen eigenen Bucket. 'bausparer', 'business',
// 'loan' und 'debt' stehen nicht hier: accounts_type_check erlaubt sie nicht.
export function liveAccountBucket(type: string): string | null {
  switch (type) {
    case 'checking':         return 'checking'
    case 'investment':       return 'investment'
    case 'savings':          return 'savings'
    case 'cash':
    case 'other':            return 'cash'
    case 'building_savings': return 'bausparer'
    case 'credit':           return 'debts'
    case 'crypto':           return 'crypto'
    default:                 return null
  }
}

export type BalanceSumRow = { account_id: string; balance: number }
export type BalanceAccount = { id: string; bank_iban: string | null }

/**
 * Kontostand je Konto aus der Buchungssumme (income +, expense −, Rest neutral; die Summe
 * kommt fertig aus der DB, siehe Views account_balance_sums_*).
 * Bei bankverknüpften Konten gewinnt der von der Bank gemeldete Saldo (bank_balance),
 * sobald er existiert — FinTS liefert nur ein Fenster, die Summe wäre sonst falsch.
 */
export function computeAccountBalances(
  accounts: BalanceAccount[],
  sums: BalanceSumRow[],
  bankBalanceByIban: Map<string, number>,
): Map<string, number> {
  const balMap = new Map<string, number>()
  for (const s of sums) balMap.set(s.account_id, (balMap.get(s.account_id) ?? 0) + s.balance)
  for (const a of accounts) {
    if (!a.bank_iban) continue
    const real = bankBalanceByIban.get(a.bank_iban)
    if (real != null) balMap.set(a.id, real)
  }
  return balMap
}

export function computeMonthTotals(txMonth: { type: string; amount: number }[]): { income: number; expense: number; net: number } {
  let income = 0, expense = 0
  for (const tx of txMonth) {
    if (tx.type === 'income')  income  += tx.amount
    if (tx.type === 'expense') expense += tx.amount
  }
  return { income, expense, net: income - expense }
}

export type LiveBuckets = {
  checking: number; investment: number; savings: number; cash: number
  bausparer: number; crypto: number; debts: number
}

export function computeLiveBuckets(
  activeAccounts: { id: string; type: string }[],
  balMap: Map<string, number>,
): LiveBuckets {
  const liveBuckets: Record<string, number> = {
    checking: 0, investment: 0, savings: 0, cash: 0, bausparer: 0, crypto: 0, debts: 0,
  }
  for (const a of activeAccounts) {
    const bucket = liveAccountBucket(a.type)
    if (bucket) liveBuckets[bucket] = (liveBuckets[bucket] ?? 0) + (balMap.get(a.id) ?? 0)
  }
  return liveBuckets as LiveBuckets
}

// ─── Krypto ──────────────────────────────────────────────────────────────────
export type CryptoAssetBase = {
  id: string; avg_buy_price: number | null; quantity: number | null
}
export type ValuationLite = { asset_id: string; price_per_unit: number; total_value: number }

/** `vals` muss nach valuation_date desc, created_at desc sortiert sein; der erste Treffer je Asset gewinnt. */
export function buildCryptoPortfolio<A extends CryptoAssetBase>(assets: A[], vals: ValuationLite[]) {
  const valMap = new Map<string, ValuationLite>()
  for (const v of vals) if (!valMap.has(v.asset_id)) valMap.set(v.asset_id, v)
  const cryptoAssets = assets.map(a => ({
    ...a,
    current_price: valMap.get(a.id)?.price_per_unit ?? null,
    current_value: valMap.get(a.id)?.total_value ?? null,
  }))
  const total = cryptoAssets.reduce((s, a) => s + (a.current_value ?? 0), 0)
  const totalCost = cryptoAssets.reduce((s, a) =>
    a.avg_buy_price != null && a.quantity != null ? s + a.avg_buy_price * a.quantity : s, 0)
  return { cryptoAssets, total, totalCost }
}

// ─── Inventar ────────────────────────────────────────────────────────────────
export function computeInventory(
  valuables: { aktueller_wert: number | null; im_vermoegen: boolean | null }[],
): { wert: number; stueck: number } {
  return {
    wert: valuables.filter(v => v.im_vermoegen !== false).reduce((s, v) => s + (v.aktueller_wert ?? 0), 0),
    stueck: valuables.length,
  }
}
