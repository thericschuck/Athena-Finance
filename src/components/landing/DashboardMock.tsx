'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import {
  LayoutDashboard, TrendingUp, CircleDollarSign, Target, ShoppingCart,
  Briefcase, BarChart2, History, Settings, ArrowUpRight, ArrowDownRight, Dot,
} from 'lucide-react'
import { Logo } from '@/components/ui/logo'
import { AU, F, kicker } from './landing-tokens'
import type { PortfolioHistoryPoint } from '@/app/actions/depot'
import type { ChartTab } from '@/components/depot/depot-chart'
import type { Summary } from '@/components/dashboard/finance-analytics'
import type { DonutEntry } from '@/components/crypto/portfolio-donut-card'
import type { HeatmapDay, SankeyData, CashflowEvent, MonthlyComparison, CategoryDatum } from '@/lib/analyseData'

/**
 * Dritter Schritt desselben Musters (siehe DepotChart/IncomeExpenseChart-
 * Kommentare oben): die Analyse-Szene zog bisher drei erfundene Mini-Karten
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
const DepotChart = dynamic(() => import('@/components/depot/depot-chart').then((m) => m.DepotChart), { ssr: false })

/**
 * Zweiter Schritt desselben Musters (siehe DepotChart oben): Dashboard-,
 * Analyse- und Crypto-Szene ziehen jetzt ebenfalls echte recharts-
 * Komponenten aus der eingeloggten App statt handgebauter SVG-Charts
 * (BarsChart, LiveChart, AllocationDonut) nach. Bewusst NICHT übernommen:
 * AusgabenHeatmap.tsx, KategorienChart-impl.tsx, dashboard/portfolio-donut.tsx
 * und net-worth-chart.tsx — die nutzen entweder eine komplett andere,
 * Aurum-fremde Hex-Palette oder eine andere Kategorisierung (Konten/Depot/
 * Krypto/Gesamt bzw. Finanzen/Depot/Krypto/Sparziele statt Depot/Crypto/
 * Cash) als das Figma-Redesign. Sie 1:1 zu übernehmen würde die bereits
 * hergestellte Figma-Treue wieder zerstören statt sie zu verbessern.
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
 * Sidebar-Struktur, Navigation und Aurum-Grundpalette bleiben wiedererkennbar,
 * Kartenform und Layout pro Szene sind freie Illustration für die Landing
 * Page — aber die CHARTS selbst (Gridlines, Tooltips, Donut mit
 * Center-Label, Composed Bar+Line, Filter-Pills/Chips) übernehmen bewusst
 * exakt die visuelle Sprache der echten Chart-Komponenten (siehe
 * src/components/dashboard/net-worth-chart.tsx, finance-analytics.tsx,
 * portfolio-donut.tsx), nur auf Aurum-Tokens statt Tailwind-Theme-Klassen
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
  { icon: TrendingUp, label: 'Finance', children: ['Konten', 'Transaktionen', 'Kategorien', 'Schulden', 'Verträge', 'Sparziele'] },
  { icon: CircleDollarSign, label: 'Crypto', children: ['Portfolio', 'Rebalancing', 'Assets'] },
  { icon: Target, label: 'Strategy' },
  { icon: ShoppingCart, label: 'Lebenshaltungskosten' },
  { icon: Briefcase, label: 'Depot' },
  { icon: BarChart2, label: 'Analyse' },
  { icon: History, label: 'Historie' },
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
  { nav: 'Analyse' },
  { nav: 'Depot' },
  { nav: 'Crypto' },
] as const

/** Vermögens-Kennzahl für den Header von NetWorthCard. War früher ein Array
    mit drei weiteren Einträgen (Einnahmen/Monat, Ausgaben/Monat, Sparquote)
    als eigene Mini-Karten — die doppelten sich mit der rotierenden Säule
    daneben (siehe MOCK_VIEWS-Kommentar oben) und sind raus. */
const NET_WORTH_STAT = { label: 'Vermögen', value: 84320, suffix: ' €', delta: '+12,4 %', up: true }

/** Vier Kennzahlen-Kacheln über der NetWorthCard — 1:1 aus dem Figma-
    Redesign (StatsRow: Gesamtvermögen/Depot/Crypto/Cash, jeweils mit
    ↑-Delta „ggü. Vormonat"). Fehlte im Mockup bisher komplett (siehe Chat) —
    NetWorthCard allein deckte nur die Gesamtsumme ab, nicht die Aufteilung
    je Anlageklasse auf einen Blick. */
const DASHBOARD_STATS = [
  { label: 'Gesamtvermögen', value: '84.320 €', delta: '+12,4 %' },
  { label: 'Depot', value: '42.160 €', delta: '+8,1 %' },
  { label: 'Crypto', value: '25.296 €', delta: '+21,7 %' },
  { label: 'Cash', value: '16.864 €', delta: '+1,2 %' },
] as const

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

/** Portfolio-Mix — Beträge statt fixer Prozente, damit Anteil UND
    Gesamtsumme wie im echten PortfolioDonut aus denselben Zahlen entstehen.
    Labels bewusst wie die Sidebar-Sektionen (siehe NAV: „Depot", „Crypto")
    statt eigener Begriffe — dieselben Namen taucht auch in ASSET_TABS
    wieder auf (siehe NetWorthCard). */
const MIX = [
  { label: 'Depot', amount: 42200, color: AU.gold },
  { label: 'Crypto', amount: 25300, color: AU.positive },
  { label: 'Cash', amount: 16820, color: AU.secondaryFg },
]

/** Nicht wirklich filternde Asset-Tabs für den Gesamtvermögen-Chart (siehe
    NetWorthCard) — reine Chrome, soll aber zeigen: hier ließen sich später
    einzelne Verläufe je Anlageklasse abrufen statt nur die Summe. */
const ASSET_TABS = ['Gesamt', ...MIX.map((m) => m.label)]

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

/** Gesamtvermögen-Verlauf für die Dashboard-Szene — Cash, Depot und Krypto
    zusammen (siehe MIX). Letzter Wert deckungsgleich mit NET_WORTH_STAT.value,
    damit Header-Zahl und Chart in NetWorthCard dieselbe Geschichte erzählen.
    Bewusst mit echten Rückgängen statt einer glatten Aufwärtskurve (ein Depot-/Krypto-Mix
    schwankt real) — sonst sähe der Chart neben Kontostand/Portfolio-Wert
    (beide mit sichtbaren Dellen) unmotiviert linear aus. Gold statt Blau/
    Teal: anders als die beiden ist das hier die zentrale Vermögenskennzahl,
    kein neutraler Einzel-Verlauf. */
