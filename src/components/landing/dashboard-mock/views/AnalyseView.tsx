'use client'

import { useMemo } from 'react'
import { APP, F } from '@/components/landing/landing-tokens'
import { CATEGORY_DATA, MONTHLY_COMPARISON, SANKEY_DATA, buildMockCashflowEvents, buildMockHeatmapData } from '@/components/landing/dashboard-mock/mock-data'
import { PeriodTabs } from '@/components/landing/dashboard-mock/mock-primitives'

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
export function AnalyseView() {
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
