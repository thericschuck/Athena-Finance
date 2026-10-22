/**
 * Reine Beispieldaten und Builder für das Dashboard-Mockup — keine Hooks,
 * kein State, kein Browser-Zugriff, also unabhängig von der Client-Grenze.
 * Aus DashboardMock.tsx herausgelöst.
 */
import {
  LayoutDashboard, Sparkles, TrendingUp, LineChart, BarChart2, Gem, Settings,
} from 'lucide-react'
import type { NetWorthSnapshot } from '@/components/dashboard/net-worth-chart'
import type { Summary } from '@/components/dashboard/finance-analytics'
import type { DonutEntry } from '@/components/crypto/portfolio-donut-card'
import type { HeatmapDay, SankeyData, CashflowEvent, MonthlyComparison, CategoryDatum } from '@/lib/analyseData'
import { APP } from '@/components/landing/landing-tokens'

/**
 * Reihenfolge und Icons wie in der echten Sidebar. `children` nur bei den
 * beiden Einträgen, die im Mockup tatsächlich aktiv werden (Finance, Crypto)
 * — exakt dieselben Unterpunkte wie in sidebar.tsx.
 */
export const NAV = [
  { icon: LayoutDashboard, label: 'Dashboard' },
  { icon: Sparkles, label: 'Athena' },
  { icon: TrendingUp, label: 'Finance', children: ['Konten', 'Transaktionen', 'Planung', 'Budget', 'Steuer'] },
  { icon: LineChart, label: 'Investing', children: ['Krypto', 'Depot', 'Strategie'] },
  { icon: BarChart2, label: 'Analyse', children: ['Übersicht', 'Bankdaten', 'Verlauf'] },
  { icon: Gem, label: 'Inventar' },
  { icon: Settings, label: 'Einstellungen' },
]

/**
 * Die vier Szenen, die beim Scrollen durchlaufen werden — je eine pro
 * Kennzahl auf der Säule (siehe STATS in LandingClient). `nav` bestimmt,
 * welcher Sidebar-Eintrag dabei aktiv leuchtet (und ggf. seine Unterpunkte
 * aufklappt, siehe NAV oben).
 *
 * Liegt bewusst in dieser reinen Daten-Datei (ohne Komponenten) und nicht
 * neben DashboardMock: ein Export neben der Komponente würde deren
 * Fast-Refresh-Grenze aufweichen.
 */
export const MOCK_VIEWS = [
  { nav: 'Dashboard' },
  { nav: 'Analyse', child: 'Übersicht' },
  { nav: 'Athena' },
  { nav: 'Investing', child: 'Krypto' },
] as const

/** Vermögens-Kennzahl der Net-Worth-Karte (siehe DashboardTopRow). War früher ein Array
    mit drei weiteren Einträgen (Einnahmen/Monat, Ausgaben/Monat, Sparquote)
    als eigene Mini-Karten — die doppelten sich mit der rotierenden Säule
    daneben (siehe MOCK_VIEWS-Kommentar oben) und sind raus. */
export const NET_WORTH_STAT = { label: 'Vermögen', value: 84320, suffix: ' €', delta: '+12,4 %', up: true }

/**
 * Die erste Reihe der echten Dashboard-Seite: Net Worth · Monatsbilanz ·
 * Krypto (siehe app/(dashboard)/dashboard/page.tsx). Ersetzt die frühere
 * Vier-Kacheln-Reihe aus dem Figma-Redesign (Gesamtvermögen/Depot/Crypto/
 * Cash) — die gibt es in der App so nicht mehr.
 *
 * Die vier Posten addieren sich bewusst EXAKT auf NET_WORTH_STAT.value: die
 * echte Karte zeigt oben die Summe und darunter, woraus sie besteht. Geht
 * die Rechnung im Mockup nicht auf, fällt genau das jemandem auf, der die
 * App kennt.
 */
export const NET_WORTH_PARTS = [
  { label: 'Konten', value: '14.464 €' },
  { label: 'Geschäftsanteile', value: '2.400 €' },
  { label: 'Depot', value: '42.160 €' },
  { label: 'Krypto', value: '25.296 €' },
] as const