const NET_WORTH_HISTORY = [
  { label: 'Nov', value: 58400 },
  { label: 'Dez', value: 61100 },
  { label: 'Jan', value: 59200 },
  { label: 'Feb', value: 63800 },
  { label: 'Mär', value: 68400 },
  { label: 'Apr', value: 65100 },
  { label: 'Mai', value: 71900 },
  { label: 'Jun', value: 76200 },
  { label: 'Jul', value: 73800 },
  { label: 'Aug', value: 79600 },
  { label: 'Sep', value: 84320 },
]

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
    (dieselbe Begründung wie bei DEPOT_DATES_ISO), eine Spalte "Portfolio"
    statt mehrerer Depots: die Landing-Szene zeigt nur einen Gesamtverlauf. */
const CRYPTO_CHART_DATA: Array<Record<string, string | number>> = PORTFOLIO_HISTORY.map((p, i) => ({
  date: `2026-${String(2 + i).padStart(2, '0')}-01`,
  Portfolio: p.value,
}))
const CRYPTO_MONTH_ABBR = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
const cryptoXFormatter = (v: string) => CRYPTO_MONTH_ABBR[Number(v.slice(5, 7)) - 1]

/** Wert (Marktwert) UND Cost Basis (Einstand) zusammen für die Depot-Szene —
    Zahlen 1:1 aus dem echten Depot übernommen (Screenshot der echten Seite),
    nicht mehr frei erfunden: dieselbe Geschichte wie DEPOT_STATS unten. Cost
    Basis bleibt nach Anfangs-Einzahlung + einer Sparplanrate flach bei 1990,
    Wert schwankt darüber bis zum aktuellen Live-Kurs-Stand. */
const DEPOT_HISTORY = [
  { label: '13. März 26', wert: 1965, cost: 1965 },
  { label: '27. März 26', wert: 2010, cost: 1965 },
  { label: '10. Apr 26', wert: 1980, cost: 1990 },
  { label: '24. Apr 26', wert: 2090, cost: 1990 },
  { label: '07. Mai 26', wert: 2150, cost: 1990 },
  { label: '20. Mai 26', wert: 2230, cost: 1990 },
  { label: '02. Juni 26', wert: 2260, cost: 1990 },
  { label: '16. Juni 26', wert: 2280, cost: 1990 },
  { label: '30. Juni 26', wert: 2295, cost: 1990 },
  { label: '14. Juli 26', wert: 2300, cost: 1990 },
  { label: '28. Juli 26', wert: 2305, cost: 1990 },
  { label: '14. Aug 26', wert: 2310.93, cost: 1990.13 },
]

/** Anteile-Verlauf für den "Anteile"-Chart-Tab — wächst nur an den beiden
    Transaktionsterminen (siehe DEPOT_TX), sonst flach: Anteile entstehen
    nur durch Käufe, nicht durch Kursbewegung. */
const DEPOT_ANTEILE_HISTORY = [
  { label: '13. März 26', value: 4.42099 },
  { label: '27. März 26', value: 4.478554 },
  { label: '10. Apr 26', value: 4.478554 },
  { label: '24. Apr 26', value: 4.478554 },
  { label: '07. Mai 26', value: 4.478554 },
  { label: '20. Mai 26', value: 4.478554 },
  { label: '02. Juni 26', value: 4.478554 },
  { label: '16. Juni 26', value: 4.478554 },
  { label: '30. Juni 26', value: 4.478554 },
  { label: '14. Juli 26', value: 4.478554 },
  { label: '28. Juli 26', value: 4.478554 },
  { label: '14. Aug 26', value: 4.478554 },
]

/** ISO-Daten parallel zu DEPOT_HISTORY/DEPOT_ANTEILE_HISTORY (dieselbe
    Reihenfolge, dieselben 12 Stichtage) — nur für DEPOT_HISTORY_RC gebraucht,
    weil PortfolioHistoryPoint['date'] ein echtes Datum statt eines
    deutschen Anzeige-Labels erwartet (siehe fmtDate/fmtDateShort in
    depot-chart.tsx). */
const DEPOT_DATES_ISO = [
  '2026-03-13', '2026-03-27', '2026-04-10', '2026-04-24', '2026-05-07', '2026-05-20',
  '2026-06-02', '2026-06-16', '2026-06-30', '2026-07-14', '2026-07-28', '2026-08-14',
]

/** DEPOT_HISTORY (+ Anteile aus DEPOT_ANTEILE_HISTORY, + Rendite abgeleitet)
    im Format PortfolioHistoryPoint — Eingabedaten für die echte DepotChart-
    Komponente (siehe Import oben), damit die Landing-Szene exakt denselben
    Chart-Code rendert wie das eingeloggte Depot. */
const DEPOT_HISTORY_RC: PortfolioHistoryPoint[] = DEPOT_HISTORY.map((p, i) => ({
  date: DEPOT_DATES_ISO[i],
  price: p.wert / DEPOT_ANTEILE_HISTORY[i].value,
  totalShares: DEPOT_ANTEILE_HISTORY[i].value,
  totalInvested: p.cost,
  portfolioValue: p.wert,
  returnPct: ((p.wert - p.cost) / p.cost) * 100,
}))

/** Kennzahlen-Kacheln der Depot-Szene — 1:1 aus dem echten Depot-Screenshot:
    Portfoliowert trägt die Anteile als Unterzeile (nicht als eigene Kachel),
    die vierte Kachel ist der Live-Kurs statt „Anteile". */
const DEPOT_STATS = {
  portfolioWert: 2310.93,
  investiert: 1990.13,
  gewinnAbs: 320.8,
  gewinnPct: 16.12,
  anteile: 4.478554,
  livePrice: 516.0,
  liveTime: '14:00',
}

/** Transaktionen der Depot-Szene — dieselben Spalten wie die echte
    Transaktionstabelle (Datum/Typ/Betrag/Kurs/Anteile/Notiz). */
const DEPOT_TX = [
  { date: '24.03.2026', type: 'Sparplan', amount: '25,00 €', price: '434,30 €', shares: '0,057564', note: 'Sparplan-Ausführung' },
  { date: '09.03.2026', type: 'Bestand',  amount: '1.965,13 €', price: '444,50 €', shares: '4,42099', note: 'Bestandsübernahme' },
] as const

/** Aktuelle Verteilung der Crypto-Szene — nur noch für „Größte Position" in
    den Stat-Kacheln gebraucht (siehe CryptoView); die Ring-Charts selbst
    laufen längst über CURRENT_ALLOCATION_ENTRIES/TARGET_ALLOCATION_ENTRIES
    unten (echte DonutCard-Komponente, eigenes DonutEntry-Shape). */
const CURRENT_ALLOCATION = [
  { label: 'PAXG', pct: 70, color: AU.gold },
  { label: 'SOLANA', pct: 30, color: AU.accentLavender },
]
/** color/pct hier dieselben Werte wie CURRENT_ALLOCATION (siehe oben) —
    Farbpunkt und Anteils-Balken je Zeile in AssetsList sollen sich sichtbar
    auf den „Aktuelle Verteilung"-Ring daneben beziehen, nicht zufällig
    andersfarbig sein. */
