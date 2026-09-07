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
  parchment: '#F4EFE4', // Seitenhintergrund (Palette: Background) — etwas cremiger als reines Weiß
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

  // Ursprünglich nur für Text über dem Hero-Aquarell gedacht (siehe unten),
  // eignet sich aber auch als Bronze-Fläche: Cream-Text darauf erreicht
  // 5,4:1 — deshalb zusätzlich Hintergrund der Hero-CTA (.hero-btn-primary).
  //
  // Das Bild läuft vollflächig in Originalfarben — keine Maske, kein Verlauf,
  // keine Fläche darüber. Der Grund ist dadurch deutlich dunkler als
  // Parchment, weshalb goldInk dort nur 2.4:1 erreicht. Diese Tiefvariante
  // hebt den Mittelwert über die 3:1-Schwelle für große Schrift, ohne das Bild
  // anzufassen. Achtung: über den dunklen Baumgruppen bleibt der Kontrast
  // punktuell darunter — mehr ist ohne Abdunkelung des Bildes nicht möglich.
  goldInkDeep: '#6E5426', // 3.4:1 im Mittel über dem Bild, 5.4:1 auf Cream
  terracotta: '#A9553C', // klassisches Ton-Rot für Akzente

  // ── Linien ───────────────────────────────────────────────────────────────
  rule: 'rgba(26,26,26,0.14)', // Haarlinie auf Parchment
  ruleSoft: 'rgba(26,26,26,0.08)',
  ruleOn: 'rgba(232,224,208,0.16)', // Haarlinie auf Onyx
  ruleOnSoft: 'rgba(232,224,208,0.09)',
} as const

/**
 * Die Farbwelt des echten Dashboards, für das Mockup auf der Landing Page.
 *
 * Eins zu eins die Werte aus `[data-theme="athena-dark"]` in app/globals.css:
 * das Mockup soll zeigen, was Nutzer nach dem Login wirklich sehen, nicht
 * eine nachempfundene Illustration.
 *
 * Athena Dark statt des früheren „Aurum": es trägt dieselbe DNA wie die
 * Landing Page — Oliv, Gold und Terrakotta auf warmem Walnuss-Schwarz statt
 * Aurums neutralem Onyx — und führt ebenfalls Lora als Grundschrift. Der
 * Übergang vom Hero ins Mockup bleibt dadurch ohne Stilbruch, und die
 * Analyse-Szene (Heatmap/Sankey/Kalender) braucht keine handgezogenen
 * Sonderfarben mehr, um zur restlichen Seite zu passen: das Preset führt die
 * Landing-Palette bereits selbst.
 *
 * ACHTUNG: bei Änderungen am Preset in globals.css hier nachziehen. Als
 * JS-Literale nötig, weil Inline-Styles und SVG-Attribute die Theme-
 * Variablen nicht sehen — das Mockup liegt außerhalb des [data-theme]-Scopes.
 * Die MITGERENDERTEN echten App-Komponenten (IncomeExpenseChart,
 * AusgabenHeatmap, DepotChart, DonutCard …) arbeiten dagegen über
 * Tailwind-Klassen und beziehen ihre Farben aus `data-theme="athena-dark"`
 * am Mockup-Wurzelknoten (siehe DashboardMock) — beide Wege müssen deshalb
 * immer dasselbe Preset meinen.
 */
export const APP = {
  bg: '#1B170F', // --background
  card: '#221D15', // --card
  cardFg: '#F0E9D8', // --card-foreground
  secondary: '#2A2419', // --secondary
  secondaryFg: '#E8E0D0', // --secondary-foreground
  mutedFg: '#A79C87', // --muted-foreground
  accent: '#3A2E17', // --accent (getönte Gold-Fläche)
  /**
   * --accent-foreground bzw. --chart-accent. Heißt weiterhin `gold`, weil der
   * Name die Rolle beschreibt (Marken-Akzent), nicht den Hexwert.
   *
   * ACHTUNG: das ist NICHT --primary. In Athena Dark ist Primary das Oliv
   * (siehe `positive`), Gold ist dem Akzent und der Sidebar vorbehalten —
   * die Rollenverteilung ist eine andere als in Aurum, wo Gold beides war.
   */
  gold: '#D9B26E',
  destructive: '#C2694A', // --destructive
  border: 'rgba(240, 233, 216, 0.1)', // --border
  sidebar: '#0F0D09', // --sidebar (dunkelster Anker: sidebar < bg < card)
  sidebarFg: '#C9BFA8', // --sidebar-foreground
  /** --sidebar-primary/-foreground: die volle Gold-Fläche des aktiven
      Nav-Eintrags. Eigene Werte statt `gold`/`bg`, weil das Preset für die
      Sidebar bewusst ein tieferes Gold führt als für Charts. */
  sidebarPrimary: '#B88F51',
  sidebarPrimaryFg: '#14120C',
  sidebarAccent: '#1C1810', // --sidebar-accent (Hover, aktiver Unterpunkt)
  sidebarAccentFg: '#F0E9D8', // --sidebar-accent-foreground
  sidebarBorder: 'rgba(240, 233, 216, 0.08)', // --sidebar-border
  positive: '#8CA277', // --success / --primary / --chart-income
  warning: '#C9A063', // --warning (Budget-Balken kurz vor dem Limit)
  /** --chart-cat-6. Derselbe Wert wie --muted-foreground — das Preset setzt
      beide bewusst gleich; hier trotzdem eigener Name, weil es an den
      Verwendungsstellen um eine Kategoriefarbe geht, nicht um Textfarbe. */
  cat6: '#A79C87',
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
