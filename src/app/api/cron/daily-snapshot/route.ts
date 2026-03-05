import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// ─── Admin client (bypasses RLS) ──────────────────────────────────────────────
function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isoDate(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ─── CoinGecko: ticker symbol → coin ID ───────────────────────────────────────
const GECKO_IDS: Record<string, string> = {
  BTC:  'bitcoin',
  ETH:  'ethereum',
  SOL:  'solana',
  BNB:  'binancecoin',
  XRP:  'ripple',
  ADA:  'cardano',
  AVAX: 'avalanche-2',
  DOT:  'polkadot',
  MATIC:'matic-network',
  LINK: 'chainlink',
  UNI:  'uniswap',
  LTC:  'litecoin',
  ATOM: 'cosmos',
  NEAR: 'near',
  FTM:  'fantom',
  ARB:  'arbitrum',
  OP:   'optimism',
  DOGE: 'dogecoin',
  SHIB: 'shiba-inu',
}

async function fetchCryptoPrices(symbols: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(symbols.map(s => s.toUpperCase()))]
  const ids = unique.map(s => GECKO_IDS[s] ?? s.toLowerCase()).join(',')

  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=eur`,
    { headers: { Accept: 'application/json' }, cache: 'no-store' },
  )

  const prices = new Map<string, number>()
  if (!res.ok) return prices

  const data = (await res.json()) as Record<string, { eur?: number }>
  for (const sym of unique) {
    const id = GECKO_IDS[sym] ?? sym.toLowerCase()
    const eur = data[id]?.eur
    if (eur != null) prices.set(sym, eur)
  }
  return prices
}

// ─── Monthly summary category classification ──────────────────────────────────
type MonthlySummaryFields = {
  salary:           number
  food:             number
  leisure:          number
  subscriptions:    number
  savings_transfer: number
  pocket_money:     number
  other_income:     number
  other_expenses:   number
  total_income:     number
  total_expenses:   number
  net_balance:      number
}

function classifyTx(
  catName: string,
  txType: string,
): { bucket: keyof MonthlySummaryFields; isIncome: boolean } {
  const n = catName.toLowerCase()
  const isIncome = txType === 'income'

  if (isIncome) {
    if (n.includes('gehalt') || n.includes('lohn') || n.includes('salary'))
      return { bucket: 'salary', isIncome: true }
    if (n.includes('sparen') || n.includes('saving') || n.includes('übertrag'))
      return { bucket: 'savings_transfer', isIncome: true }
    return { bucket: 'other_income', isIncome: true }
  }

  if (n.includes('lebensmittel') || n.includes('supermarkt') || n.includes('food') || n.includes('groceries'))
    return { bucket: 'food', isIncome: false }
  if (n.includes('freizeit') || n.includes('leisure') || n.includes('entertainment') || n.includes('sport') || n.includes('hobby'))
    return { bucket: 'leisure', isIncome: false }
  if (n.includes('abo') || n.includes('subscription') || n.includes('streaming') || n.includes('software') || n.includes('mitglied'))
    return { bucket: 'subscriptions', isIncome: false }
  if (n.includes('sparen') || n.includes('saving') || n.includes('übertrag') || n.includes('transfer'))
    return { bucket: 'savings_transfer', isIncome: false }
  if (n.includes('taschengeld') || n.includes('pocket'))
    return { bucket: 'pocket_money', isIncome: false }

  return { bucket: 'other_expenses', isIncome: false }
}

// ─── Account type → net worth bucket ─────────────────────────────────────────
type NwBucket = 'checking' | 'savings' | 'cash' | 'bausparer' | 'business' | 'debts' | null

function accountBucket(type: string): NwBucket {
  switch (type) {
    case 'checking':  return 'checking'
    case 'savings':   return 'savings'
    case 'cash':      return 'cash'
    case 'bausparer': return 'bausparer'
    case 'business':  return 'business'
    case 'loan':
    case 'credit':
    case 'debt':      return 'debts'
    default:          return null
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // Verify cron secret
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getAdmin()
  const date     = isoDate()
  const log: string[] = [`[${date}] daily-snapshot start`]

  try {
    // ── List all users ─────────────────────────────────────────────────────────
    const { data: { users }, error: usersErr } = await supabase.auth.admin.listUsers()
    if (usersErr) throw usersErr
    log.push(`users: ${users.length}`)

    for (const user of users) {
      const uid = user.id
      log.push(`\n── ${uid} ──`)

      // ── Step 1: Account Balances ─────────────────────────────────────────────
      const { data: accounts } = await supabase
        .from('accounts')
        .select('id, type, currency')
        .eq('user_id', uid)
        .eq('is_active', true)

      // Running balance per account from all transactions up to today
      const balMap = new Map<string, number>()
      for (const a of accounts ?? []) balMap.set(a.id, 0)

      if (accounts?.length) {
        const { data: txns } = await supabase
          .from('transactions')
          .select('account_id, amount, amount_base, type, fx_rate, transfer_to')
          .eq('user_id', uid)
          .lte('date', date)

        for (const t of txns ?? []) {
          if (!balMap.has(t.account_id)) continue
          const amt = t.amount_base ?? t.amount * (t.fx_rate ?? 1)

          if (t.type === 'income') {
            balMap.set(t.account_id, (balMap.get(t.account_id) ?? 0) + amt)
          } else if (t.type === 'expense') {
            balMap.set(t.account_id, (balMap.get(t.account_id) ?? 0) - amt)
          } else if (t.type === 'transfer') {
            balMap.set(t.account_id, (balMap.get(t.account_id) ?? 0) - amt)
            if (t.transfer_to && balMap.has(t.transfer_to)) {
              balMap.set(t.transfer_to, (balMap.get(t.transfer_to) ?? 0) + amt)
            }
          }
        }

        const balRows = (accounts ?? []).map(a => ({
          account_id:    a.id,
          balance:       round2(balMap.get(a.id) ?? 0),
          currency:      a.currency,
          snapshot_date: date,
          source:        'cron',
        }))

        const { error: balErr } = await supabase
          .from('account_balances')
          .upsert(balRows, { onConflict: 'account_id,snapshot_date' })

        if (balErr) log.push(`  account_balances ERR: ${balErr.message}`)
        else        log.push(`  account_balances: ${balRows.length} rows`)
      }

      // ── Step 2: Portfolio Snapshots + Asset Valuations ───────────────────────
      const { data: assets } = await supabase
        .from('assets')
        .select('id, type, symbol, quantity, avg_buy_price, currency, portfolio_name')
        .eq('user_id', uid)
        .not('quantity', 'is', null)
        .gt('quantity', 0)

      // track value by asset type for net worth calc
      let total_depot  = 0
      let total_crypto = 0

      if (assets?.length) {
        // Fetch live crypto prices in one batch
        const cryptoSymbols = assets
          .filter(a => a.type === 'crypto' && a.symbol)
          .map(a => a.symbol!)
          .filter((v, i, arr) => arr.indexOf(v) === i)

        const cryptoPrices = cryptoSymbols.length
          ? await fetchCryptoPrices(cryptoSymbols)
          : new Map<string, number>()

        const portRows: Record<string, unknown>[] = []
        const evalRows: Record<string, unknown>[] = []

        for (const asset of assets) {
          const qty = asset.quantity ?? 0
          let priceEur: number

          if (asset.type === 'crypto' && asset.symbol) {
            priceEur = cryptoPrices.get(asset.symbol.toUpperCase()) ?? 0
          } else {
            // Depot / ETF / fund: use avg_buy_price as last known value
            priceEur = asset.avg_buy_price ?? 0
          }

          const valueEur = round2(qty * priceEur)

          portRows.push({
            asset_id:      asset.id,
            user_id:       uid,
            quantity:      qty,
            price_eur:     round2(priceEur),
            value_eur:     valueEur,
            snapshot_date: date,
            portfolio_name: asset.portfolio_name ?? null,
            source:        'cron',
          })

          evalRows.push({
            asset_id:       asset.id,
            price_per_unit: round2(priceEur),
            total_value:    valueEur,
            valuation_date: date,
            source:         asset.type === 'crypto' ? 'coingecko' : 'manual',
          })

          if (asset.type === 'crypto') {
            total_crypto += valueEur
          } else if (['depot', 'etf', 'stock', 'fund'].includes(asset.type)) {
            total_depot += valueEur
          }
        }

        const { error: portErr } = await supabase
          .from('portfolio_snapshots')
          .upsert(portRows as never[], { onConflict: 'asset_id,snapshot_date' })

        if (portErr) log.push(`  portfolio_snapshots ERR: ${portErr.message}`)
        else         log.push(`  portfolio_snapshots: ${portRows.length} rows`)

        const { error: evalErr } = await supabase
          .from('asset_valuations')
          .upsert(evalRows as never[], { onConflict: 'asset_id,valuation_date' })

        if (evalErr) log.push(`  asset_valuations ERR: ${evalErr.message}`)
        else         log.push(`  asset_valuations: ${evalRows.length} rows`)
      }

      total_depot  = round2(total_depot)
      total_crypto = round2(total_crypto)

      // ── Step 3: Net Worth Snapshot ───────────────────────────────────────────
      {
        const nw = {
          total_checking:  0,
          total_savings:   0,
          total_cash:      0,
          total_bausparer: 0,
          total_business:  0,
          total_debts:     0,
        }

        for (const acct of accounts ?? []) {
          const bal     = balMap.get(acct.id) ?? 0
          const bucket  = accountBucket(acct.type)
          if (!bucket) continue

          if (bucket === 'debts') {
            nw.total_debts += Math.abs(bal)
          } else {
            (nw as Record<string, number>)[`total_${bucket}`] += bal
          }
        }

        const total_assets = round2(
          nw.total_checking + nw.total_savings + nw.total_cash +
          nw.total_bausparer + nw.total_business + total_depot + total_crypto
        )
        const net_worth = round2(total_assets - nw.total_debts)

        const { error: nwErr } = await supabase
          .from('net_worth_snapshots')
          .upsert({
            user_id:         uid,
            snapshot_date:   date,
            source:          'cron',
            net_worth,
            total_assets,
            total_depot,
            total_crypto,
            total_checking:  round2(nw.total_checking),
            total_savings:   round2(nw.total_savings),
            total_cash:      round2(nw.total_cash),
            total_bausparer: round2(nw.total_bausparer),
            total_business:  round2(nw.total_business),
            total_debts:     round2(nw.total_debts),
          }, { onConflict: 'user_id,snapshot_date' })

        if (nwErr) log.push(`  net_worth_snapshots ERR: ${nwErr.message}`)
        else       log.push(`  net_worth: €${net_worth.toFixed(0)}  (assets €${total_assets.toFixed(0)}, debts €${nw.total_debts.toFixed(0)}, crypto €${total_crypto.toFixed(0)}, depot €${total_depot.toFixed(0)})`)
      }

      // ── Step 4: Monthly Finance Summary ─────────────────────────────────────
      {
        const now        = new Date()
        const ym         = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        const monthStart = `${ym}-01`
        const monthEnd   = now.getMonth() === 11
          ? `${now.getFullYear() + 1}-01-01`
          : `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, '0')}-01`

        const { data: txns } = await supabase
          .from('transactions')
          .select('amount, amount_base, type, fx_rate, category_id, categories(name, type)')
          .eq('user_id', uid)
          .gte('date', monthStart)
          .lt('date', monthEnd)
          .neq('type', 'transfer') // exclude internal transfers from P&L

        const s: MonthlySummaryFields = {
          salary: 0, food: 0, leisure: 0, subscriptions: 0,
          savings_transfer: 0, pocket_money: 0,
          other_income: 0, other_expenses: 0,
          total_income: 0, total_expenses: 0, net_balance: 0,
        }

        for (const t of txns ?? []) {
          const amt     = t.amount_base ?? t.amount * (t.fx_rate ?? 1)
          const catArr  = t.categories
          const cat     = Array.isArray(catArr) ? catArr[0] : catArr
          const catName = (cat as { name?: string } | null)?.name ?? ''
          const catType = (cat as { type?: string } | null)?.type ?? t.type

          const { bucket, isIncome } = classifyTx(catName, catType)

          s[bucket] = round2(s[bucket] + amt)

          if (isIncome) s.total_income  = round2(s.total_income  + amt)
          else          s.total_expenses = round2(s.total_expenses + amt)
        }

        s.net_balance = round2(s.total_income - s.total_expenses)

        const { error: mfsErr } = await supabase
          .from('monthly_finance_summary')
          .upsert({
            user_id: uid,
            month:   ym,
            source:  'cron',
            ...s,
          }, { onConflict: 'user_id,month' })

        if (mfsErr) log.push(`  monthly_finance_summary ERR: ${mfsErr.message}`)
        else        log.push(`  monthly_summary [${ym}]: income €${s.total_income.toFixed(0)}, expenses €${s.total_expenses.toFixed(0)}, net €${s.net_balance.toFixed(0)}`)
      }
    }

    log.push('\nDone ✓')
    return NextResponse.json({ ok: true, log })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.push(`FATAL: ${msg}`)
    return NextResponse.json({ ok: false, log, error: msg }, { status: 500 })
  }
}