/** Monatsbilanz — dieselben Zahlen wie der letzte Eintrag in MONTHS, damit
    diese Karte und der Einnahmen/Ausgaben-Chart weiter unten in derselben
    Szene nicht zwei verschiedene Septembers zeigen. */
export const MONTH_CARD = {
  label: 'September 2026',
  net: '+2.660 €',
  income: '4.850 €',
  expense: '2.190 €',
  budgetPct: 78,
  budgetLabel: '2.190 € / 2.800 €',
} as const

/** Krypto-Kachel der ersten Reihe (CryptoWidget in der echten App): Wert,
    Veränderung, größte Positionen. Prozente wie in CRYPTO_ASSETS. */
export const CRYPTO_CARD = {
  value: '25.296 €',
  delta: '+21,7 %',
  top: [
    { label: 'PAXG', pct: '69,6 %' },
    { label: 'SOLANA', pct: '30,4 %' },
  ],
} as const

/**
 * Athenas Hinweise über dem Dashboard (siehe
 * components/dashboard/athena-insights.tsx). Der sichtbarste Zuwachs der App
 * seit der letzten Fassung dieses Mockups — und der Grund, warum „Athena"
 * inzwischen ein eigener Punkt direkt unter Dashboard in der Sidebar ist.
 */
export const ATHENA_INSIGHTS = [
  {
    severity: 'warning' as const,
    title: 'Abo „Cloud Pro" seit drei Monaten ungenutzt',
    body: 'Kündbar bis 30.09. · 14,99 € im Monat',
  },
  {
    severity: 'info' as const,
    title: 'Sparquote diesen Monat bei 54 %',
    body: 'Höchster Wert seit Februar',
  },
]

const MONTHS = [
  { m: 'Apr', ein: 4200, aus: 2600 },
  { m: 'Mai', ein: 4800, aus: 2900 },
  { m: 'Jun', ein: 3900, aus: 2400 },
  { m: 'Jul', ein: 5400, aus: 3100 },
  { m: 'Aug', ein: 4500, aus: 2500 },
  { m: 'Sep', ein: 4850, aus: 2190 },
]
/** MONTHS im Format der echten Summary-Zeilen (siehe finance-analytics.tsx)
    für IncomeExpenseChart — dieselben sechs Monate/Beträge wie MONTHS oben,
    nur als Summary[] statt als eigenes { m, ein, aus }-Shape. Felder, die
    IncomeExpenseChart nicht liest (food/leisure/...), sind 0 bzw. Platzhalter:
    der Chart zeigt nur total_income/total_expenses/net_balance. */
export const FINANCE_SUMMARIES: Summary[] = MONTHS.map((b, i) => ({
  id: `mock-${i}`,
  user_id: 'mock',
  month: `2026-${String(4 + i).padStart(2, '0')}`,
  salary: b.ein,
  food: 0,
  leisure: 0,
  subscriptions: 0,
  savings_transfer: 0,
  pocket_money: 0,
  other_income: 0,
  other_expenses: 0,
  total_income: b.ein,
  total_expenses: b.aus,
  net_balance: b.ein - b.aus,
  source: 'mock',
  created_at: '2026-01-01T00:00:00Z',
}))

export const BOOKINGS = [
  { day: '01.09.', label: 'Miete', cat: 'Wohnen', amount: -1200 },
  { day: '30.08.', label: 'Gehalt', cat: 'Einkommen', amount: 3800 },
  { day: '29.08.', label: 'Sparplan MSCI World', cat: 'Depot', amount: -500 },
  { day: '28.08.', label: 'Freelance-Projekt', cat: 'Einkommen', amount: 950 },
  { day: '27.08.', label: 'Wocheneinkauf', cat: 'Lebensmittel', amount: -68.4 },
  { day: '26.08.', label: 'Netflix', cat: 'Abos', amount: -17.99 },
  { day: '25.08.', label: 'Tanken', cat: 'Transport', amount: -82.5 },
  { day: '24.08.', label: 'Dividende Allianz', cat: 'Depot', amount: 124.6 },
]

