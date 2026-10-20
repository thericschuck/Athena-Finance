'use client'

import { useEffect } from 'react'

// Ersetzt das Root-Layout: eigenes <html>/<body>, keine globalen Styles -> Inline-Styles.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error('[global-error]', error.digest ?? 'kein digest')
  }, [error])

  return (
    <html lang="de">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          fontFamily: 'system-ui, sans-serif',
          colorScheme: 'light dark',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 380 }}>
          <h2 style={{ fontSize: 20, margin: '0 0 8px' }}>Etwas ist schiefgelaufen</h2>
          <p style={{ fontSize: 14, opacity: 0.7, margin: '0 0 16px' }}>
            Es ist ein unerwarteter Fehler aufgetreten. Bitte versuche es erneut.
          </p>
          <button
            onClick={() => retry()}
            style={{ padding: '8px 16px', fontSize: 14, borderRadius: 6, cursor: 'pointer' }}
          >
            Erneut versuchen
          </button>
        </div>
      </body>
    </html>
  )
}
