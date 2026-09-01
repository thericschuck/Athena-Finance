import { SectionTabs } from '@/components/layout/section-tabs'

// Kategorien sind Stammdatenpflege (Baum aus parent_id/sort_order/Typ), keine
// Seite für den Alltag — als eigener Sidebar-Eintrag stand sie gleichrangig
// neben Transaktionen. Hier hängt sie da, wo man sie tatsächlich braucht:
// direkt neben dem Zuordnen der Transaktionen.
const TABS = [
  { href: '/finance/transactions', label: 'Transaktionen' },
  { href: '/finance/categories',   label: 'Kategorien' },
]

export default function TransaktionenLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionTabs tabs={TABS} />
      {children}
    </>
  )
}
