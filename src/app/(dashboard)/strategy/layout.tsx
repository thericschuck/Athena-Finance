import { SectionTabs } from '@/components/layout/section-tabs'

const TABS = [
  { href: '/strategy/indicators', label: 'Indikatoren' },
  { href: '/strategy/tests',      label: 'Backtests' },
  { href: '/strategy/combos',     label: 'Combos' },
  { href: '/strategy/strategies', label: 'Strategien' },
]

export default function StrategyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionTabs tabs={TABS} />
      {children}
    </>
  )
}
