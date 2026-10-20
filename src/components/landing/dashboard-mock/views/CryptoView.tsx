'use client'

import dynamic from 'next/dynamic'
import { Dot } from 'lucide-react'
import { APP } from '@/components/landing/landing-tokens'
import {
  CRYPTO_ASSETS,
  CRYPTO_CHART_DATA,
  CURRENT_ALLOCATION,
  CURRENT_ALLOCATION_ENTRIES,
  PORTFOLIO_HISTORY,
  TARGET_ALLOCATION_ENTRIES,
  TICKER_BASE,
  currentAllocationTotal,
  cryptoXFormatter,
  fmtEurPlain,
  fmtPrice,
  targetAllocationTotal,
} from '@/components/landing/dashboard-mock/mock-data'
import { useLiveTicker } from '@/components/landing/dashboard-mock/mock-hooks'
import { AssetsList, PulseValue, StatTilesRow, TiltCard } from '@/components/landing/dashboard-mock/mock-primitives'
import { CardLabel } from '@/components/landing/dashboard-mock/mock-static'

const PortfolioAreaChart = dynamic(
  () => import('@/components/crypto/portfolio-area-chart').then((m) => m.PortfolioAreaChart),
  { ssr: false },
)
const DonutCard = dynamic(
  () => import('@/components/crypto/portfolio-donut-card').then((m) => m.DonutCard),
  { ssr: false },
)

/** Crypto-Szene — an das Figma-Mockup „Crypto — Portfolio" angeglichen: vier
    Stat-Kacheln, der Portfolio-Wert-Verlauf, darunter „Aktuelle Verteilung"
    und „Ziel-Verteilung" als Ringe plus eine Assets-Liste — genau die drei
    Karten aus dem Mockup, statt der früheren Kurszeilen-Reihe (TickerBanner/
    MiniTicker sind raus, der Rebalancing-Gedanke passt besser zur „24/7
    Echtzeitdaten"-Kennzahl, mit der diese Szene ohnehin schon verknüpft ist,
    siehe STATS in LandingClient). PulseValue bleibt für die Portfolio-Wert-
    Kachel — der „Live-Tick"-Blitzeffekt ist die einzige Stelle, an der diese
    Szene noch sichtbar in Echtzeit lebt. */
export function CryptoView({ visible }: { visible: boolean }) {
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
