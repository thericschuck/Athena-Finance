import { TrendingUp, BarChart2, FileText, Target, Globe, CandlestickChart, Landmark, ShoppingCart } from 'lucide-react'
import { C, F, SPACE, kicker } from '@/components/landing/landing-tokens'
import { OliveVines } from '@/components/landing/olive-vines'
import { InstrumentariumVines } from '@/components/landing/islands/InstrumentariumVines'
import { Reveal } from '@/components/landing/islands/Reveal'
import { SectionHead } from '@/components/landing/shared/editorial'
import { MiniDonut, MiniHeatmap, MiniSparkline, MiniStrategy } from '@/components/landing/shared/mini-visuals'

// ── Inhalt ────────────────────────────────────────────────────────────────────

type Feature = {
  title: string
  desc: string
  icon: React.ReactNode
  tags: string[]
  wide?: boolean
  visual?: React.ReactNode
}

/*
 * Reihenfolge erzeugt einen Zickzack: breit/schmal — schmal/breit — breit/schmal
 * — schmal/breit. Die breite Karte wechselt so von Reihe zu Reihe die Seite,
 * statt eine starre Spalte zu bilden. Bei `grid-auto-flow: row` ergibt sich das
 * allein aus der Sequenz, ohne explizite Spaltenzuweisung.
 *
 * Das Verhältnis muss aufgehen: vier `wide`-Karten (2 Spalten) plus vier
 * schmale sind genau 12 Zellen und damit im dreispaltigen Raster vier
 * lückenlose Reihen. Stimmt es nicht, bleibt eine Zelle leer und die
 * Rasterlinien zeigen ein Loch.
 */
const FEATURES: Feature[] = [
  {
    title: 'Ausgaben-Analyse',
    desc: 'Heatmap, GuV-Chart und Cashflow-Kalender — alle aus echten Transaktionsdaten berechnet.',
    icon: <BarChart2 size={17} strokeWidth={1.6} />,
    tags: ['Heatmap', 'GuV', 'Kalender'],
    wide: true,
    visual: <MiniHeatmap cols={12} cell={14} />,
  },
  {
    title: 'Vertrags-Management',
    desc: 'Alle Abos und Daueraufträge im Blick. Wiederkehrende Zahlungen buchen sich selbst.',
    icon: <FileText size={17} strokeWidth={1.6} />,
    tags: ['Abos', 'Daueraufträge'],
  },
  {
    title: 'Sparziele & Pläne',
    desc: 'Ziele definieren, Fortschritt verfolgen, Sparpläne automatisieren.',
    icon: <Target size={17} strokeWidth={1.6} />,
    tags: ['Ziele', 'Sparpläne'],
  },
  {
    title: 'Portfolio-Tracking',
    desc: 'Depot und Crypto in einer Ansicht, mit Kurs-Updates und Rebalancing-Vorschlägen.',
    icon: <TrendingUp size={17} strokeWidth={1.6} />,
    tags: ['Depot', 'Crypto', 'Kurse'],
    wide: true,
    visual: <MiniDonut />,
  },
  {
    title: 'Strategie & Backtesting',
    desc: 'TPI-Analyse, eigene Indikatoren und vollautomatisierte Backtests für fundierte Entscheidungen.',
    icon: <CandlestickChart size={17} strokeWidth={1.6} />,
    tags: ['TPI', 'Indikatoren', 'Backtest'],
    wide: true,
    visual: <MiniStrategy />,
  },
  {
    title: 'Multi-Währung',
    desc: 'EUR, USD, CHF — automatische Umrechnung mit Echtzeit-Kursen.',
    icon: <Globe size={17} strokeWidth={1.6} />,
    tags: ['EUR', 'USD', 'CHF'],
  },
  {
    title: 'Banking-Sync',
    desc: 'FinTS-Anbindung für den automatischen Kontoimport direkt aus der Bank.',
    icon: <Landmark size={17} strokeWidth={1.6} />,
    tags: ['FinTS', 'HBCI'],
  },
  {
    title: 'Fixkosten',
    desc: 'Berechnet das nötige Mindestgehalt auf Basis realer Lebenshaltungskosten.',
    icon: <ShoppingCart size={17} strokeWidth={1.6} />,
    tags: ['Budget', 'Kalkulation'],
    wide: true,
    visual: <MiniSparkline />,
  },
]