const CRYPTO_ASSETS = [
  { label: 'PAXG', sub: '1.035 · 69,6 %', amount: '1.035 €', pct: 70, color: AU.gold },
  { label: 'SOLANA', sub: '3,42 · 30,4 %', amount: '459 €', pct: 30, color: AU.accentLavender },
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

/** Anteile-Format der Depot-Szene — wie fmtShares in der echten Depot-
    Dashboard-Komponente (4-6 Nachkommastellen, Bruchteile sind hier üblich). */
const fmtShares = (n: number) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: 4, maximumFractionDigits: 6 })

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
  backgroundColor: AU.card,
  border: `1px solid ${AU.border}`,
  borderRadius: '10px',
  padding: 'clamp(14px, 1.6vw, 22px)',
}

/** Gemeinsame Karten-Hülle: Aurum-Fläche plus Cursor-Tilt/Glanzlicht (siehe
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
      style={{ ...kicker, fontSize: 'clamp(9px, .75vw, 11px)', color: AU.mutedFg, position: 'relative' }}
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
        color: up ? AU.positive : AU.destructive,
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
      <span style={{ fontFamily: F.mono, fontSize: 'clamp(15px, 1.5vw, 19px)', color: valueColor ?? AU.cardFg, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: 'clamp(9px, .75vw, 11px)', color: AU.mutedFg }}>{sub}</span>}
    </TiltCard>
  )
}

function StatTilesRow({
  tiles,
  style,
}: {
  tiles: Array<{ label: string; value: React.ReactNode; sub?: React.ReactNode; valueColor?: string }>
  style?: React.CSSProperties
}) {
  return (
    <div
      className="mock-charts"
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
        color: dir === 'up' ? AU.positive : dir === 'down' ? AU.destructive : baseColor,
        transition: 'color .5s ease',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {children}
    </span>
  )
}

/** Quadratische Kurve durch alle Punkte, Kontrollpunkt jeweils der Punkt
    selbst, Zielpunkt der Mittelpunkt zum nächsten — ergibt eine durchgehend
    glatte Linie ohne Ecken an den Datenpunkten. */
function smoothPath(points: { x: number; y: number }[]) {
  if (points.length < 2) return ''
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const cur = points[i]
    const next = points[i + 1]
    d += ` Q ${cur.x} ${cur.y} ${(cur.x + next.x) / 2} ${(cur.y + next.y) / 2}`
  }
  const last = points[points.length - 1]
  d += ` L ${last.x} ${last.y}`
  return d
}

/**
 * Tooltip-Karte im Stil der echten Chart-Tooltips (siehe ChartTooltip in
 * net-worth-chart.tsx / finance-analytics.tsx: `rounded-lg border bg-popover
 * shadow p-3 text-xs`, fetter Titel, darunter Zeilen mit Farbpunkt + Wert).
 * `left`/`top` in Prozent der Eltern-Box, damit sie sowohl über einem
 * `<svg>`-Chart (LiveChart/BarsChart) als auch über Flex-Balken positioniert
 * werden kann.
 */
function ChartTooltipCard({
  left,
  top = 0,
  title,
  rows,
}: {
  left: number
  top?: number
  title: string
  rows: { label: string; value: string; color: string }[]
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: `${left}%`,
        top: `${top}%`,
        transform: 'translate(-50%, -100%)',
        marginTop: '-8px',
        backgroundColor: AU.card,
        border: `1px solid ${AU.border}`,
        borderRadius: '8px',
        boxShadow: '0 8px 24px -8px rgba(0,0,0,.5)',
        padding: '10px 12px',
        minWidth: '140px',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      <p style={{ margin: '0 0 6px', fontSize: '11px', fontWeight: 600, color: AU.cardFg }}>{title}</p>
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', marginTop: '3px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: AU.mutedFg }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: r.color, flexShrink: 0 }} />
            {r.label}
          </span>
          <span style={{ fontFamily: F.mono, fontSize: '11px', fontWeight: 500, color: AU.cardFg, fontVariantNumeric: 'tabular-nums' }}>
            {r.value}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Gestrichelte horizontale Gridlines wie `CartesianGrid strokeDasharray="3 3"
 * vertical={false}` im echten Dashboard — nur horizontal, keine Achsenlinie,
 * kein Tick. `rows` Linien gleichmäßig über die Höhe verteilt.
 */
function ChartGrid({ W, H, rows = 3 }: { W: number; H: number; rows?: number }) {
  return (
    <g aria-hidden>
      {Array.from({ length: rows }, (_, i) => {
        const y = (H / rows) * (i + 1)
        return <line key={i} x1={0} y1={y} x2={W} y2={y} stroke={AU.border} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      })}
    </g>
  )
}

/**
 * Verlaufs-Chart (Linie + Fläche) mit Crosshair, das der Maus stetig folgt
 * — Basis für Kontostand-Verlauf (Finance) und Portfolio-Wert (Crypto).
 *
 * Der Wert unter dem Cursor wird zwischen den beiden nächsten Datenpunkten
 * interpoliert statt auf den nächsten Punkt einzurasten: das liest sich wie
 * ein echtes „Fahre über den Verlauf" statt wie diskrete Hover-Zonen.
 *
 * Enthüllung per `clip-path` von links nach rechts statt stroke-dashoffset:
 * dafür bräuchte es die exakte Pfadlänge (per getTotalLength, erst nach dem
 * ersten Render bekannt) — ein Rechteck-Ausschnitt braucht das nicht.
 */
