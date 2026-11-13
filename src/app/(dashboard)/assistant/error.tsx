'use client'

import { ErrorFallback } from '@/components/ui/error-fallback'

export default function AssistantError(props: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return <ErrorFallback {...props} area="Athena" />
}
