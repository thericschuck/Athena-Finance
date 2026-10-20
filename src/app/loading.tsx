import { Logo } from '@/components/ui/logo'
import { C, F } from '@/components/landing/landing-tokens'

/**
 * Next.js zeigt diese Datei automatisch als Suspense-Fallback, solange
 * app/page.tsx lädt — und genau dort lag der weiße Bildschirm: page.tsx ist
 * eine async Server Component, die vor jedem Rendern erst per Supabase-
 * Netzwerkaufruf prüft, ob eine Session besteht. Ohne loading.tsx schickt
 * Next.js in dieser Zeit gar kein HTML — der Browser zeigt sein eigenes
 * Blanko-Weiß, und sobald die Antwort da ist, poppt die volle, bereits fertig
 * gestylte Seite (inklusive längst angelaufener CSS-Animationen) auf einen
 * Schlag auf.
 *
 * Mit dieser Datei bekommt der Browser sofort ein leichtgewichtiges,
 * gebrandetes Bild statt Weiß, und wenn die echte Seite eintrifft, ersetzt
 * React nur den DOM-Knoten — die eigenen Eintritts-Animationen von
 * Landing-Komponenten (af-rise, Ranken, Athena) laufen danach unverändert normal
 * an, jetzt aber sichtbar statt teils schon während der Ladezeit verpufft.
 *
 * Bewusst eine Server Component (kein 'use client'): dieser Bildschirm muss
 * so schnell wie möglich stehen, jedes Byte an Client-JS würde ihn verzögern.
 */
export default function Loading() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '18px',
        backgroundColor: C.parchment,
      }}
    >
      <style>{`
        @keyframes af-loading-breathe {
          0%, 100% { opacity: .38; transform: scale(.97); }
          50%      { opacity: 1;   transform: scale(1); }
        }
        .af-loading-mark { animation: af-loading-breathe 1.8s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .af-loading-mark { animation: none; opacity: 1; transform: none; }
        }
      `}</style>
      <div className="af-loading-mark">
        <Logo variant="dark" size={40} priority />
      </div>
      <span
        style={{
          fontFamily: F.display,
          fontSize: '13px',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: C.inkFaint,
        }}
      >
        Athena Finance
      </span>
    </div>
  )
}