/**
 * Bausteine des Nettovermögens, deckungsgleich mit NET_WORTH_PARTS und in der
 * Summe mit NET_WORTH_STAT.value. Speisen sowohl den echten PortfolioDonut
 * als auch (skaliert über die Monate) die Snapshots für den NetWorthChart —
 * beide Charts stehen nebeneinander in derselben Szene und dürfen sich nicht
 * widersprechen.
 */
export const NET_WORTH_BUCKETS = { konten: 14464, investment: 2400, depot: 42160, crypto: 25296 } as const

/** Monatswerte des Gesamtvermögens. Bewusst mit echten Rückgängen statt einer
    glatten Aufwärtskurve: ein Depot-/Krypto-Mix schwankt real, und eine
    lineare Linie sieht neben den anderen Charts der Seite erfunden aus. */
const NET_WORTH_MONTHLY = [58400, 61100, 59200, 63800, 68400, 65100, 71900, 76200, 73800, 79600, 81700, 84320]

/**
 * NET_WORTH_MONTHLY im Snapshot-Format des echten NetWorthChart.
 *
 * Die Stichtage werden beim Aufruf aus dem HEUTIGEN Datum zurückgerechnet
 * (dasselbe Vorgehen wie buildMockHeatmapData weiter unten), nicht fest
 * notiert: der Chart filtert standardmäßig auf „1J" ab jetzt: mit
 * hartkodierten Daten stünde die Kachel in einem Jahr leer da, ohne dass
 * jemand etwas geändert hätte.
 *
 * Die Buckets werden proportional mitskaliert, `total_checking` nimmt den
 * Rest auf — so ist die Gesamtsumme in jedem Monat exakt der Monatswert, und
 * die Tabs Gesamt/Konten/Depot/Krypto rechnen auf dieselbe Zahl wie die
 * Net-Worth-Kachel darüber.
 */
export function buildMockSnapshots(): NetWorthSnapshot[] {
  const last = NET_WORTH_MONTHLY[NET_WORTH_MONTHLY.length - 1]
  const today = new Date()
  return NET_WORTH_MONTHLY.map((value, i) => {
    const d = new Date(today)
    d.setMonth(d.getMonth() - (NET_WORTH_MONTHLY.length - 1 - i))
    const r = value / last
    const investment = Math.round(NET_WORTH_BUCKETS.investment * r)
    const depot = Math.round(NET_WORTH_BUCKETS.depot * r)
    const crypto = Math.round(NET_WORTH_BUCKETS.crypto * r)
    return {
      snapshot_date: d.toISOString().slice(0, 10),
      net_worth: value,
      total_checking: value - investment - depot - crypto,
      total_investment: investment,
      total_savings: 0,
      total_cash: 0,
      total_depot: depot,
      total_crypto: crypto,
      total_bausparer: 0,
      total_business: 0,
      total_debts: 0,
      total_assets: value,
    }
  })
}

/** Portfolio-Wert für die Crypto-Szene — volatiler als der Kontostand,
    deshalb sichtbar unruhigerer Verlauf. */
export const PORTFOLIO_HISTORY = [
  { label: 'Feb', value: 8200 },
  { label: 'Mär', value: 7600 },
  { label: 'Apr', value: 9100 },
  { label: 'Mai', value: 8800 },
  { label: 'Jun', value: 10200 },
  { label: 'Jul', value: 11400 },
  { label: 'Aug', value: 10800 },
  { label: 'Sep', value: 12600 },
]

/** PORTFOLIO_HISTORY im Format von PortfolioAreaChart (echte Crypto-
    Komponente, siehe Import oben) — ISO-Datum statt deutschem Label
    (die Komponente formatiert selbst und braucht ein echtes Datum), eine
    Spalte "Portfolio"
    statt mehrerer Depots: die Landing-Szene zeigt nur einen Gesamtverlauf. */
