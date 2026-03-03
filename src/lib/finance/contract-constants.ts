export const CONTRACT_TYPES = [
  { value: 'subscription', label: 'Abonnement' },
  { value: 'insurance',    label: 'Versicherung' },
  { value: 'utility',      label: 'Versorger' },
  { value: 'loan',         label: 'Kredit' },
  { value: 'rental',       label: 'Miete' },
  { value: 'service',      label: 'Dienstleistung' },
  { value: 'other',        label: 'Sonstiges' },
] as const

export const FREQUENCIES = [
  { value: 'weekly',    label: 'Wöchentlich' },
  { value: 'biweekly',  label: 'Zweiwöchentlich' },
  { value: 'monthly',   label: 'Monatlich' },
  { value: 'quarterly', label: 'Vierteljährlich' },
  { value: 'biannual',  label: 'Halbjährlich' },
  { value: 'yearly',    label: 'Jährlich' },
] as const