function LiveChart({
  title,
  points,
  color,
  run,
  showHeader = true,
}: {
  title: string
  points: { label: string; value: number }[]
  color: string
  run: boolean
  /** Aus, wenn ein Elternteil (z. B. NetWorthCard) Titel/Wert schon selbst
      groß darstellt — verhindert die Zahl doppelt zu zeigen. */
  showHeader?: boolean
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hoverX, setHoverX] = useState<number | null>(null)
  const W = 300
  const H = 140
  const PAD = 6
  const min = Math.min(...points.map((p) => p.value))
  const max = Math.max(...points.map((p) => p.value))
  const range = max - min || 1
  const coords = points.map((p, i) => ({
    x: PAD + (i / (points.length - 1)) * (W - PAD * 2),
    y: PAD + (1 - (p.value - min) / range) * (H - PAD * 2),
  }))
  const linePath = smoothPath(coords)
  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${H} L ${coords[0].x} ${H} Z`
  const gradientId = `mock-grad-${title.replace(/[^a-z0-9]/gi, '')}`
  const last = points[points.length - 1]

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const wrap = wrapRef.current
    if (!wrap) return
    const rect = wrap.getBoundingClientRect()
    const relX = ((e.clientX - rect.left) / rect.width) * W
    setHoverX(Math.max(PAD, Math.min(W - PAD, relX)))
  }

  let hover: { x: number; y: number; value: number; label: string } | null = null
  if (hoverX !== null) {
    let i = 0
    while (i < coords.length - 2 && coords[i + 1].x < hoverX) i++
    const a = coords[i]
    const b = coords[i + 1] ?? coords[i]
    const t = b.x === a.x ? 0 : Math.max(0, Math.min(1, (hoverX - a.x) / (b.x - a.x)))
    const y = a.y + (b.y - a.y) * t
    const va = points[i].value
    const vb = points[Math.min(i + 1, points.length - 1)].value
    const label = t < 0.5 ? points[i].label : points[Math.min(i + 1, points.length - 1)].label
    hover = { x: hoverX, y, value: va + (vb - va) * t, label }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      {showHeader && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <CardLabel>{title}</CardLabel>
          <span style={{ position: 'relative', fontFamily: F.mono, fontSize: 'clamp(15px, 1.5vw, 20px)', color: AU.cardFg, fontVariantNumeric: 'tabular-nums' }}>
            {last.value.toLocaleString('de-DE')} €
          </span>
        </div>
      )}
      <div
        ref={wrapRef}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverX(null)}
        style={{ position: 'relative', flex: 1, marginTop: showHeader ? '12px' : 0, minHeight: 0 }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.16" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <ChartGrid W={W} H={H} />
          <g style={{ clipPath: run ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)', transition: 'clip-path 1.1s cubic-bezier(.16,1,.3,1)' }}>
            <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
            <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </g>
          {hover && (
            <line x1={hover.x} y1={0} x2={hover.x} y2={H} stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity="0.55" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {hover && (
          <>
            {/*
              Als HTML-Overlay statt als <circle> im SVG: `viewBox="0 0 300 140"`
              mit `preserveAspectRatio="none"` (siehe oben) staucht/streckt x
              und y unterschiedlich stark, sobald die Karte nicht exakt im
              300:140-Seitenverhältnis gerendert wird (z. B. seit der Chart auf
              Halbbreite läuft, siehe DashboardView) — ein <circle> mit festem
              r wird darin zur Ellipse, weil `vector-effect="non-scaling-
              stroke"` nur den Strich, nicht den Radius vor der Verzerrung
              schützt. Ein „echter" DOM-Kreis mit fixer Pixelgröße bleibt
              unabhängig vom SVG-Streckungsfaktor rund.
            */}
            <div
              style={{
                position: 'absolute',
                left: `${(hover.x / W) * 100}%`,
                top: `${(hover.y / H) * 100}%`,
                transform: 'translate(-50%, -50%)',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: color,
                border: `2px solid ${AU.card}`,
                pointerEvents: 'none',
              }}
            />
            <ChartTooltipCard
              left={(hover.x / W) * 100}
              top={(hover.y / H) * 100}
              title={hover.label}
              rows={[{ label: title, value: `${Math.round(hover.value).toLocaleString('de-DE')} €`, color }]}
            />
          </>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
        {points.map((p) => (
          <span key={p.label} style={{ fontFamily: F.mono, fontSize: 'clamp(8px, .65vw, 10px)', color: AU.mutedFg, opacity: .7 }}>
            {p.label}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Eigenständige Portfolio-Mix-Kachel neben dem Gesamtvermögen-Chart (siehe
    DashboardView) — vorher ein schmaler Streifen ÜBER dem Chart (Ring plus
    einzeilige Legende, siehe Git-Historie), jetzt eine gleichrangige zweite
    Kachel neben dem auf Halbbreite reduzierten Chart: größerer Ring plus
    vertikale Legende mit Beträgen UND Prozenten, analog zu den Donut-Karten
    der Crypto-Szene (siehe DonutCard) — nur mit den MIX-eigenen Farben
    (Depot/Crypto/Cash) statt Coin-Markenfarben, deshalb hier weiterhin
    handgebaut statt DonutCard selbst wiederzuverwenden. */
function PortfolioMixCard({ run }: { run: boolean }) {
  const [hover, setHover] = useState<number | null>(null)
  const total = MIX.reduce((s, m) => s + m.amount, 0)
  // Segmente als gestrichelter Kreis, Umfang 2πr bei r=42. Offsets vorab
  // kumulieren statt im map() mitzuzählen — eine Variable während des
  // Renderns fortzuschreiben ist in React nicht zulässig und liefert bei
  // unterbrochenem Rendering falsche Werte.
  const R = 42
  const CIRC = 2 * Math.PI * R
  const GAP = CIRC * 0.018 // Lücke zwischen Segmenten, wie paddingAngle im echten Donut
  const SEGMENTS = MIX.reduce<{ seg: (typeof MIX)[number]; pct: number; offset: number }[]>((list, seg) => {
    const prev = list[list.length - 1]
    const pct = (seg.amount / total) * 100
    const offset = prev ? prev.offset + (prev.pct / 100) * CIRC : 0
    return [...list, { seg, pct, offset }]
  }, [])

  return (
    <TiltCard style={{ minHeight: 0, display: 'flex', flexDirection: 'column', padding: 'clamp(18px, 2vw, 26px)' }}>
      <CardLabel>Portfolio-Mix</CardLabel>
      <p style={{ margin: '3px 0 0', fontFamily: F.mono, fontSize: 'clamp(9px, .75vw, 11px)', color: AU.mutedFg }}>
        {fmtEurPlain(total)}
      </p>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'clamp(14px, 1.8vw, 22px)' }}>
        <div style={{ position: 'relative', width: 'clamp(84px, 8vw, 116px)', flexShrink: 0 }}>
          <svg viewBox="0 0 100 100" style={{ width: '100%', transform: 'rotate(-90deg)' }}>
            <circle cx="50" cy="50" r={R} fill="none" stroke={AU.secondary} strokeWidth="16" />
            {SEGMENTS.map(({ seg, pct, offset }, i) => (
              <circle
                key={seg.label}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={seg.color}
                strokeWidth={hover === i ? 19 : 16}
                strokeLinecap="butt"
                strokeDasharray={`${Math.max(0, (pct / 100) * CIRC - GAP) * (run ? 1 : 0)} ${CIRC}`}
                strokeDashoffset={-(offset + GAP / 2) * (run ? 1 : 0)}
                opacity={hover === null || hover === i ? 1 : 0.4}
                style={{ transition: 'stroke-dasharray 1s cubic-bezier(.16,1,.3,1), stroke-dashoffset 1s cubic-bezier(.16,1,.3,1), stroke-width .2s ease, opacity .2s ease' }}
              />
            ))}
          </svg>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(6px, .9vh, 10px)', width: '100%' }}>
          {SEGMENTS.map(({ seg, pct }, i) => (
            <div
              key={seg.label}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: '10px',
                opacity: hover === null || hover === i ? 1 : 0.45,
                transition: 'opacity .2s ease',
                cursor: 'default',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'clamp(11px, .9vw, 13px)', color: AU.secondaryFg, minWidth: 0 }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: seg.color, flexShrink: 0 }} />
                {seg.label}
              </span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: '6px', fontFamily: F.mono, flexShrink: 0 }}>
                <span style={{ fontSize: 'clamp(10px, .85vw, 12px)', color: AU.cardFg }}>{fmtEurPlain(seg.amount)}</span>
                <span style={{ fontSize: 'clamp(9px, .75vw, 11px)', color: AU.mutedFg }}>{Math.round(pct)}%</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </TiltCard>
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
        <p style={{ margin: '3px 0 0', fontSize: 'clamp(9px, .75vw, 11px)', color: AU.mutedFg }}>{sub}</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(14px, 1.6vw, 18px)' }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: r.color, flexShrink: 0 }} />
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: 'clamp(11px, .9vw, 13px)', color: AU.cardFg }}>{r.label}</span>
                  <span style={{ fontFamily: F.mono, fontSize: 'clamp(9px, .7vw, 10px)', color: AU.mutedFg }}>{r.sub}</span>
                </span>
              </span>
              <span style={{ fontFamily: F.mono, fontSize: 'clamp(11px, .9vw, 13px)', color: AU.cardFg, whiteSpace: 'nowrap' }}>
                {r.amount}
              </span>
            </div>
            <div style={{ height: '3px', borderRadius: '2px', backgroundColor: AU.secondary, overflow: 'hidden' }}>
              <div style={{ width: `${r.pct}%`, height: '100%', borderRadius: '2px', backgroundColor: r.color }} />
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 'auto',
          paddingTop: 'clamp(10px, 1.2vw, 14px)',
          borderTop: `1px solid ${AU.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <span style={{ ...kicker, fontSize: 'clamp(9px, .75vw, 11px)', color: AU.mutedFg }}>Gesamt</span>
        <span style={{ fontFamily: F.mono, fontSize: 'clamp(12px, 1vw, 14px)', color: AU.cardFg }}>{total}</span>
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
              borderBottom: `1px solid ${AU.border}`,
              backgroundColor: hover === i ? AU.secondary : 'transparent',
              transition: 'background-color .18s ease',
            }}
          >
            <span style={{ fontFamily: F.mono, fontSize: 'clamp(10px, .8vw, 12px)', color: AU.mutedFg }}>{b.day}</span>
            <span style={{ fontSize: 'clamp(12px, 1vw, 14px)', color: AU.cardFg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {b.label}
            </span>
            <span className="booking-cat" style={{ ...kicker, fontSize: 'clamp(8px, .7vw, 10px)', color: AU.mutedFg }}>
              {b.cat}
            </span>
            <span
              style={{
                fontFamily: F.mono,
                fontSize: 'clamp(11px, .95vw, 14px)',
                color: b.amount > 0 ? AU.positive : AU.destructive,
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

/** Transaktionstabelle der Depot-Szene — dieselben Spalten wie die echte
    Tabelle (Datum/Typ/Betrag/Kurs/Anteile), als CSS-Grid statt <table>: die
    übrige Szene ist schon durchgehend divs/spans, ein <table> bräuchte hier
    eigene Breiten-Logik ohne echten Zugewinn. */
function DepotTxTable() {
  return (
    <>
      <CardLabel>Transaktionen</CardLabel>
      <div
        style={{
          marginTop: '14px',
          display: 'grid',
          gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
          gap: '8px 12px',
          alignItems: 'center',
        }}
      >
        {['Datum', 'Typ', 'Betrag', 'Kurs', 'Anteile', 'Notiz'].map((h) => (
          <span key={h} style={{ ...kicker, fontSize: 'clamp(8px, .65vw, 10px)', color: AU.mutedFg }}>
            {h}
          </span>
        ))}
        {DEPOT_TX.map((tx) => (
          <Fragment key={tx.date}>
            <span style={{ fontFamily: F.mono, fontSize: 'clamp(10px, .85vw, 12px)', color: AU.secondaryFg }}>{tx.date}</span>
            <span style={{ fontSize: 'clamp(10px, .85vw, 12px)', color: tx.type === 'Sparplan' ? AU.gold : AU.mutedFg }}>{tx.type}</span>
            <span style={{ fontFamily: F.mono, fontSize: 'clamp(10px, .85vw, 12px)', color: AU.cardFg }}>{tx.amount}</span>
            <span style={{ fontFamily: F.mono, fontSize: 'clamp(10px, .85vw, 12px)', color: AU.mutedFg }}>{tx.price}</span>
            <span style={{ fontFamily: F.mono, fontSize: 'clamp(10px, .85vw, 12px)', color: AU.gold }}>{tx.shares}</span>
            <span style={{ fontSize: 'clamp(10px, .85vw, 12px)', color: AU.mutedFg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.note}</span>
          </Fragment>
        ))}
      </div>
    </>
  )
}

/** Reiter-Leiste, gemeinsame Bauart für Zeitraum- UND Asset-Filter (siehe
    PeriodTabs/AssetTabs): aktiv = gefüllte Pille mit leichtem Scale, inaktiv
    = Ghost-Text mit Hover. Echt umschaltbar (eigener State je Instanz), aber
    ohne Wirkung auf die Charts darunter — reine Chrome, die zeigen soll,
    dass sich der Verlauf theoretisch nach Zeitraum und Anlageklasse
    aufschlüsseln ließe (siehe NetWorthCard). */
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
              backgroundColor: isActive ? AU.cardFg : 'transparent',
              color: isActive ? AU.bg : AU.mutedFg,
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

/** Anlageklassen-Filter neben den Zeitraum-Tabs — Labels wie ASSET_TABS
    (Gesamt + dieselben Namen wie in MIX/der Sidebar), damit klar wird: hier
    könnte statt der Summe auch nur Depot oder Crypto allein angezeigt
    werden. */
function AssetTabs() {
  const [active, setActive] = useState('Gesamt')
  return <TabPills options={ASSET_TABS} active={active} onChange={setActive} />
}

/** Großer, zusammengesetzter „Gesamtvermögen"-Aufmacher der Dashboard-Szene:
    Zahl + Delta, darunter Zeitraum-/Asset-Tabs (siehe TabPills — ohne echte
    Wirkung) und der Verlauf selbst. Portfolio-Mix ist keine Zeile mehr HIER
    drin, sondern eine eigene Kachel daneben (siehe PortfolioMixCard/
    DashboardView) — dieser Chart läuft deshalb jetzt nur über die halbe
    Kartenbreite statt volle Breite. Ersetzt die frühere Kennzahlen-Reihe
    (Vermögen/Einnahmen/Ausgaben/Sparquote): die drei Nebenkennzahlen
    doppelten sich mit der rotierenden Säule daneben (siehe PedimentReveal/
    STATS) — hier bleibt nur, was die Säule NICHT schon zeigt: Verlauf und
    Zusammensetzung des Vermögens. */
function NetWorthCard({ run }: { run: boolean }) {
  const stat = NET_WORTH_STAT
  const shown = useCountUp(stat.value, run, 0)

  return (
    <>
      <div>
        <CardLabel>{stat.label}</CardLabel>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginTop: '4px', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: F.display, fontSize: 'clamp(28px, 3.4vw, 44px)', lineHeight: 1, color: AU.cardFg }}>
            {shown}{stat.suffix}
          </span>
          <DeltaChip up={stat.up} delta={stat.delta} />
        </div>
      </div>

      {/*
        Eigene Zeile für die Tabs statt (wie zuvor) rechts NEBEN Zahl/Delta,
        seit diese Karte nur noch halbe Breite hat (siehe DashboardView) —
        beides nebeneinander in ~460px passte nicht mehr auf eine Zeile und
        `flexWrap` warf die Tabs ungeplant auf eine dritte Zeile darunter.
        Das war kein kosmetischer Fehler, sondern hat dem darunterliegenden
        Chart-Div (flex: 1) einen Großteil seiner Höhe weggenommen — der
        Hover-Punkt wurde dadurch zur Ellipse (siehe LiveChart-Kommentar).
        Eine EIGENE, IMMER zweizeilige Kopfzeile (Zahl, dann Tabs) reserviert
        eine feste, vorhersagbare Höhe unabhängig von der Kartenbreite. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginTop: 'clamp(10px, 1.2vw, 14px)' }}>
        <PeriodTabs />
        <AssetTabs />
      </div>

      <div style={{ flex: 1, minHeight: 0, marginTop: 'clamp(14px, 1.8vw, 22px)' }}>
        <LiveChart title="Gesamtvermögen" points={NET_WORTH_HISTORY} color={AU.gold} run={run} showHeader={false} />
      </div>
    </>
  )
}

// ── Die vier Szenen — jede mit eigenem Layout statt getauschter Karten im
//    selben Raster ───────────────────────────────────────────────────────────

function DashboardView({ run }: { run: boolean }) {
  return (
    <>
      <StatTilesRow
        style={{ height: 'clamp(88px, 12vh, 110px)' }}
        tiles={DASHBOARD_STATS.map((s) => ({
          label: s.label,
          value: s.value,
          sub: (
            <>
              <span style={{ color: AU.positive }}>↑ {s.delta}</span> ggü. Vormonat
            </>
          ),
        }))}
      />
      {/* Chart-Kachel jetzt nur noch halbe Breite, Portfolio-Mix als
          gleichrangige zweite Kachel daneben statt als Streifen darüber
          (siehe PortfolioMixCard/NetWorthCard-Kommentar) — dadurch wirkt die
          Reihe ausgewogener aufgeteilt statt einer schmalen Zeile über einem
          sehr breiten Chart.
          `gridAutoRows: '1fr'` ist hier Pflicht, kein Kosmetik-Detail: anders
          als ein Flex-Container sizt CSS Grid eine implizite Zeile per
          Default auf `auto` (= Inhaltshöhe), statt sie auf die verfügbare
          Höhe des Grid-Containers zu strecken. Das `flex: 1` am Chart-Div in
          LiveChart konnte die Zeile dadurch nicht mehr aufziehen wie zuvor
          (als NetWorthCard noch alleine, ohne Grid, direkt in einer Flex-
          Column-TiltCard saß) — die Zeile kollabierte auf die Minimalhöhe
          des SVGs (~25px), wodurch auch der Hover-Punkt zur Ellipse wurde
          (siehe LiveChart-Kommentar). `1fr` zwingt die Zeile stattdessen auf
          die volle Höhe des Grid-Containers (der seinerseits ganz normal per
          `flex: 2 1 0%` von seinem Flex-Eltern-Element seine Höhe bekommt). */}
      <div
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gridAutoRows: '1fr', gap: 'clamp(10px, 1.2vw, 16px)', flex: '2 1 0%', minHeight: 0 }}
      >
        <TiltCard style={{ minHeight: 0, display: 'flex', flexDirection: 'column', padding: 'clamp(18px, 2vw, 26px)' }}>
          <NetWorthCard run={run} />
        </TiltCard>
        <PortfolioMixCard run={run} />
      </div>
      {/* Echte recharts-Komponente aus dem eingeloggten Dashboard (siehe
          Import oben) statt der handgebauten BarsChart-SVG — bringt ihre
          eigene <Card>-Chrome (Titel „Einnahmen vs. Ausgaben" + Rahmen)
          gleich mit, deshalb hier bewusst KEIN umschließender TiltCard
          (sonst doppelte Karten-Chrome, siehe DepotChart-Kommentar unten). */}
      <div style={{ flexShrink: 0 }}>
        <IncomeExpenseChart summaries={FINANCE_SUMMARIES} locale="de-DE" height={140} />
      </div>
      <TiltCard className="mock-bookings" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <BookingsList title="Letzte Buchungen" bookings={BOOKINGS.slice(0, 5)} />
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
 * DepotChart/IncomeExpenseChart/DonutCard), deshalb kein TiltCard-Wrapper.
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
        <span style={{ fontFamily: F.display, fontSize: 'clamp(18px, 1.8vw, 24px)', color: AU.cardFg }}>Analyse</span>
        <PeriodTabs />
      </div>
      <div style={{ flexShrink: 0 }}>
        <AusgabenHeatmap data={heatmapData} />
      </div>
      <div
        className="mock-charts"
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
        <div style={{ height: cardHeight, overflow: 'hidden', pointerEvents: 'none' }}>
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
        className="mock-charts"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 'clamp(10px, 1.2vw, 16px)', flexShrink: 0 }}
      >
        <MonatsVergleich data={MONTHLY_COMPARISON} />
        <KategorienChart data={CATEGORY_DATA} />
      </div>
    </>
  )
}

/** Depot-Szene — an das Figma-Mockup angeglichen: vier Stat-Kacheln
    (Portfoliowert/Investiert/Gewinn-Verlust/Anteile), „Wertentwicklung"
    darunter die Transaktionstabelle. War vorher „Finance" mit Kontostand-
    Verlauf + Buchungsliste — die Kontostand-Geschichte erzählt die
    Dashboard-Szene (NetWorthCard) bereits, hier war die Dopplung unnötig.
    Der Chart selbst läuft seit dem recharts-Pilot über dieselbe DepotChart-
    Komponente wie das echte, eingeloggte Depot (siehe Import oben) statt
    über eine eigene handgebaute SVG-Nachbildung. */
/** Statisches Formularfeld fürs Depot-Formular — sieht wie ein echtes
    Input aus (Label + Wert in einer Box), ist aber reine Anzeige: die
    restliche Szene ist ebenfalls nicht wirklich interaktiv (siehe
    CardLabel-Kommentare an anderer Stelle), ein echtes Input wäre hier
    ohne Tastatureingabe-Handling irreführend. */
function MockField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <span style={{ fontSize: 'clamp(10px, .85vw, 12px)', color: AU.mutedFg }}>{label}</span>
      <span
        style={{
          borderRadius: '6px',
          border: `1px solid ${AU.border}`,
          backgroundColor: AU.bg,
          padding: '9px 12px',
          fontFamily: F.mono,
          fontSize: 'clamp(12px, 1vw, 14px)',
          color: value ? AU.cardFg : AU.mutedFg,
          minHeight: '1.4em',
        }}
      >
        {value}
      </span>
    </div>
  )
}

/**
 * Depot-Szene — 1:1 am echten Depot ausgerichtet (Screenshot der echten
 * Seite, nicht mehr am Figma-Entwurf, siehe Chat): Kopfzeile mit Live-Badge,
 * Sparplan-Fällig-Banner, links das Buchungsformular (Tabs Einzahlung/
 * Bestand/Sparplan, hier per TabPills echt umschaltbar wie sonst im Mockup
 * auch), rechts Stat-Kacheln + Chart mit denselben vier Tabs wie im echten
 * DepotChart (Wert/Anteile/Cost Basis/Rendite) + Transaktionstabelle.
 */
/** Kein `run`-Prop (anders als die übrigen Szenen): der Chart läuft über
    die echte recharts-DepotChart-Komponente (siehe Import oben), die ihre
    Eintritts-Animation selbst beim Mount auslöst — passt zusammen mit dem
    `key={view}`-Remount in DashboardMock (siehe dort) ohnehin genau auf den
    Moment, in dem die Depot-Szene aktiv wird. */
function DepotView() {
  const [formTab, setFormTab] = useState('Einzahlung')
  const [chartTab, setChartTab] = useState('Wert')

  return (
    <>
      {/* Kopfzeile: Titel + Live-Kurs-Badge */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', flexShrink: 0 }}>
        <div>
          <span style={{ fontFamily: F.display, fontSize: 'clamp(18px, 1.9vw, 24px)', color: AU.cardFg }}>Depot</span>
          <p style={{ margin: '3px 0 0', fontSize: 'clamp(11px, .9vw, 13px)', color: AU.secondaryFg }}>UniGlobal · DE0008491051</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: `1px solid ${AU.border}`, borderRadius: '8px', padding: '7px 14px', backgroundColor: AU.card, flexShrink: 0 }}>
          <Dot size={16} strokeWidth={5} color={AU.positive} className="mock-live-dot" />
          <span style={{ fontSize: 'clamp(10px, .85vw, 12px)', color: AU.positive, fontWeight: 500 }}>LIVE</span>
          <span style={{ fontFamily: F.mono, fontSize: 'clamp(13px, 1.15vw, 16px)', color: AU.cardFg }}>{fmtEurPlain(DEPOT_STATS.livePrice)}</span>
          <span style={{ fontSize: 'clamp(9px, .75vw, 11px)', color: AU.mutedFg, whiteSpace: 'nowrap' }}>Stand: {DEPOT_STATS.liveTime}</span>
        </div>
      </div>

      {/* Formular links, Kacheln/Chart/Tabelle rechts — dieselbe Aufteilung
          wie im echten Depot (dort: 1/3-Spalte links, Rest rechts). */}
      <div style={{ display: 'flex', gap: 'clamp(12px, 1.4vw, 20px)', flex: 1, minHeight: 0 }}>
        <TiltCard style={{ width: 'clamp(220px, 28%, 340px)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '14px', minHeight: 0, overflow: 'hidden' }}>
          <TabPills options={['Einzahlung', 'Bestand', 'Sparplan']} active={formTab} onChange={setFormTab} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0, overflow: 'hidden' }}>
            <MockField label="Datum" value="14.08.2026" />
            <MockField label="Betrag (€)" value="50" />
            <MockField label="Kurs (NAV)" value="516,0000" />
            <MockField label="Notiz (optional)" value="" />
          </div>
          <p style={{ margin: 0, fontSize: 'clamp(10px, .85vw, 12px)', color: AU.mutedFg, lineHeight: 1.5 }}>
            ≈ <span style={{ color: AU.gold, fontFamily: F.mono }}>0,096899</span> Anteile bei{' '}
            <span style={{ color: AU.cardFg, fontFamily: F.mono }}>516,00 €</span> / Anteil
          </p>
          <span
            style={{
              marginTop: 'auto',
              textAlign: 'center',
              padding: '10px',
              borderRadius: '6px',
              backgroundColor: AU.gold,
              color: AU.bg,
              fontSize: 'clamp(12px, 1vw, 14px)',
              fontWeight: 600,
            }}
          >
            Einzahlung speichern
          </span>
        </TiltCard>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'clamp(12px, 1.4vw, 20px)', minHeight: 0 }}>
          <StatTilesRow
            tiles={[
              { label: 'Portfoliowert', value: fmtEurPlain(DEPOT_STATS.portfolioWert), sub: `${fmtShares(DEPOT_STATS.anteile)} Anteile` },
              { label: 'Investiert', value: fmtEurPlain(DEPOT_STATS.investiert) },
              {
                label: 'Gewinn / Verlust',
                value: `+${fmtEurPlain(DEPOT_STATS.gewinnAbs)}`,
                sub: `+${DEPOT_STATS.gewinnPct.toFixed(2).replace('.', ',')} %`,
                valueColor: AU.positive,
              },
              { label: 'Live-Kurs', value: fmtEurPlain(DEPOT_STATS.livePrice), sub: `LIVE ${DEPOT_STATS.liveTime}`, valueColor: AU.positive },
            ]}
          />
          {/* flex 1.15 statt vorher 'auto': der Chart darf nicht mehr
              unbegrenzt wachsen und die Transaktionstabelle darunter aus dem
              (fest hohen, überlaufversteckten) Mockup-Viewport verdrängen —
              siehe minHeight:0-Kommentar an .mock-content weiter oben. */}
          <TiltCard style={{ flex: '1.15 1 0%', minHeight: 0, display: 'flex', flexDirection: 'column', padding: 'clamp(16px, 1.8vw, 24px)' }}>
            <TabPills options={['Wert', 'Anteile', 'Cost Basis', 'Rendite']} active={chartTab} onChange={setChartTab} />
            {/* Echte recharts-Komponente aus dem eingeloggten Depot (siehe
                Import oben) statt handgebautem SVG — chartTab entspricht
                1:1 dem ChartTab-Union-Typ von depot-chart.tsx (dieselben
                vier Labels). height="100%" statt eines festen Pixelwerts:
                ResponsiveContainer füllt damit exakt die vom Flex-Layout
                zugewiesene Höhe dieses Wrappers (flex:1, minHeight:0 —
                dieselbe Technik wie bei den handgebauten SVG-Charts, siehe
                LiveChart), statt am App-Default (220px) hängenzubleiben und
                darunter leeren Raum in der Karte zu lassen. */}
            <div style={{ flex: 1, minHeight: 0, marginTop: '14px' }}>
              <DepotChart chartTab={chartTab as ChartTab} history={DEPOT_HISTORY_RC} height="100%" />
            </div>
          </TiltCard>
          <TiltCard className="mock-bookings" style={{ flex: '1 1 0%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <DepotTxTable />
          </TiltCard>
        </div>
      </div>
    </>
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
        tiles={[
          {
            label: 'Portfolio-Wert',
            value: (
              <PulseValue value={lastPortfolioValue} baseColor={AU.cardFg}>
                {fmtEurPlain(lastPortfolioValue)}
              </PulseValue>
            ),
          },
          {
            label: '24h Änderung',
            value: (
              <PulseValue value={btc.deltaPct} baseColor={up ? AU.positive : AU.destructive}>
                {`${up ? '+' : '−'}${Math.abs(btc.deltaPct).toFixed(1).replace('.', ',')} %`}
              </PulseValue>
            ),
            valueColor: up ? AU.positive : AU.destructive,
          },
          { label: 'Größte Position', value: `${CURRENT_ALLOCATION[0].label} · ${CURRENT_ALLOCATION[0].pct} %` },
          {
            label: 'Live-Kurs',
            value: (
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Dot size={16} strokeWidth={5} color={AU.positive} className="mock-live-dot" />
                {fmtPrice(btc.price)} €
              </span>
            ),
            sub: btc.sym,
          },
        ]}
      />
      {/* Echte recharts-Komponente aus dem eingeloggten Crypto-Portfolio
          (siehe Import oben) statt der handgebauten LiveChart-SVG — headless
          wie DepotChart (kein eigenes Card-Chrome), deshalb weiterhin in
          TiltCard mit eigenem CardLabel als Titel.
          `color: AU.cardFg` explizit gesetzt: PortfolioAreaChart stylt seine
          Achsen-Ticks über `fill: 'currentColor'` (siehe Komponente) — ohne
          einen ererbten hellen `color`-Wert an dieser Stelle greift stattdessen
          die Fließtextfarbe der (hellen, cremefarbenen) Landingpage außerhalb
          dieses dunklen Mockups, macht die Beschriftung auf dunklem Grund
          quasi unsichtbar (siehe Screenshot im Chat). */}
      <TiltCard style={{ flex: '1 1 0%', minHeight: 0, display: 'flex', flexDirection: 'column', padding: 'clamp(18px, 2vw, 26px)', color: AU.cardFg }}>
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
        className="mock-charts"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 'clamp(10px, 1.2vw, 16px)', flex: '1.5 1 0%', minHeight: 0 }}
      >
        <div style={{ minHeight: 0, overflowY: 'auto', color: AU.cardFg }}>
          <DonutCard
            title="Aktuelle Verteilung"
            subtitle={`${currentAllocationTotal.toLocaleString('de-DE')} €`}
            data={CURRENT_ALLOCATION_ENTRIES}
            height={210}
          />
        </div>
        <div style={{ minHeight: 0, overflowY: 'auto', color: AU.cardFg }}>
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
  const active = MOCK_VIEWS[Math.max(view, 0)]?.nav ?? 'Dashboard'
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
      // data-theme="aurum": DashboardMock liegt außerhalb des normalen
      // [data-theme]-Scopes (siehe landing-tokens.ts) — die eigenen
      // AU-Inline-Styles brauchten das bisher nicht. Für den recharts-Pilot
      // (siehe DepotChart) UND die echten Dashboard-/Crypto-Komponenten,
      // die jetzt hier mitgerendert werden (IncomeExpenseChart,
      // PortfolioAreaChart, DonutCard), ist es Pflicht: die nutzen
      // Tailwind-Klassen wie bg-card/border-border/text-muted-foreground,
      // die erst über dieses Attribut die Aurum- statt der Default-Light-
      // Palette bekommen.
      data-theme="aurum"
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: AU.bg,
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
          backgroundColor: AU.sidebar,
          borderRight: `1px solid ${AU.sidebarBorder}`,
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
            borderBottom: `1px solid ${AU.sidebarBorder}`,
          }}
        >
          <Logo variant="transparent" size={22} />
          <span style={{ fontFamily: F.display, fontSize: '15px', color: AU.sidebarAccentFg, whiteSpace: 'nowrap' }}>
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
                    color: isActive ? AU.bg : AU.sidebarFg,
                    backgroundColor: isActive ? AU.gold : isHovered ? 'rgba(205,165,100,.07)' : 'transparent',
                    fontWeight: isActive ? 500 : 400,
                    transition: 'background-color .35s ease, color .35s ease',
                  }}
                >
                  <Icon
                    size={15}
                    strokeWidth={1.6}
                    style={{ flexShrink: 0, color: isActive ? AU.bg : 'currentColor', transition: 'color .35s ease' }}
                  />
                  {label}
                </div>

                {/*
                  Immer gemountet (nicht nur bei isActive) — nur so kann die
                  CSS-Grid-Höhe beim Auf- UND Zuklappen animieren, dieselbe
                  Technik wie .subnav-container in der echten Sidebar (siehe
                  globals.css), hier unter eigenem Namen, damit sich Landing-
                  und App-Stylesheet nicht überschneiden.
                */}
                {children && (
                  <div className={`mock-subnav-container${isActive ? ' open' : ''}`}>
                    <div className="mock-subnav-inner">
                      {children.map((child, ci) => (
                        <div
                          key={child}
                          className="mock-subnav-item"
                          style={{
                            color: ci === 0 ? AU.sidebarAccentFg : AU.mutedFg,
                            backgroundColor: ci === 0 ? AU.sidebarAccent : 'transparent',
                            fontWeight: ci === 0 ? 500 : 400,
                          }}
                        >
                          {child}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Fußbereich: Konto → Einstellungen, wie im echten Dashboard */}
        <div style={{ borderTop: `1px solid ${AU.sidebarBorder}`, padding: '10px 8px', flexShrink: 0 }}>
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
                border: `1px solid ${AU.sidebarBorder}`,
              }}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 500, color: AU.sidebarAccentFg, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Eric Schuck
              </p>
              <p style={{ margin: 0, fontSize: '11px', color: AU.mutedFg, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
            : view === 2 ? <DepotView />
            : view === 3 ? <CryptoView visible={visible} />
            : <DashboardView run={run} />}
        </div>
      </div>
    </div>
  )
}
