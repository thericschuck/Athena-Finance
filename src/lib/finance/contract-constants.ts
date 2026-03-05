export const CONTRACT_TYPES = [
  { value: 'subscription',     label: 'Abonnement' },
  { value: 'insurance',        label: 'Versicherung' },
  { value: 'utility',          label: 'Versorger' },
  { value: 'loan',             label: 'Kredit' },
  { value: 'rental',           label: 'Miete' },
  { value: 'transfer',         label: 'Dauerauftrag (Überweisung)' },
  { value: 'savings_plan',     label: 'Sparplan (z.B. Depot)' },
  { value: 'building_savings', label: 'Bausparvertrag-Einzahlung' },
  { value: 'service',          label: 'Dienstleistung' },
  { value: 'other',            label: 'Sonstiges' },
] as const

/** Contract types that represent a transfer between two own accounts */
export const TRANSFER_TYPES = new Set(['transfer', 'savings_plan', 'building_savings'])

export const FREQUENCIES = [
  { value: 'weekly',    label: 'Wöchentlich' },
  { value: 'biweekly',  label: 'Zweiwöchentlich' },
  { value: 'monthly',   label: 'Monatlich' },
  { value: 'quarterly', label: 'Vierteljährlich' },
  { value: 'biannual',  label: 'Halbjährlich' },
  { value: 'yearly',    label: 'Jährlich' },
] as const
