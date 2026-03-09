import type { SavingsPlan, DepotTransaction } from '@/app/actions/depot'

/**
 * Pure helper – no Supabase calls, works client-side.
 *
 * A savings plan is "due" when:
 *  1. it is active
 *  2. start_date <= today
 *  3. execution_day <= today's day-of-month
 *  4. there is no `savings_plan` transaction for this ISIN in the current month
 */
export function checkDueSavingsPlans(
  plans: SavingsPlan[],
  transactions: DepotTransaction[]
): SavingsPlan[] {
  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() + 1        // 1-12
  const day   = now.getDate()
  const todayStr = now.toISOString().split('T')[0]

  // YYYY-MM prefix for current month
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`

  // Collect ISINs that already have a savings_plan execution this month
  const executedThisMonth = new Set<string>()
  for (const tx of transactions) {
    if (
      tx.transaction_type === 'savings_plan' &&
      tx.transaction_date.startsWith(monthPrefix)
    ) {
      executedThisMonth.add(tx.isin)
    }
  }

  return plans.filter(plan => {
    if (!plan.is_active) return false
    if (plan.start_date > todayStr) return false
    if (plan.execution_day > day) return false
    if (executedThisMonth.has(plan.isin)) return false
    return true
  })
}
