'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import {
  LayoutDashboard, Sparkles, TrendingUp, LineChart, BarChart2, Gem, Settings,
  ArrowUpRight, ArrowDownRight, ArrowUp, Dot, Info, AlertTriangle, MessageSquare,
  Plus, Check, X,
} from 'lucide-react'
import { Logo } from '@/components/ui/logo'
import { AthenaAvatar } from '@/components/assistant/AthenaAvatar'
import type { NetWorthSnapshot } from '@/components/dashboard/net-worth-chart'
import { APP, F, kicker } from './landing-tokens'
import type { Summary } from '@/components/dashboard/finance-analytics'
import type { DonutEntry } from '@/components/crypto/portfolio-donut-card'
import type { HeatmapDay, SankeyData, CashflowEvent, MonthlyComparison, CategoryDatum } from '@/lib/analyseData'

/**
 * Dritter Schritt desselben Musters (siehe die Kommentare an den
 * Chart-Importen unten): die Analyse-Szene zog bisher drei erfundene Mini-Karten
 * (Sparziele/Top-Kategorien/Ø Ausgabe) statt echter Analyse-Bausteine — die
 * gab es auf der echten Analyse-Seite so gar nicht. Jetzt echtes Heatmap +
 * Geldfluss (Sankey) + Cashflow-Kalender aus der eingeloggten App, dieselben
 * drei, mit denen die echte /analyse-Seite oben beginnt. AusgabenHeatmap und
 * CashflowKalender haben keine schwere Chart-Abhängigkeit und sind deshalb
 * (wie im echten page.tsx) normale, nicht dynamische Imports; GeldflussChart
 * ist bereits selbst ein next/dynamic-Export (siehe die Datei).
 */
import { AusgabenHeatmap } from '@/components/analyse/AusgabenHeatmap'
import { GeldflussChart } from '@/components/analyse/GeldflussChart'
import { CashflowKalender } from '@/components/analyse/CashflowKalender'
import { MonatsVergleich } from '@/components/analyse/MonatsVergleich'
import { KategorienChart } from '@/components/analyse/KategorienChart'

/**
 * Pilot: der Depot-Chart der Landing-Szene läuft jetzt über dieselbe
 * recharts-Komponente wie das echte, eingeloggte Depot (depot-chart.tsx)
 * statt über eine handgebaute SVG-Nachbildung — „genau so aufgebaut wie die
 * echte Seite" lässt sich damit nicht mehr nur annähern, sondern ist
 * garantiert (identischer Code). recharts ist bereits Projekt-Dependency
 * (siehe package.json), kostet hier also keine neue Abhängigkeit.
 *
 * `next/dynamic` mit `ssr: false` hält recharts trotzdem aus dem initialen
 * Landing-Bundle heraus — exakt das Muster, das depot-chart.tsx im echten
 * Dashboard selbst schon für sich beansprucht ("recharts is a heavy
 * dependency ... non-critical, below-the-fold UI"). Läuft der Pilot sauber,
 * ziehen wir Dashboard-/Analyse-/Crypto-Charts in einem zweiten Schritt nach.
 */
/*
 * Die beiden Charts der ersten Dashboard-Reihe, direkt aus der App statt
 * nachgebaut. Bis zum Theme-Wechsel ging das nicht: beide färben über
 * var(--chart-*), und unter Aurum trafen die nicht die Palette, auf die das
 * Mockup von Hand gezogen war (siehe Kommentar oben, der genau das als Grund
 * fürs Nicht-Übernehmen nannte). Seit das Mockup auf demselben Preset läuft
 * wie die App (data-theme="athena-dark"), ist der Grund weg — und mit ihm
 * die handgebaute LiveChart-/PortfolioMixCard-Nachbildung, deren Auflösung,
 * Achsen und Tabs nie ganz die der echten Charts trafen.
 *
 * NetWorthChart bringt seine Zeitraum- und Ansicht-Tabs (1W…All, Gesamt/
 * Konten/Depot/Krypto) selbst mit — die früheren PeriodTabs/AssetTabs im
 * Mockup waren nur deren Attrappe.
 */
const NetWorthChart = dynamic(
  () => import('@/components/dashboard/net-worth-chart').then((m) => m.NetWorthChart),
  { ssr: false },
)
const PortfolioDonut = dynamic(
  () => import('@/components/dashboard/portfolio-donut').then((m) => m.PortfolioDonut),
  { ssr: false },
)

/**
 * Weitere Charts direkt aus der eingeloggten App statt handgebauter
 * SVG-Nachbildungen.
 *
 * Eine frühere Fassung dieses Kommentars führte hier eine Ausnahmeliste:
 * net-worth-chart.tsx, portfolio-donut.tsx und AusgabenHeatmap.tsx seien
 * bewusst NICHT übernommen, weil sie über var(--chart-*) färben und damit
 * eine andere Palette trafen als die von Hand auf Aurum gezogenen
 * Mockup-Farben. Diese Begründung ist mit dem Wechsel auf
 * data-theme="athena-dark" hinfällig geworden — das Mockup läuft jetzt auf
 * demselben Preset wie die App, also treffen die Variablen genau richtig.
 * Alle drei sind inzwischen übernommen; nachgebaut wird nur noch, was an
 * Server-Actions oder API-Routen hängt (siehe AthenaInsightsCard/AthenaView).
 */
const IncomeExpenseChart = dynamic(
  () => import('@/components/dashboard/finance-analytics').then((m) => m.IncomeExpenseChart),
  { ssr: false },
)
const PortfolioAreaChart = dynamic(
  () => import('@/components/crypto/portfolio-area-chart').then((m) => m.PortfolioAreaChart),
  { ssr: false },
)
const DonutCard = dynamic(
  () => import('@/components/crypto/portfolio-donut-card').then((m) => m.DonutCard),
  { ssr: false },
)

/**
 * Illustratives Dashboard für die Vollbild-Enthüllung.
 *
 * Sidebar-Struktur, Navigation und Grundpalette bleiben wiedererkennbar,
 * Kartenform und Layout pro Szene sind freie Illustration für die Landing
 * Page — aber die CHARTS selbst (Gridlines, Tooltips, Donut mit
 * Center-Label, Composed Bar+Line, Filter-Pills/Chips) übernehmen bewusst
 * exakt die visuelle Sprache der echten Chart-Komponenten (siehe
 * src/components/dashboard/net-worth-chart.tsx, finance-analytics.tsx,
 * portfolio-donut.tsx), nur auf die APP-Tokens statt Tailwind-Theme-Klassen
 * übertragen. Jede der vier Szenen (siehe MOCK_VIEWS) hat ihr eigenes Layout
 * statt nur getauschter Karten im selben Raster.
 *
 * Alle Zahlen sind Beispieldaten. Der gesamte Block ist `aria-hidden`: ein
 * Screenreader würde sonst erfundene Kontostände als echte Finanzdaten
 * vorlesen.
 */

/**
 * Reihenfolge und Icons wie in der echten Sidebar. `children` nur bei den
 * beiden Einträgen, die im Mockup tatsächlich aktiv werden (Finance, Crypto)
 * — exakt dieselben Unterpunkte wie in sidebar.tsx.
 */
