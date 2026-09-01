import { SectionTabs } from '@/components/layout/section-tabs'

// Verträge, Schulden und Sparziele sind alle drei Vorhaben mit Zukunftsbezug —
// keine Ist-Buchungen wie Konten und Transaktionen. Deshalb eine Gruppe.
const TABS = [
  { href: '/finance/contracts', label: 'Verträge' },
  { href: '/finance/debts',     label: 'Schulden' },
  { href: '/finance/goals',     label: 'Sparziele' },
]

export default function PlanungLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionTabs tabs={TABS} />
      {children}
    </>
  )
}
