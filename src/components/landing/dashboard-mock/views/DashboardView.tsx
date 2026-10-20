'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import { ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { APP, F } from '@/components/landing/landing-tokens'
import {
  BOOKINGS,
  CRYPTO_CARD,
  FINANCE_SUMMARIES,
  MONTH_CARD,
  NET_WORTH_BUCKETS,
  NET_WORTH_PARTS,
  NET_WORTH_STAT,
  buildMockSnapshots,
} from '@/components/landing/dashboard-mock/mock-data'
import { useCountUp } from '@/components/landing/dashboard-mock/mock-hooks'
import { BookingsList, TiltCard } from '@/components/landing/dashboard-mock/mock-primitives'
import { AthenaInsightsCard, CardLabel, DeltaChip, MiniStat } from '@/components/landing/dashboard-mock/mock-static'

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

export function DashboardView({ run }: { run: boolean }) {
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