export const CRYPTO_CHART_DATA: Array<Record<string, string | number>> = PORTFOLIO_HISTORY.map((p, i) => ({
  date: `2026-${String(2 + i).padStart(2, '0')}-01`,
  Portfolio: p.value,
}))
const CRYPTO_MONTH_ABBR = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
export const cryptoXFormatter = (v: string) => CRYPTO_MONTH_ABBR[Number(v.slice(5, 7)) - 1]

/**
 * Athena-Szene: Sessions links, Gespräch rechts. Der Verlauf führt bewusst
 * auf eine Schreibaktion hinaus — dass Athena eine Änderung VORSCHLÄGT und
 * erst ein Klick sie ausführt, ist das Prinzip, nach dem der Assistent
 * gebaut ist, und lässt sich in einem Standbild sonst nicht zeigen.
 */
export const ATHENA_SESSIONS = [
  { title: 'Abos & Fixkosten', when: 'Heute', active: true },
  { title: 'Steuerschätzung 2026', when: 'Gestern', active: false },
  { title: 'Depot-Rebalancing', when: 'Mo', active: false },
  { title: 'Budget September', when: '2. Sep', active: false },
] as const

/** Die vorgeschlagene Schreibaktion — Aufbau wie PendingActionCard:
    Klartext-Satz plus die Aufschlüsselung, auf der die Entscheidung beruht.
    „Vertrag kündigen" allein ist keine Grundlage für ein Ja. */
export const ATHENA_ACTION = {
  summary: 'Vertrag „Cloud Pro" zum 30.09.2026 kündigen',
  label: 'Vertrag kündigen',
  details: [
    { label: 'Vertrag', value: 'Cloud Pro · 14,99 € / Monat' },
    { label: 'Kündigungsfrist', value: '4 Wochen zum Monatsende' },
    { label: 'Nächster Termin', value: '30.09.2026' },
  ],
} as const

/** Aktuelle Verteilung der Crypto-Szene — nur noch für „Größte Position" in
    den Stat-Kacheln gebraucht (siehe CryptoView); die Ring-Charts selbst
    laufen längst über CURRENT_ALLOCATION_ENTRIES/TARGET_ALLOCATION_ENTRIES
    unten (echte DonutCard-Komponente, eigenes DonutEntry-Shape). */
export const CURRENT_ALLOCATION = [
  { label: 'PAXG', pct: 70, color: APP.gold },
  { label: 'SOLANA', pct: 30, color: APP.cat6 },
]
/** color/pct hier dieselben Werte wie CURRENT_ALLOCATION (siehe oben) —
    Farbpunkt und Anteils-Balken je Zeile in AssetsList sollen sich sichtbar
    auf den „Aktuelle Verteilung"-Ring daneben beziehen, nicht zufällig
    andersfarbig sein. */
export const CRYPTO_ASSETS = [
  { label: 'PAXG', sub: '1.035 · 69,6 %', amount: '1.035 €', pct: 70, color: APP.gold },
  { label: 'SOLANA', sub: '3,42 · 30,4 %', amount: '459 €', pct: 30, color: APP.cat6 },
] as const

/** CURRENT_ALLOCATION_ENTRIES/TARGET_ALLOCATION_ENTRIES für die echte
    DonutCard-Komponente — dieselben Prozente wie CURRENT_ALLOCATION oben,
    jetzt mit Euro-Beträgen (deckungsgleich mit CRYPTO_ASSETS) und echten
    coingecko-Ids für die COIN_COLORS-Palette in portfolio-donut-card.tsx.
    'hyperliquid' ist dort nicht gemappt und fällt auf FALLBACK_COLORS
    zurück — kein eigener Farbwert nötig. */
