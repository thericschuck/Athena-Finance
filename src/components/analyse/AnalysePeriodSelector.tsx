'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useTransition } from 'react'

const PERIODS = ['1M', '3M', '6M', '1J', 'Alles'] as const

interface Props { current: string }

export function AnalysePeriodSelector({ current }: Props) {
  const router  = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()

  return (
    <div className={`flex gap-1 transition-opacity ${pending ? 'opacity-60' : ''}`}>
      {PERIODS.map(p => (
        <button
          key={p}
          onClick={() => startTransition(() => {
            router.push(`${pathname}?period=${p}`, { scroll: false })
          })}
          className={`px-2.5 py-1 text-xs rounded font-medium transition-all duration-150 ${
            current === p
              ? 'bg-foreground text-background scale-105'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  )
}
