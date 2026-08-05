/**
 * Onyx & Cream — Farbtokens für Landing Page und Login.
 *
 * Editorial-klassische Palette. Alle Text-auf-Fläche-Kombinationen unten sind
 * gegen WCAG AA (4.5:1 für Text, 3:1 für Grafik) geprüft — die Kommentare
 * nennen das jeweils gemessene Verhältnis.
 *
 * ACHTUNG: dieselben Werte liegen als --af-*-Custom-Properties im
 * :root-Block am Ende von src/app/globals.css, von wo die Stylesheets
 * (landing.css, login.css) sie beziehen. Änderungen immer in beiden Dateien
 * nachziehen.
 *
 * Warum doppelt: SVG-Präsentationsattribute wie fill/stroke akzeptieren kein
 * var() — olive-vines.tsx braucht die Werte deshalb als JS-Literale.
 */
export const C = {
  // ── Flächen ──────────────────────────────────────────────────────────────
  parchment: '#F7F5F0', // Seitenhintergrund (Palette: Background)
  paper: '#FFFFFF', // erhöhte Karten auf Parchment
  cream: '#E8E0D0', // Palette: Accent — Bänder, Swatches, Text auf Onyx
  creamDeep: '#DCD2BD', // Cream-Variante für Kanten/Hover

  onyx: '#1A1A1A', // Palette: Primary — dunkle Bänder, Buttons
  onyxWarm: '#141412', // App-Preview-Slab (leicht wärmer als Onyx)
  onyxLift: '#232320', // Karten innerhalb dunkler Bänder
  graphite: '#3D3D3D', // Palette: Secondary

  // ── Text auf Parchment ───────────────────────────────────────────────────
  ink: '#1A1A1A', // Headlines — 15.6:1
  inkBody: '#5C574E', // Fließtext — 6.5:1
  inkSubtle: '#6E675C', // Kicker, Labels (klein) — 5.1:1
  inkFaint: '#8A8378', // rein dekorativ / ≥18px — 3.4:1

  // ── Text auf Onyx ────────────────────────────────────────────────────────
  onCream: '#E8E0D0', // Headlines auf Onyx — 13.1:1
  onBody: '#A9A197', // Fließtext auf Onyx — 6.4:1
  onSubtle: '#877F74', // Labels auf Onyx — 4.5:1

  // ── Akzente ──────────────────────────────────────────────────────────────
  olive: '#6B7F5C', // Ranken, Grafik auf Parchment — 4.0:1 (Grafik ✓)
  oliveDeep: '#4A5B3D', // Olive als Kleintext auf Parchment — 6.7:1
  oliveLight: '#8CA277', // Blattinneres, Grafik auf Onyx
  gold: '#B88F51', // Logo-Gold — Grafik, Text auf Onyx (5.8:1)
  goldInk: '#8A6A2F', // Gold als Text auf Parchment — 4.6:1

  // ── Nur für Text über dem Hero-Aquarell ──────────────────────────────────
  // Das Bild läuft vollflächig in Originalfarben — keine Maske, kein Verlauf,
  // keine Fläche darüber. Der Grund ist dadurch deutlich dunkler als
  // Parchment, weshalb goldInk dort nur 2.4:1 erreicht. Diese Tiefvariante
  // hebt den Mittelwert über die 3:1-Schwelle für große Schrift, ohne das Bild
  // anzufassen. Achtung: über den dunklen Baumgruppen bleibt der Kontrast
  // punktuell darunter — mehr ist ohne Abdunkelung des Bildes nicht möglich.
  goldInkDeep: '#6E5426', // 3.4:1 im Mittel über dem Bild
  terracotta: '#A9553C', // klassisches Ton-Rot für Akzente

  // ── Linien ───────────────────────────────────────────────────────────────
  rule: 'rgba(26,26,26,0.14)', // Haarlinie auf Parchment
  ruleSoft: 'rgba(26,26,26,0.08)',
  ruleOn: 'rgba(232,224,208,0.16)', // Haarlinie auf Onyx
  ruleOnSoft: 'rgba(232,224,208,0.09)',
} as const

/** Font-Stacks (Variablen kommen aus app/layout.tsx). */
export const F = {
  display: 'var(--font-playfair)', // Playfair Display — Headlines
  serif: 'var(--font-lora)', // Lora — Fließtext
  sans: 'var(--font-geist-sans)', // Geist — UI, Kicker, Labels
  mono: 'var(--font-geist-mono)', // Geist Mono — Zahlen
} as const

/** Vertikaler Rhythmus der Sektionen (4/8-Raster). */
export const SPACE = {
  section: 'clamp(72px, 9vw, 128px)',
  gutter: 'clamp(20px, 4vw, 32px)',
} as const

/** Letterspaced Kapitälchen-Label — wird an mehreren Stellen gebraucht. */
export const kicker = {
  fontFamily: F.sans,
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.24em',
  textTransform: 'uppercase',
} as const
