'use client'

import { Eye, EyeOff } from 'lucide-react'
import { usePrivacy } from '@/components/providers/privacy-context'
import { cn } from '@/lib/utils'

export function PrivacyToggle({ className }: { className?: string }) {
  const { hidden, toggle } = usePrivacy()

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={hidden}
      aria-label={hidden ? 'Zahlen einblenden' : 'Zahlen für Präsentation ausblenden'}
      title={hidden ? 'Zahlen einblenden' : 'Zahlen für Präsentation ausblenden'}
      className={cn(
        'flex size-9 items-center justify-center rounded-md transition-colors',
        hidden
          ? 'text-sidebar-primary hover:bg-sidebar-accent'
          : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent',
        className,
      )}
    >
      {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  )
}
