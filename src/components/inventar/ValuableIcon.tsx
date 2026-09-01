/**
 * Kategorie-Icons für die Vitrine.
 *
 * Handgebaut statt aus einer Icon-Bibliothek: die Karte zeigt das Icon groß (bis 96 px) als
 * Ersatz für ein fehlendes Objektbild, und dafür sind Lucide-Icons zu dünn — bei der Größe
 * sieht eine 2-px-Linie aus wie ein Drahtgestell. Diese hier haben eine gefüllte Grundform
 * plus Kontur, tragen also auch groß.
 *
 * Zwei Farben, beide aus Theme-Tokens: die Fläche in `--chart-accent` mit niedriger Deckkraft,
 * die Kontur in `currentColor`. Damit ziehen sie durch alle acht Presets mit (globals.css) —
 * ein fest kodiertes Gold wäre unter `arctic` oder `sakura` ein Fremdkörper.
 *
 * WICHTIG: jeder Schlüssel aus KATEGORIEN (lib/valuables.ts) muss hier vorkommen, sonst
 * rendert die Karte ins Leere. `ICONS` deckt das über den Record-Typ ab — ein fehlender
 * Schlüssel ist ein Typfehler.
 */
import type { KategorieKey } from '@/lib/valuables'

interface IconProps {
  kategorie: string
  className?: string
}

const FILL = 'color-mix(in srgb, var(--chart-accent) 22%, transparent)'

/** Gemeinsame Zeichenfläche — spart die Wiederholung der svg-Attribute in jedem Icon. */
function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  )
}

const ICONS: Record<KategorieKey, React.ReactNode> = {
  uhr: (
    <>
      <circle cx="12" cy="12.5" r="6.2" fill={FILL} />
      <path d="M12 9.2v3.3l2.1 1.6" />
      <path d="M9.4 6.6 9.9 3.5h4.2l.5 3.1M9.4 18.4l.5 3.1h4.2l.5-3.1" fill={FILL} />
    </>
  ),
  feuerzeug: (
    <>
      <rect x="7.5" y="10" width="9" height="11" rx="1.8" fill={FILL} />
      <path d="M7.5 13.5h9" />
      <path d="M14.5 10V8.2h-2" />
      <path d="M12 6.8c1.5-1.4.6-3.3.6-3.3s2.6 1.4 2.6 3.6a2.6 2.6 0 1 1-5.2 0c0-.7.3-1.3.7-1.8.3.7 1 1.3 1.3 1.5Z" fill={FILL} />
    </>
  ),
  schmuck: (
    <>
      <circle cx="12" cy="15" r="5.4" fill={FILL} />
      <circle cx="12" cy="15" r="2.6" />
      <path d="m12 2.6 3 3.4-3 3.4-3-3.4 3-3.4Z" fill={FILL} />
    </>
  ),
  schreibgeraet: (
    <>
      <path d="M15.6 3.4 20.6 8.4 9.8 19.2l-5 0 0-5L15.6 3.4Z" fill={FILL} />
      <path d="M14.2 4.8 19.2 9.8" />
      <path d="m6.6 17.4 2.6-.6-2-2-.6 2.6Z" />
    </>
  ),
  brille: (
    <>
      <circle cx="6.4" cy="14" r="3.6" fill={FILL} />
      <circle cx="17.6" cy="14" r="3.6" fill={FILL} />
      <path d="M10 13.4c1.2-.8 2.8-.8 4 0" />
      <path d="M2.8 12.6 4.4 8.6M21.2 12.6 19.6 8.6" />
    </>
  ),
  leder: (
    <>
      <path d="M4.6 8.6h14.8l-1.1 11.2a1.4 1.4 0 0 1-1.4 1.2H7.1a1.4 1.4 0 0 1-1.4-1.2L4.6 8.6Z" fill={FILL} />
      <path d="M8.6 8.6V6.4a3.4 3.4 0 0 1 6.8 0v2.2" />
      <path d="M4.6 12.6h14.8" />
    </>
  ),
  kleidung: (
    <>
      {/* Handschuh — steht für die ganze Kategorie, weil ein T-Shirt-Piktogramm bei
          Wertgegenständen die falsche Erwartung weckt. */}
      <path d="M7.8 21.2v-4.6c-1.5-.5-2.6-1.9-2.6-3.6V9.2a1.2 1.2 0 0 1 2.4 0v2.4" fill={FILL} />
      <path d="M7.6 11.6V4.6a1.3 1.3 0 0 1 2.6 0v6.4" fill={FILL} />
      <path d="M10.2 11V3.8a1.3 1.3 0 0 1 2.6 0V11" fill={FILL} />
      <path d="M12.8 11.2V5.2a1.3 1.3 0 0 1 2.6 0v7.4" fill={FILL} />
      <path d="M15.4 12.6v-1a1.3 1.3 0 0 1 2.6 0v3.2c0 3.2-2.2 5-2.2 6.4" fill={FILL} />
      <path d="M7.8 21.2h7.8" />
    </>
  ),
  kunst: (
    <>
      <rect x="3.2" y="4.2" width="17.6" height="15.6" rx="1.4" fill={FILL} />
      <circle cx="8.6" cy="9.4" r="1.4" />
      <path d="m3.2 16.4 4.6-4.2 3.4 3 3-2.6 6.6 5" />
    </>
  ),
  muenze: (
    <>
      <ellipse cx="12" cy="8" rx="7" ry="3.2" fill={FILL} />
      <path d="M5 8v7.4c0 1.8 3.1 3.2 7 3.2s7-1.4 7-3.2V8" fill={FILL} />
      <path d="M5 11.8c0 1.8 3.1 3.2 7 3.2s7-1.4 7-3.2" />
    </>
  ),
  technik: (
    <>
      <rect x="3" y="5.2" width="18" height="12" rx="1.6" fill={FILL} />
      <path d="M6.2 8.4h7" />
      <path d="M6.2 11.4h4.4" />
      <path d="M8 20.4h8" />
      <path d="M12 17.2v3.2" />
    </>
  ),
  instrument: (
    <>
      <path d="M13.4 9.6c2.4 1 3.6 3.2 2.8 5.6-.9 2.6-3.9 4-6.6 3.1-2.4-.8-3.6-3-2.9-5.2.8-2.5 4-4.5 6.7-3.5Z" fill={FILL} />
      <circle cx="11.6" cy="14.4" r="2" />
      <path d="m15.2 8.6 4.4-5.2" />
      <path d="m17.2 4.6 2.2 2" />
    </>
  ),
  sammlung: (
    <>
      <rect x="4.6" y="3" width="14.8" height="18" rx="1.6" fill={FILL} />
      <path d="m12 7.6 1.5 3 3.3.5-2.4 2.3.6 3.3-3-1.6-3 1.6.6-3.3-2.4-2.3 3.3-.5 1.5-3Z" />
    </>
  ),
  sonstiges: (
    <>
      <path d="M12 2.8 20.4 7v10L12 21.2 3.6 17V7L12 2.8Z" fill={FILL} />
      <path d="M3.6 7 12 11.4 20.4 7" />
      <path d="M12 11.4v9.8" />
    </>
  ),
}

export function ValuableIcon({ kategorie, className }: IconProps) {
  // Unbekannter Schlüssel (z. B. aus einer älteren Zeile) fällt auf „Sonstiges" zurück,
  // statt eine leere Fläche zu rendern.
  const icon = ICONS[kategorie as KategorieKey] ?? ICONS.sonstiges
  return <Frame className={className}>{icon}</Frame>
}