export const CURRENT_ALLOCATION_ENTRIES: DonutEntry[] = [
  { label: 'PAXG', coingecko_id: 'pax-gold', value: 1035, pct: 69.6 },
  { label: 'SOLANA', coingecko_id: 'solana', value: 459, pct: 30.4 },
]
export const TARGET_ALLOCATION_ENTRIES: DonutEntry[] = [
  { label: 'ETH', coingecko_id: 'ethereum', value: 1018.64, pct: 68 },
  { label: 'HYPE', coingecko_id: 'hyperliquid', value: 209.72, pct: 14 },
  { label: 'PAXG', coingecko_id: 'pax-gold', value: 89.88, pct: 6 },
  { label: 'CVX', coingecko_id: 'convex-finance', value: 179.76, pct: 12 },
]
export const currentAllocationTotal = CURRENT_ALLOCATION_ENTRIES.reduce((s, e) => s + e.value, 0)
export const targetAllocationTotal = TARGET_ALLOCATION_ENTRIES.reduce((s, e) => s + e.value, 0)

/**
 * Deterministischer 32-Bit-Integer-Hash statt Math.random() — dieselbe
 * Begründung wie überall sonst in der Landing Page (siehe pseudoNoise in
 * LandingClient.tsx): Math.sin/Math.random liefern zwischen Server- und
 * Client-Render nicht garantiert denselben Wert, ein Hash auf ganzen Zahlen
 * schon. Liefert einen Wert in [0, 1).
 */
function hashNoise(seed: number): number {
  let h = Math.imul(seed | 0, 0x27d4eb2d)
  h ^= h >>> 15
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  return (h >>> 0) / 0xffffffff
}

/**
 * Ausgaben-Heatmap-Daten für die echte AusgabenHeatmap-Komponente (siehe
 * Import oben) — 371 Tage relativ zu "heute" statt fester Datums-Strings:
 * AusgabenHeatmap berechnet ihr 52-Wochen-Fenster selbst aus `new Date()`
 * zur Renderzeit, feste Vergangenheits-Daten wären irgendwann außerhalb
 * dieses Fensters und die Heatmap liefe leer. Gehalt am Monatsersten, Miete
 * am Dritten, sonst ein hash-basiertes Auf und Ab — genug Varianz für alle
 * sechs Ausgaben-Stufen der Komponente, ohne echte Transaktionen zu erfinden.
 */
export function buildMockHeatmapData(): HeatmapDay[] {
  const today = new Date()
  const data: HeatmapDay[] = []
  for (let offset = 0; offset < 371; offset++) {
    const d = new Date(today)
    d.setDate(d.getDate() - offset)
    const dayOfMonth = d.getDate()
    const n = hashNoise(offset * 7 + 3)
    const n2 = hashNoise(offset * 13 + 91)
    // Ausgaben nur an gut der Hälfte der Tage statt (fast) täglich — vorher
    // hatten ~88% der Tage irgendeine Ausgabe UND nur 2 Tage/Monat Einnahmen,
    // der Netto-Saldo war dadurch fast durchgehend negativ und der GuV-Modus
    // wirkte fast komplett rot statt einer ausgewogenen Mischung (siehe Chat).
    let amount = n > 0.45 ? Math.round(10 + n * 160) : 0
    // Gelegentliche kleine Einnahmen (Erstattung, Nebenverdienst, Dividende)
    // zusätzlich zu Gehalt/Freelance — sorgt für mehr grüne Tage im GuV-Modus,
    // nicht nur zwei Spitzen im ganzen Monat.
    let income = n2 > 0.82 ? Math.round(30 + n2 * 180) : 0
    if (dayOfMonth === 1) income += 3800 // Gehalt
    if (dayOfMonth === 24) income += 950 // Freelance-Projekt
    if (dayOfMonth === 3) amount += 1200 // Miete
    data.push({ date: d.toISOString().split('T')[0], amount, income })
  }
  return data
}

/** Geldfluss (Sankey) für die echte GeldflussChart-Komponente — Einnahmen
    (Gehalt/Freelance) münden in „Einnahmen", von dort auf die Top-
    Ausgabenkategorien plus „Überschuss", genau wie buildSankey() das auf
    der echten Analyse-Seite aus echten Transaktionen aufbaut. */
