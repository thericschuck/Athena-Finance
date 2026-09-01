import { SectionTabs } from '@/components/layout/section-tabs'

const TABS = [
  { href: '/crypto',             label: 'Portfolio', exact: true },
  { href: '/crypto/rebalancing', label: 'Rebalancing' },
  { href: '/crypto/assets',      label: 'Assets' },
]

export default function CryptoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionTabs tabs={TABS} />
      {children}
    </>
  )
}
