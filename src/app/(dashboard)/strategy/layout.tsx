import { StrategyNav } from '@/components/strategy/strategy-nav'

export default function StrategyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-full">
      <StrategyNav />
      {children}
    </div>
  )
}