const NAV = [
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
 * Nicht exportiert (mehr): wird nur innerhalb dieser Datei gelesen (siehe
 * `active` in DashboardMock unten) — ein Re-Export neben der Komponente
 * DashboardMock würde die Fast-Refresh-Grenze der Datei aufweichen.
 */
const MOCK_VIEWS = [
  { nav: 'Dashboard' },
  { nav: 'Analyse', child: 'Übersicht' },
  { nav: 'Athena' },
  { nav: 'Investing', child: 'Krypto' },
] as const

/** Vermögens-Kennzahl der Net-Worth-Karte (siehe DashboardTopRow). War früher ein Array
    mit drei weiteren Einträgen (Einnahmen/Monat, Ausgaben/Monat, Sparquote)
    als eigene Mini-Karten — die doppelten sich mit der rotierenden Säule
    daneben (siehe MOCK_VIEWS-Kommentar oben) und sind raus. */
const NET_WORTH_STAT = { label: 'Vermögen', value: 84320, suffix: ' €', delta: '+12,4 %', up: true }

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
const NET_WORTH_PARTS = [
  { label: 'Konten', value: '14.464 €' },
  { label: 'Geschäftsanteile', value: '2.400 €' },
  { label: 'Depot', value: '42.160 €' },
  { label: 'Krypto', value: '25.296 €' },
] as const

/** Monatsbilanz — dieselben Zahlen wie der letzte Eintrag in MONTHS, damit
    diese Karte und der Einnahmen/Ausgaben-Chart weiter unten in derselben
    Szene nicht zwei verschiedene Septembers zeigen. */
const MONTH_CARD = {
  label: 'September 2026',
  net: '+2.660 €',
  income: '4.850 €',
  expense: '2.190 €',
  budgetPct: 78,
  budgetLabel: '2.190 € / 2.800 €',
} as const

/** Krypto-Kachel der ersten Reihe (CryptoWidget in der echten App): Wert,
    Veränderung, größte Positionen. Prozente wie in CRYPTO_ASSETS. */
const CRYPTO_CARD = {
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
const ATHENA_INSIGHTS = [
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
const FINANCE_SUMMARIES: Summary[] = MONTHS.map((b, i) => ({
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

const BOOKINGS = [
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
const NET_WORTH_BUCKETS = { konten: 14464, investment: 2400, depot: 42160, crypto: 25296 } as const

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
function buildMockSnapshots(): NetWorthSnapshot[] {
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
const PORTFOLIO_HISTORY = [
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
const CRYPTO_CHART_DATA: Array<Record<string, string | number>> = PORTFOLIO_HISTORY.map((p, i) => ({
  date: `2026-${String(2 + i).padStart(2, '0')}-01`,
  Portfolio: p.value,
}))
const CRYPTO_MONTH_ABBR = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
const cryptoXFormatter = (v: string) => CRYPTO_MONTH_ABBR[Number(v.slice(5, 7)) - 1]

/**
 * Athena-Szene: Sessions links, Gespräch rechts. Der Verlauf führt bewusst
 * auf eine Schreibaktion hinaus — dass Athena eine Änderung VORSCHLÄGT und
 * erst ein Klick sie ausführt, ist das Prinzip, nach dem der Assistent
 * gebaut ist, und lässt sich in einem Standbild sonst nicht zeigen.
 */
const ATHENA_SESSIONS = [
  { title: 'Abos & Fixkosten', when: 'Heute', active: true },
  { title: 'Steuerschätzung 2026', when: 'Gestern', active: false },
  { title: 'Depot-Rebalancing', when: 'Mo', active: false },
  { title: 'Budget September', when: '2. Sep', active: false },
] as const

/** Die vorgeschlagene Schreibaktion — Aufbau wie PendingActionCard:
    Klartext-Satz plus die Aufschlüsselung, auf der die Entscheidung beruht.
    „Vertrag kündigen" allein ist keine Grundlage für ein Ja. */
const ATHENA_ACTION = {
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
const CURRENT_ALLOCATION = [
  { label: 'PAXG', pct: 70, color: APP.gold },
  { label: 'SOLANA', pct: 30, color: APP.cat6 },
]
/** color/pct hier dieselben Werte wie CURRENT_ALLOCATION (siehe oben) —
    Farbpunkt und Anteils-Balken je Zeile in AssetsList sollen sich sichtbar
    auf den „Aktuelle Verteilung"-Ring daneben beziehen, nicht zufällig
    andersfarbig sein. */
const CRYPTO_ASSETS = [
  { label: 'PAXG', sub: '1.035 · 69,6 %', amount: '1.035 €', pct: 70, color: APP.gold },
  { label: 'SOLANA', sub: '3,42 · 30,4 %', amount: '459 €', pct: 30, color: APP.cat6 },
] as const

/** CURRENT_ALLOCATION_ENTRIES/TARGET_ALLOCATION_ENTRIES für die echte
    DonutCard-Komponente — dieselben Prozente wie CURRENT_ALLOCATION oben,
    jetzt mit Euro-Beträgen (deckungsgleich mit CRYPTO_ASSETS) und echten
    coingecko-Ids für die COIN_COLORS-Palette in portfolio-donut-card.tsx.
    'hyperliquid' ist dort nicht gemappt und fällt auf FALLBACK_COLORS
    zurück — kein eigener Farbwert nötig. */
const CURRENT_ALLOCATION_ENTRIES: DonutEntry[] = [
  { label: 'PAXG', coingecko_id: 'pax-gold', value: 1035, pct: 69.6 },
  { label: 'SOLANA', coingecko_id: 'solana', value: 459, pct: 30.4 },
]
const TARGET_ALLOCATION_ENTRIES: DonutEntry[] = [
  { label: 'ETH', coingecko_id: 'ethereum', value: 1018.64, pct: 68 },
  { label: 'HYPE', coingecko_id: 'hyperliquid', value: 209.72, pct: 14 },
  { label: 'PAXG', coingecko_id: 'pax-gold', value: 89.88, pct: 6 },
  { label: 'CVX', coingecko_id: 'convex-finance', value: 179.76, pct: 12 },
]
const currentAllocationTotal = CURRENT_ALLOCATION_ENTRIES.reduce((s, e) => s + e.value, 0)
const targetAllocationTotal = TARGET_ALLOCATION_ENTRIES.reduce((s, e) => s + e.value, 0)

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
function buildMockHeatmapData(): HeatmapDay[] {
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
const SANKEY_DATA: SankeyData = {
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
function buildMockCashflowEvents(): CashflowEvent[] {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const mk = (day: number, type: 'income' | 'expense', label: string, amount: number): CashflowEvent => ({
    date: `${y}-${m}-${String(day).padStart(2, '0')}`, type, label, amount,
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
const MONTHLY_COMPARISON: MonthlyComparison[] = MONTHS.map((m) => ({
  month: m.m,
  einnahmen: m.ein,
  ausgaben: m.aus,
  sparquote: Math.round(((m.ein - m.aus) / m.ein) * 100),
}))
const CATEGORY_DATA: CategoryDatum[] = [
  { name: 'Gehalt', value: 3800 },
  { name: 'Freelance', value: 950 },
  { name: 'Wohnen', value: -1200 },
  { name: 'Lebensmittel', value: -480 },
  { name: 'Transport', value: -310 },
  { name: 'Abos', value: -95 },
  { name: 'Sonstiges', value: -200 },
]

/** Basiswerte für die „24/7 Echtzeitdaten"-Szene — Live-Jitter siehe useLiveTicker. */
const TICKER_BASE = [
  { sym: 'BTC', price: 61480, deltaPct: 2.4 },
  { sym: 'ETH', price: 2914, deltaPct: 1.8 },
  { sym: 'MSCI World', price: 112.4, deltaPct: -0.3 },
  { sym: 'Allianz', price: 289.6, deltaPct: 0.9 },
]

const euro = (n: number) =>
  `${n > 0 ? '+' : '−'}${Math.abs(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

/** Wie `euro`, aber ohne erzwungenes Vorzeichen — für Stat-Kacheln, die
    selbst schon ein „+" davorsetzen (siehe StatTile), oder gar keins
    brauchen (Portfoliowert, Investiert). */
const fmtEurPlain = (n: number) =>
  `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

const fmtPrice = (n: number) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: n >= 1000 ? 0 : 2, maximumFractionDigits: n >= 1000 ? 0 : 2 })

/**
 * Zählt eine Zahl hoch, sobald `run` true wird.
 *
 * `useRef` für den Startzeitpunkt statt State: sonst würde jeder Frame ein
 * Re-Render des Eltern-Hooks auslösen und die Animation gegen sich selbst
 * laufen.
 */
function useCountUp(target: number, run: boolean, decimals = 0) {
  const [value, setValue] = useState(0)
  const startedAt = useRef<number | null>(null)

  useEffect(() => {
    if (!run) return
    let frame = 0
    const DURATION = 1400

    const tick = (now: number) => {
      if (startedAt.current === null) startedAt.current = now
      const t = Math.min((now - startedAt.current) / DURATION, 1)
      // easeOutExpo — schnell anlaufen, weich einrasten
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
      setValue(target * eased)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [run, target])

  const fmt = (n: number) =>
    n.toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return run ? fmt(value) : fmt(0)
}

/**
 * Lässt Kurse alle ~2,2s minimal driften — NUR, während `active` (siehe
 * Aufrufstelle in CryptoView). War früher ungated in der Annahme, das
 * Intervall stürbe implizit mit der Karte, sobald die Crypto-Szene beim
 * Szenenwechsel ab-/wieder angemontiert wird (`key={view}` in DashboardMock)
 * — stimmt aber nicht: `view` erreicht am Ende der Säulen-Rotation genau den
 * Crypto-Index und bleibt dort für den Rest der Seite stehen (die Rotation
 * läuft nur innerhalb des Pediment-Scroll-Bereichs, danach ändert sich
 * `view` nie wieder). Ohne Gate tickte dieses Intervall dadurch alle 2,2s
 * UNBEGRENZT weiter — auch nachdem die Karte längst aus dem Viewport
 * gescrollt ist —, inklusive vier Re-Renders (PulseValue/DeltaChip) pro
 * Tick. `active` kommt aus einem IntersectionObserver auf die Karte (siehe
 * useVisible), das Intervall pausiert also, sobald sie den Viewport verlässt.
 */
function useLiveTicker(base: typeof TICKER_BASE, active: boolean) {
  const [rows, setRows] = useState(base)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => {
      setRows((prev) =>
        prev.map((r) => {
          const jitter = (Math.random() - 0.5) * 0.006 // ±0,3 %
          return { ...r, price: r.price * (1 + jitter), deltaPct: r.deltaPct + jitter * 100 }
        }),
      )
    }, 2200)
    return () => clearInterval(id)
  }, [active])
  return rows
}

/** Ob `ref` (irgendein Teil davon) aktuell im Viewport sichtbar ist — für
    Hintergrund-Arbeit, die pausieren soll, sobald ihre Karte weggescrollt
    ist (siehe useLiveTicker). Ein schlankes IntersectionObserver statt
    framer-motions `useInView`: DashboardMock hat sonst keine Abhängigkeit
    zu framer-motion, eine für einen einzigen Verbraucher wäre unnötig. */
function useVisible<T extends Element>(ref: React.RefObject<T | null>) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting))
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return visible
}

/** Merkt sich die Richtung der letzten Wertänderung für ~0,5s — Grundlage
    für den grün/rot aufblitzenden „Live-Tick" (siehe PulseValue). */
function usePulseDirection(value: number) {
  const [dir, setDir] = useState<'up' | 'down' | null>(null)
  // Vergleich WÄHREND des Renders statt in einem Effekt, der auf `value`
  // reagiert (React-Pattern „Adjusting state when a prop changes" — siehe
  // https://react.dev/learn/you-might-not-need-an-effect): ein Effekt liefe
  // hier einen Frame zu spät, dieser Zweig löst den Folge-Render sofort aus,
  // noch vor dem Paint. Konvergiert nach genau einem zusätzlichen Render,
  // weil `value === prevValue` danach gilt.
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setDir(value > prevValue ? 'up' : 'down')
    setPrevValue(value)
  }

  useEffect(() => {
    if (!dir) return
    const t = setTimeout(() => setDir(null), 550)
    return () => clearTimeout(t)
  }, [dir])

  return dir
}

/**
 * Glanzlicht für Karten: ein Glanzpunkt folgt der Maus über CSS-Variablen
 * (siehe .mock-tilt-card in landing.css). Kein 3D-Tilt (Rotation) mehr — der
 * kippte die Karten beim Hovern zu stark. Direkte DOM-Mutation statt
 * React-State — bei Mausbewegung hochfrequent genug, dass ein Re-Render pro
 * Event spürbar wäre; dieselbe Begründung wie bei den GSAP-Scroll-Updates in
 * LandingClient.
 */
/** Kein Zutun mehr nötig, seit der 3D-Tilt raus ist (siehe useTilt) — als
    einzelne Modul-Konstante statt einer Closure pro TiltCard-Instanz: keine
    lokale Bindung erfasst, jedes `useTilt()` legte sonst pro Render eine
    eigene, aber identische No-op-Funktion neu an. */
const noopMouseLeave = () => {}

function useTilt() {
  const ref = useRef<HTMLDivElement>(null)
  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height
    el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`)
    el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`)
  }
  return { ref, onMouseMove, onMouseLeave: noopMouseLeave }
}

const cardStyle: React.CSSProperties = {
  backgroundColor: APP.card,
  border: `1px solid ${APP.border}`,
  borderRadius: '10px',
  padding: 'clamp(14px, 1.6vw, 22px)',
}

/** Gemeinsame Karten-Hülle: Theme-Kartenfläche plus Cursor-Tilt/Glanzlicht (siehe
    useTilt). Ersetzt die früher pro Karte einzeln notierte cardStyle-Hülle. */
function TiltCard({
  children,
  style,
  className,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
  className?: string
}) {
  const { ref, onMouseMove, onMouseLeave } = useTilt()
  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className={`mock-tilt-card${className ? ` ${className}` : ''}`}
      style={{ ...cardStyle, ...style }}
    >
      {children}
    </div>
  )
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="mock-label"
      style={{ ...kicker, fontSize: 'clamp(9px, .75vw, 11px)', color: APP.mutedFg, position: 'relative' }}
    >
      {children}
    </span>
  )
}

function DeltaChip({ up, delta, big = false }: { up: boolean; delta: string; big?: boolean }) {
  const Arrow = up ? ArrowUpRight : ArrowDownRight
  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontFamily: F.mono,
        fontSize: big ? 'clamp(12px, 1vw, 14px)' : 'clamp(10px, .8vw, 12px)',
        color: up ? APP.positive : APP.destructive,
      }}
    >
      <Arrow size={big ? 14 : 12} strokeWidth={2} />
      {delta}
    </span>
  )
}

/** Kleine Kennzahlen-Kachel — Depot- und Crypto-Szene, wie die Stat-Karten
    im Figma-Mockup (Portfoliowert/Investiert/Gewinn-Verlust/Anteile bzw.
    Portfolio-Wert/24h-Änderung/…). `value` bewusst ein fertiger String statt
    Zahl+Formatter-Prop: die aufrufenden Szenen brauchen mal Euro, mal
    Prozent, mal einen Label+Prozent-Mix ("PAXG · 69 %"). */
function StatTile({ label, value, sub, valueColor }: { label: string; value: React.ReactNode; sub?: React.ReactNode; valueColor?: string }) {
  return (
    <TiltCard style={{ display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center' }}>
      <CardLabel>{label}</CardLabel>
      <span style={{ fontFamily: F.mono, fontSize: 'clamp(15px, 1.5vw, 19px)', color: valueColor ?? APP.cardFg, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: 'clamp(9px, .75vw, 11px)', color: APP.mutedFg }}>{sub}</span>}
    </TiltCard>
  )
}

function StatTilesRow({
  tiles,
  style,
  className,
}: {
  tiles: Array<{ label: string; value: React.ReactNode; sub?: React.ReactNode; valueColor?: string }>
  style?: React.CSSProperties
  /** Für szenenspezifische Überschreibungen der Spaltenzahl auf schmalen
      Displays (siehe .mock-row-* in landing.css). */
  className?: string
}) {
  return (
    <div
      className={`mock-charts${className ? ` ${className}` : ''}`}
      style={{ display: 'grid', gridTemplateColumns: `repeat(${tiles.length}, minmax(0,1fr))`, gap: 'clamp(10px, 1.2vw, 16px)', flexShrink: 0, ...style }}
    >
      {tiles.map((t) => <StatTile key={t.label} {...t} />)}
    </div>
  )
}

/** Blitzt bei jeder Wertänderung kurz grün/rot auf und poppt minimal —
    „Live-Tick"-Effekt für Kurse (siehe usePulseDirection). */
function PulseValue({
  value,
  baseColor,
  children,
}: {
  value: number
  baseColor: string
  children: React.ReactNode
}) {
  const dir = usePulseDirection(value)
  return (
    <span
      className={dir ? 'mock-pulse' : undefined}
      style={{
        display: 'inline-block',
        color: dir === 'up' ? APP.positive : dir === 'down' ? APP.destructive : baseColor,
        transition: 'color .5s ease',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {children}
    </span>
  )
}

/** Kompakte Positionsliste neben den beiden Verteilungs-Ringen — Crypto-
    Szene, drittes Drittel derselben Reihe (siehe Figma: "Assets · Kraken ·
    2 Positionen"). */
/** Positionsliste neben den beiden Verteilungs-Ringen — Crypto-Szene,
    drittes Drittel derselben Reihe (siehe Figma: „Assets · Kraken ·
    2 Positionen"). Zeilen jetzt mit Farbpunkt + Anteils-Balken statt reinem
    Text, plus Gesamtsumme als Fußzeile (`marginTop: 'auto'`, an den unteren
    Kartenrand gepinnt): bei nur zwei Positionen hing die Liste zuvor mit
    `justifyContent: 'center'` in der von den Donut-Karten daneben
    vorgegebenen Kartenhöhe fest und wirkte wie ein fast leeres Feld mit zwei
    beliebig in der Mitte schwebenden Zeilen (siehe Screenshot im Chat) —
    jetzt oben ausgerichtet, farblich an die Ringe angebunden und mit
    sinnvollem Inhalt bis zum unteren Rand statt Leerraum. */
function AssetsList({
  title,
  sub,
  rows,
  total,
}: {
  title: string
  sub: string
  rows: readonly { label: string; sub: string; amount: string; pct: number; color: string }[]
  total: string
}) {
  return (
    <TiltCard style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(14px, 1.6vw, 20px)', minHeight: 0 }}>
      <div>
        <CardLabel>{title}</CardLabel>
        <p style={{ margin: '3px 0 0', fontSize: 'clamp(9px, .75vw, 11px)', color: APP.mutedFg }}>{sub}</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(14px, 1.6vw, 18px)' }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: r.color, flexShrink: 0 }} />
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: 'clamp(11px, .9vw, 13px)', color: APP.cardFg }}>{r.label}</span>
                  <span style={{ fontFamily: F.mono, fontSize: 'clamp(9px, .7vw, 10px)', color: APP.mutedFg }}>{r.sub}</span>
                </span>
              </span>
              <span style={{ fontFamily: F.mono, fontSize: 'clamp(11px, .9vw, 13px)', color: APP.cardFg, whiteSpace: 'nowrap' }}>
                {r.amount}
              </span>
            </div>
            <div style={{ height: '3px', borderRadius: '2px', backgroundColor: APP.secondary, overflow: 'hidden' }}>
              <div style={{ width: `${r.pct}%`, height: '100%', borderRadius: '2px', backgroundColor: r.color }} />
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 'auto',
          paddingTop: 'clamp(10px, 1.2vw, 14px)',
          borderTop: `1px solid ${APP.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <span style={{ ...kicker, fontSize: 'clamp(9px, .75vw, 11px)', color: APP.mutedFg }}>Gesamt</span>
        <span style={{ fontFamily: F.mono, fontSize: 'clamp(12px, 1vw, 14px)', color: APP.cardFg }}>{total}</span>
      </div>
    </TiltCard>
  )
}

function BookingsList({ title, bookings }: { title: string; bookings: typeof BOOKINGS }) {
  const [hover, setHover] = useState<number | null>(null)
  return (
    <>
      <CardLabel>{title}</CardLabel>
      <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {bookings.map((b, i) => (
          <div
            key={b.label}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto minmax(0, 1fr) auto auto',
              alignItems: 'center',
              gap: 'clamp(10px, 1.6vw, 26px)',
              padding: 'clamp(7px, .9vw, 12px) 8px',
              margin: '0 -8px',
              borderRadius: '6px',
              borderBottom: `1px solid ${APP.border}`,
              backgroundColor: hover === i ? APP.secondary : 'transparent',
              transition: 'background-color .18s ease',
            }}
          >
            <span style={{ fontFamily: F.mono, fontSize: 'clamp(10px, .8vw, 12px)', color: APP.mutedFg }}>{b.day}</span>
            <span style={{ fontSize: 'clamp(12px, 1vw, 14px)', color: APP.cardFg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {b.label}
            </span>
            <span className="booking-cat" style={{ ...kicker, fontSize: 'clamp(8px, .7vw, 10px)', color: APP.mutedFg }}>
              {b.cat}
            </span>
            <span
              style={{
                fontFamily: F.mono,
                fontSize: 'clamp(11px, .95vw, 14px)',
                color: b.amount > 0 ? APP.positive : APP.destructive,
                fontVariantNumeric: 'tabular-nums',
                textAlign: 'right',
                minWidth: 'clamp(80px, 7vw, 110px)',
              }}
            >
              {euro(b.amount)}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

/** Reiter-Leiste für den Zeitraum-Filter der Analyse-Szene (siehe
    PeriodTabs): aktiv = gefüllte Pille mit leichtem Scale, inaktiv =
    Ghost-Text mit Hover. Echt umschaltbar (eigener State je Instanz), aber
    ohne Wirkung auf die Charts darunter — reine Chrome.

    In der Dashboard-Szene gab es dieselbe Leiste zweimal als Attrappe über
    dem Vermögens-Chart; die ist weg, seit dort der echte NetWorthChart steht,
    der seine Zeitraum- und Ansicht-Tabs selbst mitbringt und sie tatsächlich
    auswertet. */
function TabPills({ options, active, onChange }: { options: string[]; active: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: '2px' }}>
      {options.map((p) => {
        const isActive = p === active
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={`mock-pill${isActive ? ' active' : ''}`}
            style={{
              fontFamily: F.mono,
              fontSize: '11px',
              fontWeight: 500,
              padding: '5px 11px',
              borderRadius: '6px',
              border: 'none',
              whiteSpace: 'nowrap',
              backgroundColor: isActive ? APP.cardFg : 'transparent',
              color: isActive ? APP.bg : APP.mutedFg,
              transform: isActive ? 'scale(1.05)' : 'none',
            }}
          >
            {p}
          </button>
        )
      })}
    </div>
  )
}

function PeriodTabs() {
  const [active, setActive] = useState('1J')
  return <TabPills options={['3M', '6M', '1J', 'Alle']} active={active} onChange={setActive} />
}

// ── Die vier Szenen — jede mit eigenem Layout statt getauschter Karten im
//    selben Raster ───────────────────────────────────────────────────────────

/**
 * Athenas Hinweise. Nachbau von athena-insights.tsx statt Import: die echte
 * Komponente ist ein Client-Formular mit Server-Action zum Wegklicken
 * (dismissInsight) — im Mockup wäre das eine Schaltfläche, die nichts tut,
 * und der Import zöge die Server-Action mitsamt Supabase-Client in das
 * Landing-Bundle, das sonst keinen davon braucht.
 */
function AthenaInsightsCard() {
  return (
    <div
      style={{
        border: `1px solid ${APP.border}`,
        borderRadius: '10px',
        padding: 'clamp(10px, 1.1vw, 15px)',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '9px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 'clamp(11px, .95vw, 13px)', fontWeight: 600, color: APP.cardFg }}>
          <Sparkles size={13} strokeWidth={1.8} style={{ color: APP.positive, flexShrink: 0 }} />
          Athena
          <span style={{ fontWeight: 400, color: APP.mutedFg }}>{ATHENA_INSIGHTS.length}</span>
        </span>
        <span style={{ fontSize: 'clamp(10px, .8vw, 12px)', color: APP.mutedFg, whiteSpace: 'nowrap' }}>Chat →</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {ATHENA_INSIGHTS.map((it) => {
          const Icon = it.severity === 'warning' ? AlertTriangle : Info
          return (
            <div key={it.title} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <Icon
                size={13}
                strokeWidth={1.7}
                style={{ flexShrink: 0, marginTop: '2px', color: it.severity === 'warning' ? APP.warning : APP.mutedFg }}
              />
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 'clamp(11px, .9vw, 12.5px)', lineHeight: 1.35, color: APP.cardFg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {it.title}
                </p>
                <p style={{ margin: '1px 0 0', fontSize: 'clamp(10px, .78vw, 11.5px)', lineHeight: 1.35, color: APP.mutedFg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {it.body}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Kleine Beschriftung + Wert, wie sie in der Net-Worth-Karte viermal und in
    der Monatsbilanz zweimal vorkommt. */
function MiniStat({ label, value, color, icon }: { label: string; value: string; color?: string; icon?: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: 'clamp(9px, .72vw, 10.5px)', color: APP.mutedFg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </p>
      <p style={{ margin: '1px 0 0', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: F.mono, fontSize: 'clamp(10px, .84vw, 12px)', color: color ?? APP.cardFg, fontVariantNumeric: 'tabular-nums' }}>
        {icon}
        {value}
      </p>
    </div>
  )
}

/**
 * Die erste Kartenreihe der Dashboard-Szene.
 *
 * Bewusst drei ungleiche Karten statt einer Reihe gleichförmiger
 * Kennzahlen-Kacheln (so sah das Mockup vorher aus): Net Worth trägt seine
 * Aufschlüsselung, die Monatsbilanz einen Budget-Balken, Krypto seine
 * größten Positionen. Genau diese Ungleichheit unterscheidet die echte Seite
 * von einer Statistik-Leiste — eine Reihe aus vier identischen Kacheln sähe
 * zwar aufgeräumter aus, wäre aber nicht die App.
 *
 * Feste Höhe statt Inhaltshöhe: die Szene läuft in einem Ausschnitt mit
 * fester Viewport-Höhe (siehe .mock-root), die Reihen darunter holen sich
 * den Rest per flex. Ohne feste Höhe hier verschöbe jede Textänderung in
 * einer der Karten stillschweigend die Größe von Chart und Buchungsliste.
 */
function DashboardTopRow({ run }: { run: boolean }) {
  const netWorth = useCountUp(NET_WORTH_STAT.value, run, 0)
  return (
    <div
      className="mock-charts mock-row-top"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
        gap: 'clamp(10px, 1.2vw, 16px)',
        flexShrink: 0,
        height: 'clamp(148px, 19vh, 186px)',
      }}
    >
      <TiltCard style={{ display: 'flex', flexDirection: 'column', gap: '5px', overflow: 'hidden' }}>
        <CardLabel>Net Worth</CardLabel>
        <span style={{ fontFamily: F.display, fontSize: 'clamp(21px, 2.2vw, 30px)', lineHeight: 1.05, color: APP.cardFg }}>
          {netWorth}{NET_WORTH_STAT.suffix}
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', columnGap: '12px', rowGap: '4px', marginTop: '3px' }}>
          {NET_WORTH_PARTS.map((p) => <MiniStat key={p.label} label={p.label} value={p.value} />)}
        </div>
      </TiltCard>

      <TiltCard className="mock-sm-hide" style={{ display: 'flex', flexDirection: 'column', gap: '5px', overflow: 'hidden' }}>
        <CardLabel>{MONTH_CARD.label}</CardLabel>
        <span style={{ fontFamily: F.display, fontSize: 'clamp(21px, 2.2vw, 30px)', lineHeight: 1.05, color: APP.positive }}>
          {MONTH_CARD.net}
        </span>
        <div style={{ display: 'flex', gap: '18px', marginTop: '3px' }}>
          <MiniStat
            label="Einnahmen"
            value={MONTH_CARD.income}
            color={APP.positive}
            icon={<ArrowUpRight size={11} strokeWidth={2} />}
          />
          <MiniStat
            label="Ausgaben"
            value={MONTH_CARD.expense}
            color={APP.destructive}
            icon={<ArrowDownRight size={11} strokeWidth={2} />}
          />
        </div>
        {/* Budget-Balken — in der echten Karte grün bis 80 %, dann warning,
            über 100 % destructive. Der Mock-Wert liegt knapp unter der
            ersten Schwelle, zeigt also den Normalfall. */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'clamp(9px, .72vw, 10.5px)', color: APP.mutedFg }}>
            <span>Budget</span>
            <span style={{ fontFamily: F.mono, fontVariantNumeric: 'tabular-nums' }}>{MONTH_CARD.budgetLabel}</span>
          </div>
          <div style={{ height: '5px', borderRadius: '999px', backgroundColor: APP.secondary, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                borderRadius: '999px',
                width: run ? `${MONTH_CARD.budgetPct}%` : '0%',
                backgroundColor: MONTH_CARD.budgetPct > 80 ? APP.warning : APP.positive,
                transition: 'width 1.4s cubic-bezier(.22,1,.36,1) .3s',
              }}
            />
          </div>
        </div>
      </TiltCard>

      <TiltCard className="mock-sm-hide" style={{ display: 'flex', flexDirection: 'column', gap: '5px', overflow: 'hidden' }}>
        <CardLabel>Krypto</CardLabel>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: F.display, fontSize: 'clamp(21px, 2.2vw, 30px)', lineHeight: 1.05, color: APP.cardFg }}>
            {CRYPTO_CARD.value}
          </span>
          <DeltaChip up delta={CRYPTO_CARD.delta} />
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {CRYPTO_CARD.top.map((t, i) => (
            <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: 'clamp(10px, .8vw, 11.5px)' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0, backgroundColor: i === 0 ? APP.gold : APP.cat6 }} />
              <span style={{ color: APP.secondaryFg, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
              <span style={{ fontFamily: F.mono, color: APP.mutedFg, fontVariantNumeric: 'tabular-nums' }}>{t.pct}</span>
            </div>
          ))}
        </div>
      </TiltCard>
    </div>
  )
}

function DashboardView({ run }: { run: boolean }) {
  // Die Stichtage hängen am heutigen Datum (siehe buildMockSnapshots) —
  // einmal pro Mount berechnet, nicht bei jedem Scroll-Frame neu.
  const snapshots = useMemo(() => buildMockSnapshots(), [])
  return (
    <>
      {/* Reihenfolge wie auf der echten Seite: Athenas Hinweise stehen ganz
          oben, noch vor den Zahlen — sie sind der Grund, warum man morgens
          überhaupt hinschaut. */}
      <AthenaInsightsCard />
      <DashboardTopRow run={run} />
      {/*
        Verlauf und Aufteilung — beide direkt aus der App (siehe Imports
        oben), im selben 2:1-Verhältnis wie dort. Sie bringen ihre Karten-
        Chrome (Rahmen, Titel, Tabs) selbst mit, deshalb bewusst KEIN
        TiltCard darum — sonst stünde eine Karte in einer Karte.

        `gridAutoRows: '1fr'` ist hier Pflicht, kein Kosmetik-Detail: anders
        als ein Flex-Container sizt CSS Grid eine implizite Zeile per Default
        auf `auto` (= Inhaltshöhe) statt sie auf die verfügbare Höhe zu
        strecken. Die Zeile kollabierte dadurch auf die Minimalhöhe des SVGs.
        `1fr` zwingt sie stattdessen auf die volle Höhe des Grid-Containers,
        der seinerseits per `flex: 2 1 0%` seine Höhe vom Eltern-Flex bekommt.

        `minHeight: 336px` ist der Kern der Sache, nicht Feinschliff: beide
        Charts haben eine feste Innenhöhe (NetWorthChart 220px Container plus
        Tabs und Innenabstand, der Donut 144px Ring plus vierzeilige Legende
        — rund 300 bzw. 330px). Als reines `flex: 2` teilte sich diese Zeile
        nur den Rest der Szenenhöhe und blieb auf einem 900px-Fenster rund
        60px darunter: Achsenbeschriftung und die unteren Legendenzeilen
        wurden abgeschnitten, und der Chart selbst stand gestaucht da. Mit
        einer Untergrenze wird stattdessen die Buchungsliste darunter kürzer
        — die darf angeschnitten sein, sie ist ohnehin der Hinweis darauf,
        dass die Seite weitergeht.

        minHeight/overflow an den Zellen selbst bleibt trotzdem: auf sehr
        niedrigen Fenstern soll die Zeile beschnitten werden, nicht die ganze
        Szene aufschieben.
      */}
      <div
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gridAutoRows: '1fr', gap: 'clamp(10px, 1.2vw, 16px)', flex: '1 1 auto', minHeight: '336px' }}
        className="mock-charts mock-row-charts"
      >
        <div style={{ minHeight: 0, overflow: 'hidden' }}>
          <NetWorthChart snapshots={snapshots} />
        </div>
        <div className="mock-sm-hide" style={{ minHeight: 0, overflow: 'hidden' }}>
          <PortfolioDonut
            kontenTotal={NET_WORTH_BUCKETS.konten}
            investmentTotal={NET_WORTH_BUCKETS.investment}
            depotTotal={NET_WORTH_BUCKETS.depot}
            cryptoTotal={NET_WORTH_BUCKETS.crypto}
            locale="de-DE"
          />
        </div>
      </div>
      {/* Echte recharts-Komponente aus dem eingeloggten Dashboard (siehe
          Import oben) statt der handgebauten BarsChart-SVG — bringt ihre
          eigene <Card>-Chrome (Titel „Einnahmen vs. Ausgaben" + Rahmen)
          gleich mit, deshalb hier bewusst KEIN umschließender TiltCard
          (sonst doppelte Karten-Chrome — dasselbe gilt für NetWorthChart und
          PortfolioDonut in der Reihe darüber). */}
      <div className="mock-sm-hide" style={{ flexShrink: 0 }}>
        <IncomeExpenseChart summaries={FINANCE_SUMMARIES} locale="de-DE" height={140} />
      </div>
      <TiltCard className="mock-bookings" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <BookingsList title="Letzte Buchungen" bookings={BOOKINGS.slice(0, 4)} />
      </TiltCard>
    </>
  )
}

/**
 * Analyse-Szene — echte Analyse-Bausteine aus der eingeloggten App (siehe
 * Imports oben) statt dreier erfundener Mini-Karten (Sparziele/Top-
 * Kategorien/Ø Ausgabe, die es auf der echten Analyse-Seite so nie gab).
 * Titel jetzt „Analyse" statt „Ausgaben-Analyse": die Szene deckt nicht mehr
 * nur Ausgaben ab, sondern — wie die echte Seite — Heatmap, Geldfluss UND
 * Cashflow-Kalender. AusgabenHeatmap bringt eigene Card-Chrome mit (wie
 * IncomeExpenseChart/NetWorthChart/DonutCard), deshalb kein TiltCard-Wrapper.
 * Heatmap-Zellen sind hier 11px (Original-Komponente) statt der vorher
 * frei erfundenen ~50px-Kacheln — dadurch von selbst kompakt statt riesig.
 */
function AnalyseView() {
  const heatmapData = useMemo(() => buildMockHeatmapData(), [])
  const cashflowEvents = useMemo(() => buildMockCashflowEvents(), [])
  // Gemeinsame feste Höhe für Geldfluss + Kalender statt je nach Eigenhöhe
  // zu stretchen (siehe Chat: "sollten gleich groß sein") — GeldflussChart
  // hat ein festes 380px-ResponsiveContainer, der Kalender variiert mit der
  // Anzahl Wochenreihen im Monat (4-6). overflow:hidden statt auto: ein
  // Scrollbalken wäre auf einer reinen Vorschaukachel fehl am Platz.
  const cardHeight = 'clamp(360px, 46vh, 460px)'
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <span style={{ fontFamily: F.display, fontSize: 'clamp(18px, 1.8vw, 24px)', color: APP.cardFg }}>Analyse</span>
        <PeriodTabs />
      </div>
      <div style={{ flexShrink: 0 }}>
        <AusgabenHeatmap data={heatmapData} />
      </div>
      <div
        className="mock-charts mock-row-analyse"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 'clamp(10px, 1.2vw, 16px)', flexShrink: 0 }}
      >
        <div style={{ height: cardHeight, overflow: 'hidden' }}>
          <GeldflussChart data={SANKEY_DATA} />
        </div>
        {/* pointerEvents:'none' statt den echten Kalender anzufassen: er ist
            im echten Dashboard bewusst interaktiv (Klick zeigt Tages-Details,
            siehe CashflowKalender.tsx) — hier in der Vorschau soll man aber
            nichts anklicken können (siehe Chat: "Reaktivität rausnehmen").
            Die Tageszahlen selbst bleiben sichtbar, nur Hover/Klick greifen
            nicht mehr. */}
        <div className="mock-sm-hide" style={{ height: cardHeight, overflow: 'hidden', pointerEvents: 'none' }}>
          <CashflowKalender events={cashflowEvents} />
        </div>
      </div>
      {/* Bewusst OHNE eigene Höhenbegrenzung und ohne weitere Elemente danach:
          die Szene selbst hat eine feste Viewport-Höhe (siehe mock-root,
          overflow:hidden) — diese Reihe wird dadurch am unteren Rand
          angeschnitten statt zu scrollen. Genau das ist der Effekt (siehe
          Chat: "darunter kann es gerne noch weiter gehen, dass man sieht,
          dass da theoretisch noch was kommt") — ein Blick auf den Anfang von
          Monatsvergleich/Kategorien, wie auf der echten Analyse-Seite. */}
      <div
        className="mock-charts mock-sm-hide"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 'clamp(10px, 1.2vw, 16px)', flexShrink: 0 }}
      >
        <MonatsVergleich data={MONTHLY_COMPARISON} />
        <KategorienChart data={CATEGORY_DATA} />
      </div>
    </>
  )
}

/**
 * Athena-Szene — der Chat-Tab, aufgebaut wie die echte Seite
 * (app/(dashboard)/assistant/page.tsx): links die Session-Liste, rechts das
 * Gespräch mit Eingabezeile darunter.
 *
 * Klassen und Markup sind aus AthenaChat, SessionList und PendingActionCard
 * übernommen, nicht nachempfunden — möglich, seit das Mockup auf
 * data-theme="athena-dark" läuft: bg-muted, bg-primary, text-muted-foreground
 * und border-border treffen hier dieselben Farben wie in der App.
 *
 * Nachgebaut statt importiert: AthenaChat ist ein 30-KB-Client mit
 * Streaming-Anbindung an /api/assistant, SessionList und PendingActionCard
 * hängen an Server-Actions. Auf der Landing Page wären das Bedienelemente,
 * die entweder nichts tun oder echte Anfragen auslösen — und sie zögen den
 * halben Assistenten in ein Bundle, das ihn sonst nicht braucht.
 * AthenaAvatar ist die Ausnahme und wird direkt verwendet: reine Darstellung,
 * keine Logik.
 *
 * Der Verlauf endet bewusst auf einem VORSCHLAG statt auf einer erledigten
 * Änderung: dass Athena Schreibaktionen nur vorschlägt und erst ein Klick sie
 * ausführt, ist das Prinzip des Assistenten — in einem Standbild lässt es
 * sich nur so zeigen.
 */
function AthenaView() {
  return (
    <div className="mock-athena">
      <aside className="mock-athena-sessions flex min-h-0 flex-col overflow-hidden rounded-lg border border-border">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sessions</span>
          <Plus className="size-3.5 text-muted-foreground" aria-hidden />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden p-1.5">
          {ATHENA_SESSIONS.map((sess) => (
            <div
              key={sess.title}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
                sess.active ? 'bg-accent text-foreground' : 'text-muted-foreground'
              }`}
            >
              <MessageSquare className="size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{sess.title}</span>
              <span className="shrink-0 text-[10px] opacity-70">{sess.when}</span>
            </div>
          ))}
        </div>
      </aside>

      <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border">
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
          <div className="max-w-[85%] self-end rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
            Wie viel zahle ich diesen Monat für Abos?
          </div>

          <div className="flex gap-2.5">
            <AthenaAvatar size={28} className="mt-0.5" />
            <div className="min-w-0 flex-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
              87,94 € auf sechs Verträge. Zwei davon hast du seit Juni nicht mehr
              benutzt: <span className="font-medium">Cloud Pro</span> (14,99 €) und
              Design Suite (24,00 €).
            </div>
          </div>

          <div className="max-w-[85%] self-end rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
            Kündige Cloud Pro zum nächstmöglichen Termin.
          </div>

          {/* Bestätigungskarte — Aufbau 1:1 wie PendingActionCard: Icon,
              Klartext-Satz, darunter die Aufschlüsselung, auf der die
              Entscheidung beruht, und erst dann die beiden Knöpfe. */}
          <div className="flex gap-2.5">
            <AthenaAvatar size={28} className="mt-0.5" />
            <div className="min-w-0 flex-1 rounded-lg border border-border bg-card p-3 text-sm">
              <div className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="m-0 font-medium text-foreground">{ATHENA_ACTION.summary}</p>
                  <ul className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
                    {ATHENA_ACTION.details.map((d) => (
                      <li key={d.label} className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="min-w-0 flex-1 text-muted-foreground">{d.label}</span>
                        <span className="shrink-0 text-right font-medium tabular-nums text-foreground">{d.value}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Athena schlägt das vor — noch wurde nichts geändert.
                    <span className="ml-1.5 opacity-60">{ATHENA_ACTION.label}</span>
                  </p>
                </div>
              </div>
              <div className="mt-2 flex gap-2 pl-6">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">
                  <Check className="size-3.5" aria-hidden />
                  Bestätigen
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  <X className="size-3.5" aria-hidden />
                  Verwerfen
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-border p-3">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-2 rounded-xl border border-input bg-card px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">Frag Athena…</span>
            <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ArrowUp className="size-3.5" aria-hidden />
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Crypto-Szene — an das Figma-Mockup „Crypto — Portfolio" angeglichen: vier
    Stat-Kacheln, der Portfolio-Wert-Verlauf, darunter „Aktuelle Verteilung"
    und „Ziel-Verteilung" als Ringe plus eine Assets-Liste — genau die drei
    Karten aus dem Mockup, statt der früheren Kurszeilen-Reihe (TickerBanner/
    MiniTicker sind raus, der Rebalancing-Gedanke passt besser zur „24/7
    Echtzeitdaten"-Kennzahl, mit der diese Szene ohnehin schon verknüpft ist,
    siehe STATS in LandingClient). PulseValue bleibt für die Portfolio-Wert-
    Kachel — der „Live-Tick"-Blitzeffekt ist die einzige Stelle, an der diese
    Szene noch sichtbar in Echtzeit lebt. */
function CryptoView({ visible }: { visible: boolean }) {
  const [btc] = useLiveTicker(TICKER_BASE, visible)
  const up = btc.deltaPct >= 0
  const lastPortfolioValue = PORTFOLIO_HISTORY[PORTFOLIO_HISTORY.length - 1].value

  return (
    <>
      <StatTilesRow
        className="mock-row-tiles"
        tiles={[
          {
            label: 'Portfolio-Wert',
            value: (
              <PulseValue value={lastPortfolioValue} baseColor={APP.cardFg}>
                {fmtEurPlain(lastPortfolioValue)}
              </PulseValue>
            ),
          },
          {
            label: '24h Änderung',
            value: (
              <PulseValue value={btc.deltaPct} baseColor={up ? APP.positive : APP.destructive}>
                {`${up ? '+' : '−'}${Math.abs(btc.deltaPct).toFixed(1).replace('.', ',')} %`}
              </PulseValue>
            ),
            valueColor: up ? APP.positive : APP.destructive,
          },
          { label: 'Größte Position', value: `${CURRENT_ALLOCATION[0].label} · ${CURRENT_ALLOCATION[0].pct} %` },
          {
            label: 'Live-Kurs',
            value: (
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Dot size={16} strokeWidth={5} color={APP.positive} className="mock-live-dot" />
                {fmtPrice(btc.price)} €
              </span>
            ),
            sub: btc.sym,
          },
        ]}
      />
      {/* Echte recharts-Komponente aus dem eingeloggten Crypto-Portfolio
          (siehe Import oben) — headless (kein eigenes Card-Chrome), deshalb weiterhin in
          TiltCard mit eigenem CardLabel als Titel.
          `color: APP.cardFg` explizit gesetzt: PortfolioAreaChart stylt seine
          Achsen-Ticks über `fill: 'currentColor'` (siehe Komponente) — ohne
          einen ererbten hellen `color`-Wert an dieser Stelle greift stattdessen
          die Fließtextfarbe der (hellen, cremefarbenen) Landingpage außerhalb
          dieses dunklen Mockups, macht die Beschriftung auf dunklem Grund
          quasi unsichtbar (siehe Screenshot im Chat). */}
      <TiltCard style={{ flex: '1 1 0%', minHeight: 0, display: 'flex', flexDirection: 'column', padding: 'clamp(18px, 2vw, 26px)', color: APP.cardFg }}>
        <CardLabel>Portfolio-Wert</CardLabel>
        <div style={{ flex: 1, minHeight: 0, marginTop: '14px' }}>
          <PortfolioAreaChart
            chartData={CRYPTO_CHART_DATA}
            visiblePortfolios={['Portfolio']}
            xFormatter={cryptoXFormatter}
            tickInterval={0}
            height="100%"
          />
        </div>
      </TiltCard>
      {/* DonutCard bringt (wie IncomeExpenseChart) ihre eigene Card-Chrome
          mit — kein TiltCard-Wrapper mehr nötig (ersetzt AllocationDonut).
          height von 100 auf 210 angehoben: DonutCards Pie hat FESTE Pixel-
          Radien (innerRadius 65 / outerRadius 95, siehe Komponente), keine
          prozentualen — bei 100px wurde der Ring oben/unten hart abgeschnitten
          (sah wie zwei Mond-Sicheln statt eines Rings aus, siehe Screenshot im
          Chat). 210px lässt dem Ring (Durchmesser 190) etwas Luft. Die Reihe
          selbst hat reichlich Platz (per Messung ~430px hoch), das war also
          nie eine echte Platznot, nur ein zu niedrig gegriffener Wert. */}
      <div
        className="mock-charts mock-row-crypto"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 'clamp(10px, 1.2vw, 16px)', flex: '1.5 1 0%', minHeight: 0 }}
      >
        <div style={{ minHeight: 0, overflowY: 'auto', color: APP.cardFg }}>
          <DonutCard
            title="Aktuelle Verteilung"
            subtitle={`${currentAllocationTotal.toLocaleString('de-DE')} €`}
            data={CURRENT_ALLOCATION_ENTRIES}
            height={210}
          />
        </div>
        <div className="mock-sm-hide" style={{ minHeight: 0, overflowY: 'auto', color: APP.cardFg }}>
          <DonutCard
            title="Ziel-Verteilung"
            subtitle={`${targetAllocationTotal.toLocaleString('de-DE')} €`}
            data={TARGET_ALLOCATION_ENTRIES}
            height={210}
          />
        </div>
        <AssetsList
          title="Assets"
          sub="Kraken · 2 Positionen"
          rows={CRYPTO_ASSETS}
          total={`${currentAllocationTotal.toLocaleString('de-DE')} €`}
        />
      </div>
    </>
  )
}

export function DashboardMock({
  run,
  view = 0,
  /**
   * Hält rechts Platz für die Kennzahlen-Säule frei. Ohne das lägen Beträge,
   * Prozentwerte und Kurse — also genau die rechtsbündigen Zahlen — unter der
   * Säule und wären angeschnitten.
   */
  reserveRight = false,
}: {
  run: boolean
  view?: number
  reserveRight?: boolean
}) {
  const [hoveredNav, setHoveredNav] = useState<string | null>(null)
  // -1 = Säule noch leer (siehe PedimentReveal, phi startet bei
  // COLUMN_START_DEG) — zeigt trotzdem schon die volle Dashboard-Szene
  // (kein Skeleton-Zwischenschritt mehr), Math.max fängt nur den Index ab.
  const activeView = MOCK_VIEWS[Math.max(view, 0)] ?? MOCK_VIEWS[0]
  const active = activeView.nav
  /*
   * Seit der Umbau der echten Sidebar Depot und Krypto unter „Investing"
   * gruppiert hat (siehe NAV), reicht die Gruppe allein nicht mehr, um die
   * Szene zu benennen: zwei der vier Szenen leuchten auf demselben
   * Hauptpunkt. Der Unterpunkt sagt, welche gemeint ist.
   */
  const activeChild = 'child' in activeView ? activeView.child : undefined
  // Gate für Hintergrund-Arbeit, die pausieren soll, sobald das Mockup aus
  // dem Viewport gescrollt ist (siehe useLiveTicker/CryptoView) — `view`
  // bleibt nach der Säulen-Rotation dauerhaft auf dem letzten Stand stehen
  // (siehe Kommentar an useLiveTicker), ohne dieses Gate liefe die
  // Crypto-Szene sonst für den Rest der Seite im Hintergrund weiter.
  const rootRef = useRef<HTMLDivElement>(null)
  const visible = useVisible(rootRef)

  return (
    <div
      ref={rootRef}
      aria-hidden
      /*
       * data-theme="athena-dark": DashboardMock liegt außerhalb des normalen
       * [data-theme]-Scopes (siehe landing-tokens.ts) — die eigenen
       * APP-Inline-Styles bräuchten das Attribut nicht. Für die echten
       * App-Komponenten, die hier mitgerendert werden (IncomeExpenseChart,
       * PortfolioAreaChart, DonutCard, AusgabenHeatmap, GeldflussChart,
       * CashflowKalender, NetWorthChart, PortfolioDonut), ist es dagegen
       * Pflicht: die arbeiten
       * mit Tailwind-Klassen wie bg-card/border-border/text-muted-foreground
       * und bekämen ohne dieses Attribut die Default-Light-Palette.
       *
       * MUSS deshalb immer dasselbe Preset nennen wie die APP-Tokens in
       * landing-tokens.ts — sonst laufen zwei Paletten nebeneinander im
       * selben Mockup.
       */
      data-theme="athena-dark"
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: APP.bg,
        /* Derselbe Schimmer, den `[data-theme="athena-dark"] body` in
           globals.css auf die echte App legt — ohne ihn wirkt die Fläche
           hier flacher als im eingeloggten Zustand. Prozentwerte statt der
           dortigen px-Radien, weil das Mockup nur einen Ausschnitt der
           Fensterbreite einnimmt. */
        backgroundImage:
          'radial-gradient(ellipse 70% 60% at 12% 100%, rgba(184, 143, 81, 0.08), transparent 60%),'
          + ' radial-gradient(ellipse 90% 70% at 88% -10%, rgba(140, 162, 119, 0.06), transparent 60%)',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 224px) minmax(0, 1fr)',
        overflow: 'hidden',
        /*
         * Die umschließende <section> in PedimentReveal setzt bewusst
         * pointer-events: none (sie ist mehrere Viewport-Höhen groß und läge
         * sonst über echten Inhalten davor/danach, siehe Kommentar dort).
         * Für die Tilt-/Crosshair-/Puls-Effekte hier muss das gezielt wieder
         * aufgehoben werden — erst ab `run`, also erst wenn der Giebel schon
         * sichtbar offen ist, sonst wäre schon der winzige Dreieck-Spalt zu
         * Beginn über dem Hero-Button klickbar.
         */
        pointerEvents: run ? 'auto' : 'none',
      }}
      className="mock-root"
    >
      {/* ── Sidebar ── */}
      <aside
        className="mock-side"
        style={{
          backgroundColor: APP.sidebar,
          borderRight: `1px solid ${APP.sidebarBorder}`,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        {/* Kopf mit Logo — im echten Dashboard durch eine Linie abgesetzt */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '0 16px',
            height: '56px',
            flexShrink: 0,
            borderBottom: `1px solid ${APP.sidebarBorder}`,
          }}
        >
          <Logo variant="transparent" size={22} />
          <span style={{ fontFamily: F.display, fontSize: '15px', color: APP.sidebarAccentFg, whiteSpace: 'nowrap' }}>
            Athena Finance
          </span>
        </div>

        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '2px', minHeight: 0, overflow: 'hidden' }}>
          {NAV.map(({ icon: Icon, label, children }) => {
            const isActive = label === active
            const isHovered = hoveredNav === label
            return (
              <div key={label}>
                <div
                  className="mock-nav-item"
                  onMouseEnter={() => setHoveredNav(label)}
                  onMouseLeave={() => setHoveredNav(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    fontSize: 'clamp(11px, .92vw, 13px)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    color: isActive ? APP.sidebarPrimaryFg : APP.sidebarFg,
                    backgroundColor: isActive ? APP.sidebarPrimary : isHovered ? 'rgba(184,143,81,.08)' : 'transparent',
                    fontWeight: isActive ? 500 : 400,
                    transition: 'background-color .35s ease, color .35s ease',
                  }}
                >
                  <Icon
                    size={15}
                    strokeWidth={1.6}
                    style={{ flexShrink: 0, color: isActive ? APP.sidebarPrimaryFg : 'currentColor', transition: 'color .35s ease' }}
                  />
                  {label}
                </div>

                {/*
                  Anders als in der echten Sidebar stehen hier IMMER alle
                  Untermenüs offen, nicht nur das der aktiven Gruppe. Bewusste
                  Abweichung: in der App kennt man den Umfang längst und ein
                  zugeklapptes Menü hält die Liste kurz — auf der Landing Page
                  ist diese Sidebar das einzige Inhaltsverzeichnis der App, das
                  jemand zu sehen bekommt. Zugeklappt verschwieg sie elf der
                  achtzehn Bereiche.

                  Die Klasse bleibt trotzdem `open` statt fest ins CSS gezogen
                  zu werden: das Auf-/Zuklappen soll dieselbe Regel bleiben wie
                  in der echten Sidebar (.subnav-container in globals.css),
                  falls hier je wieder umgeschaltet wird.
                */}
                {children && (
                  <div className="mock-subnav-container open">
                    <div className="mock-subnav-inner">
                      {children.map((child) => {
                        // Vorher fest der erste Unterpunkt — das stimmte nur
                        // zufällig, solange jede Szene der erste Eintrag ihrer
                        // Gruppe war. Bei „Investing" ist Depot der zweite.
                        const childActive = child === activeChild
                        return (
                          <div
                            key={child}
                            className="mock-subnav-item"
                            style={{
                              color: childActive ? APP.sidebarAccentFg : APP.mutedFg,
                              backgroundColor: childActive ? APP.sidebarAccent : 'transparent',
                              fontWeight: childActive ? 500 : 400,
                            }}
                          >
                            {child}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Fußbereich: Konto → Einstellungen, wie im echten Dashboard */}
        <div style={{ borderTop: `1px solid ${APP.sidebarBorder}`, padding: '10px 8px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 8px', borderRadius: '6px' }}>
            <Image
              src="/avatar.webp"
              alt=""
              width={28}
              height={28}
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                objectFit: 'cover',
                flexShrink: 0,
                border: `1px solid ${APP.sidebarBorder}`,
              }}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 500, color: APP.sidebarAccentFg, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Eric Schuck
              </p>
              <p style={{ margin: 0, fontSize: '11px', color: APP.mutedFg, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                eric@athena-finance.de
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Inhalt ──
          minHeight: 0 ist hier Pflicht, nicht Kosmetik: `.mock-content` ist
          eine Grid-Zelle in `.mock-root` (das `overflow:hidden` trägt, siehe
          Kommentar unten). Grid-Zellen bekommen ohne explizites minHeight:0
          ein implizites min-height:auto — der Flex-Column-Inhalt kann dadurch
          über die feste Root-Höhe hinauswachsen, statt zu schrumpfen, und der
          Überstand wird kommentarlos abgeschnitten (genau das Kacheln-
          abgeschnitten/Transaktionen-unsichtbar-Problem aus dem Chat). */}
      <div
        className={reserveRight ? 'mock-content mock-content-inset' : 'mock-content'}
        style={{
          padding: 'clamp(18px, 2.2vw, 34px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(12px, 1.4vw, 20px)',
          minWidth: 0,
          minHeight: 0,
        }}
      >
        {/*
          `key={Math.max(view, 0)}` statt roh `key={view}` erzwingt einen
          Remount bei jedem ECHTEN Szenenwechsel und triggert damit die
          mock-view-fade-Animation (siehe landing.css) — ohne das würden die
          Szenen hart umschalten statt weich einzublenden. Jede Szene rendert
          hier ihr KOMPLETTES eigenes Layout, nicht nur getauschte Karten in
          einem gemeinsamen Raster.

          Der Clamp ist hier Pflicht, nicht Kosmetik: `view` durchläuft beim
          Öffnen kurz -1 (Säule noch leer, siehe Kommentar unten) BEVOR es 0
          erreicht — beides zeigt exakt dieselbe Dashboard-Szene (siehe
          `active` oben), aber mit dem rohen `view` als Key sah React darin
          einen Szenenwechsel und blendete die IDENTISCHE Szene einmal aus und
          wieder ein, bevor die Säule überhaupt zu rotieren begann (siehe
          Chat: "dieselbe Szene nochmal mit demselben Übergang, sieht komisch
          aus"). Mit dem Clamp bleiben -1 und 0 derselbe Key — kein Fade,
          die Szene steht einfach durchgehend da, bis der erste ECHTE
          Wechsel (0 → 1) kommt. */}
        <div key={Math.max(view, 0)} className="mock-view-fade" style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(12px, 1.4vw, 20px)', flex: 1, minHeight: 0 }}>
          {/* -1 (Säule noch leer) fällt bewusst auf die Dashboard-Szene durch
              — kein Skeleton-Zwischenschritt mehr, siehe Kommentar bei `active`. */}
          {view === 1 ? <AnalyseView />
            : view === 2 ? <AthenaView />
            : view === 3 ? <CryptoView visible={visible} />
            : <DashboardView run={run} />}
        </div>
      </div>
    </div>
  )
}
