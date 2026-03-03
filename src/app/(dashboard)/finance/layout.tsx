import { FinanceNav } from '@/components/finance/finance-nav'

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-full">
      <FinanceNav />
      {children}
    </div>
  )
}