/** Breite der Ranken — siehe Kommentar an InstrumentariumVines (Seitenverhältnis 900/520). */
const VINES_WIDTH = 'clamp(130px, 28vw, 500px)'

/** I · Instrumentarium. Komplett statisch; nur die Reveals und die Ranken-Mounts sind Inseln. */
export function InstrumentariumSection() {
  const vines = <OliveVines tone="light" opacity={0.42} width={VINES_WIDTH} static />
  return (
    <section id="features" style={{ padding: `${SPACE.section} ${SPACE.gutter}`, position: 'relative' }}>
      {/* Liegt per z-index VOR dem Inhalt (siehe zIndex:2 dort, gegen
          zIndex:1 hier) — die Ranken sollen sichtbar über die Kartenkanten
          ragen, siehe Kommentar an InstrumentariumVines. Zwei Instanzen
          (oben/unten) statt einer über die volle Sektion gestreckten. */}
      <InstrumentariumVines dock="top">{vines}</InstrumentariumVines>
      <InstrumentariumVines dock="bottom">{vines}</InstrumentariumVines>
      <div style={{ maxWidth: '1160px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        {/* data-section-marker: Fixpunkt für SectionProgressBar (siehe dort) — kein eigenes Styling. */}
        <div data-section-marker="I">
          <Reveal>
            <SectionHead
              index="I"
              label="Das Instrumentarium"
              title="Jede Dimension deiner Finanzen."
              emphasis="Lückenlos erfasst."
              lead="Acht Module, die aus Rohdaten Entscheidungsgrundlagen machen — von der einzelnen Buchung bis zur Portfolio-Allokation."
            />
          </Reveal>
        </div>

        <div
          className="g-feat"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1px',
            backgroundColor: C.rule,
            border: `1px solid ${C.rule}`,
            marginTop: 'clamp(44px, 6vw, 72px)',
          }}
        >
          {FEATURES.map((f, i) => (
            // Genau 2 Karten pro Reihe (wide+schmal wechselt sich zeilenweise
            // ab, siehe FEATURES-Kommentar) — gerader Index fliegt von links,
            // ungerader von rechts ein, passend zur eigenen Spaltenposition.
            // once={false} (Abweichung vom Reveal-Standard, siehe Kommentar
            // dort): bei diesem großen seitlichen Versatz soll die Karte beim
            // Zurückscrollen sichtbar wieder aus dem Bild fliegen statt nur
            // formlos zu verschwinden.
            <Reveal
              key={f.title}
              delay={(i % 2) * 0.08}
              x={i % 2 === 0 ? '-100vw' : '100vw'}
              y={0}
              once={false}
              className={f.wide ? 'feat-wide' : undefined}
              style={{ gridColumn: f.wide ? 'span 2' : undefined }}
            >
              <article
                className="af-card"
                style={{
                  height: '100%',
                  padding: 'clamp(22px, 2.4vw, 30px)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  border: '1px solid transparent',
                  backgroundColor: C.parchment,
                }}
              >
                <span
                  style={{
                    width: '38px',
                    height: '38px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: `1px solid ${C.rule}`,
                    color: C.goldInk,
                    flexShrink: 0,
                  }}
                >
                  {f.icon}
                </span>

                <div>
                  <h3
                    style={{
                      fontFamily: F.display,
                      fontSize: '21px',
                      fontWeight: 500,
                      color: C.ink,
                      margin: '0 0 8px',
                      letterSpacing: '-0.005em',
                    }}
                  >
                    {f.title}
                  </h3>
                  <p
                    className="feat-desc"
                    style={{ fontFamily: F.serif, fontSize: '14px', lineHeight: 1.75, color: C.inkBody, margin: 0 }}
                  >
                    {f.desc}
                  </p>
                </div>

                {f.visual && <div style={{ marginTop: 'auto', paddingTop: '10px' }}>{f.visual}</div>}

                <div
                  style={{
                    marginTop: f.visual ? '4px' : 'auto',
                    paddingTop: '14px',
                    borderTop: `1px solid ${C.ruleSoft}`,
                    display: 'flex',
                    gap: '14px',
                    flexWrap: 'wrap',
                  }}
                >
                  {f.tags.map((tag) => (
                    <span key={tag} className="feat-tag af-micro" style={{ ...kicker, fontSize: '9px', color: C.inkSubtle }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