export const SANKEY_DATA: SankeyData = {
  nodes: [
    { name: 'Gehalt' }, { name: 'Freelance' },
    { name: 'Einnahmen' },
    { name: 'Miete' }, { name: 'Lebensmittel' }, { name: 'Transport' }, { name: 'Abos' }, { name: 'Sonstiges' },
    { name: 'Überschuss' },
  ],
  links: [
    { source: 0, target: 2, value: 3800 },
    { source: 1, target: 2, value: 950 },
    { source: 2, target: 3, value: 1200 },
    { source: 2, target: 4, value: 480 },
    { source: 2, target: 5, value: 310 },
    { source: 2, target: 6, value: 95 },
    { source: 2, target: 7, value: 200 },
    { source: 2, target: 8, value: 2465 },
  ],
}

/** Cashflow-Ereignisse für die echte CashflowKalender-Komponente — Tage
    relativ zum aktuellen Monat (die Komponente öffnet sich standardmäßig
    auf `new Date()`s Monat/Jahr), sonst wäre der Kalender beim Laden leer. */
export function buildMockCashflowEvents(): CashflowEvent[] {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const mk = (day: number, type: 'income' | 'expense', label: string, amount: number): CashflowEvent => ({
    date: `${y}-${m}-${String(day).padStart(2, '0')}`, type, label, amount, kind: 'echt', zaehlt: true,
  })
  return [
    mk(1, 'income', 'Gehalt', 3800),
    mk(3, 'expense', 'Miete', 1200),
    mk(5, 'expense', 'Lebensmittel', 68.4),
    mk(9, 'expense', 'Transport', 82.5),
    mk(12, 'expense', 'Abos', 17.99),
    mk(15, 'income', 'Dividende Allianz', 124.6),
    mk(18, 'expense', 'Lebensmittel', 54.2),
    mk(22, 'expense', 'Freizeit', 39),
    mk(24, 'income', 'Freelance-Projekt', 950),
    mk(27, 'expense', 'Lebensmittel', 61.8),
  ]
}

/** Monatsvergleich + Kategorien — nur als „Vorschau" unterhalb von Geldfluss/
    Kalender gedacht (siehe AnalyseView-Kommentar): zeigt an, dass die Szene
    theoretisch weitergeht, genau wie die echte Analyse-Seite. MONTHLY_COMPARISON
    aus denselben MONTHS-Zahlen wie IncomeExpenseChart oben, damit beide
    Dashboard- und Analyse-Szene dieselbe Geschichte erzählen. */
export const MONTHLY_COMPARISON: MonthlyComparison[] = MONTHS.map((m) => ({
  month: m.m,
  einnahmen: m.ein,
  ausgaben: m.aus,
  sparquote: Math.round(((m.ein - m.aus) / m.ein) * 100),
}))
export const CATEGORY_DATA: CategoryDatum[] = [
  { name: 'Gehalt', value: 3800 },
  { name: 'Freelance', value: 950 },
  { name: 'Wohnen', value: -1200 },
  { name: 'Lebensmittel', value: -480 },
  { name: 'Transport', value: -310 },
  { name: 'Abos', value: -95 },
  { name: 'Sonstiges', value: -200 },
]

/** Basiswerte für die „24/7 Echtzeitdaten"-Szene — Live-Jitter siehe useLiveTicker. */
export const TICKER_BASE = [
  { sym: 'BTC', price: 61480, deltaPct: 2.4 },
  { sym: 'ETH', price: 2914, deltaPct: 1.8 },
  { sym: 'MSCI World', price: 112.4, deltaPct: -0.3 },
  { sym: 'Allianz', price: 289.6, deltaPct: 0.9 },
]

export const euro = (n: number) =>
  `${n > 0 ? '+' : '−'}${Math.abs(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

/** Wie `euro`, aber ohne erzwungenes Vorzeichen — für Stat-Kacheln, die
    selbst schon ein „+" davorsetzen (siehe StatTile), oder gar keins
    brauchen (Portfoliowert, Investiert). */
export const fmtEurPlain = (n: number) =>
  `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

export const fmtPrice = (n: number) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: n >= 1000 ? 0 : 2, maximumFractionDigits: n >= 1000 ? 0 : 2 })
