'use client'

import { ErrorFallback } from '@/components/ui/error-fallback'

export default function DepotError(props: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return <ErrorFallback {...props} area="Depot" />
}
