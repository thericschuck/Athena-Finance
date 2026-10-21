import { SectionTabs } from '@/components/layout/section-tabs'

// Verträge, Schulden, Sparziele und die Prognose sind alle Vorhaben mit Zukunftsbezug —
// keine Ist-Buchungen wie Konten und Transaktionen. Deshalb eine Gruppe.
const TABS = [
  { href: '/finance/contracts', label: 'Verträge' },
  { href: '/finance/debts',     label: 'Schulden' },
  { href: '/finance/goals',     label: 'Sparziele' },
  { href: '/finance/prognose',  label: 'Prognose' },
]

export default function PlanungLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionTabs tabs={TABS} />
      {children}
    </>
  )
}
