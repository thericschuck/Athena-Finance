import { C, F } from '@/components/landing/landing-tokens'
import { hashNoise } from '@/components/landing/shared/hash-noise'

/* 01 — Ausgaben-Heatmap im GitHub-Stil, mit GuV-Modus. Divergierende Skala:
   Terrakotta für Verlust-, Olive für Gewinntage, neutral für ruhige Tage. */
const GUV_COLS = 18
const GUV_ROWS = 7
const GUV_NEG = ['#3A231B', '#6B3427', '#8E4634', '#A9553C']
const GUV_POS = ['#2C3826', '#41522F', '#5B6E4B', '#8CA277']
const GUV_ZERO = '#232320'
const GUV_CELLS = Array.from({ length: GUV_COLS * GUV_ROWS }, (_, i) => {
  const w = hashNoise(i) * 4
  return Math.max(-4, Math.min(4, Math.round(w)))
})
function guvColor(v: number) {
  if (v === 0) return GUV_ZERO
  return v < 0 ? GUV_NEG[Math.min(3, -v - 1)] : GUV_POS[Math.min(3, v - 1)]
}

export function CardHeatmap() {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${GUV_COLS}, 1fr)`, gap: '3px' }}>
        {GUV_CELLS.map((v, i) => (
          <div key={i} style={{ aspectRatio: '1 / 1', borderRadius: '2px', backgroundColor: guvColor(v) }} />
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '20px' }}>
        <span style={{ fontSize: '10px', color: C.onSubtle }}>Verlust</span>
        <div style={{ display: 'flex', gap: '3px' }}>
          {[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((v) => (
            <span
              key={v}
              style={{ width: '11px', height: '11px', borderRadius: '2px', backgroundColor: guvColor(v) }}
            />
          ))}
        </div>
        <span style={{ fontSize: '10px', color: C.onSubtle }}>Gewinn</span>
      </div>
    </div>
  )
}

/*
 * 02 — Sankey, dreispaltig: zwei Einkommensquellen links münden in einen
 * gemeinsamen "Einnahmen"-Knoten in der Mitte, von dem aus sich das Geld auf
 * fünf Verwendungen rechts verteilt. Die Eintritts- und Austrittsreihenfolge
 * am Mittelknoten sind bewusst UNABHÄNGIG voneinander (Quellen-Reihenfolge
 * links, Ziel-Reihenfolge rechts) — genau das erzeugt die für Sankeys
 * typische "Durchmischung" im Knoten, statt dass jede Quelle sichtbar direkt
 * mit einem Ziel verbunden bliebe.
 *
 * Beide Seiten müssen auf dieselbe Summe kommen (4.750), sonst verzerrt sich
 * der Maßstab zwischen Ein- und Ausgang.
 */
const SANKEY_SOURCES = [
  { label: 'Gehalt', val: 3800, color: C.oliveLight },
  { label: 'Freelance', val: 950, color: C.gold },
]
const SANKEY_TARGETS = [
  { label: 'Sparen', val: 2570, color: C.oliveLight },
  { label: 'Wohnen', val: 1200, color: C.terracotta },
  { label: 'Lebensmittel', val: 480, color: '#B9694F' },
  { label: 'Mobilität', val: 320, color: '#C4816A' },
  { label: 'Freizeit', val: 180, color: '#CE9A85' },
]
const SANKEY_TOTAL = SANKEY_SOURCES.reduce((s, x) => s + x.val, 0)
const SANKEY_H = 210
const SANKEY_NODE_W = 8
// Genug Abstand von den Rändern für die links rechtsbündigen bzw. rechts
// linksbündigen Beschriftungen ("Lebensmittel" ist das längste Wort).
const SANKEY_LEFT_X = 78
const SANKEY_MID_X = 230
const SANKEY_RIGHT_X = 395
const SANKEY_VIEWBOX_W = 500

/** Stapelt Segmente MIT Lücke dazwischen — für die sichtbaren Knoten-Balken. */
function sankeyStack<T extends { val: number }>(items: T[], gap: number) {
  let y = 0
  return items.map((it) => {
    const h = (it.val / SANKEY_TOTAL) * (SANKEY_H - gap * (items.length - 1))
    const seg = { ...it, y0: y, h }
    y += h + gap
    return seg
  })
}
/** Dieselben Segmente OHNE Lücke — für die Ribbon-Anschlusspunkte am
    Mittelknoten, der als eine durchgehende Fläche gezeichnet wird. */
function sankeyCumulative<T extends { val: number }>(items: T[]) {
  let y = 0
  return items.map((it) => {
    const h = (it.val / SANKEY_TOTAL) * SANKEY_H
    const seg = { ...it, y0: y, h }
    y += h
    return seg
  })
}
const SANKEY_LEFT = sankeyStack(SANKEY_SOURCES, 8)
const SANKEY_RIGHT = sankeyStack(SANKEY_TARGETS, 6)
const SANKEY_MID_IN = sankeyCumulative(SANKEY_SOURCES)
const SANKEY_MID_OUT = sankeyCumulative(SANKEY_TARGETS)

/** Sanfte S-Kurve zwischen zwei Spalten — gemeinsame Kontrollpunkte in der
    Mitte statt fester Absolutwerte, bleibt so auch bei Layout-Änderungen
    symmetrisch. */
function sankeyRibbon(x0: number, y0Top: number, y0Bot: number, x1: number, y1Top: number, y1Bot: number) {
  const cx = (x0 + x1) / 2
  return `M${x0} ${y0Top} C${cx} ${y0Top}, ${cx} ${y1Top}, ${x1} ${y1Top} L${x1} ${y1Bot} C${cx} ${y1Bot}, ${cx} ${y0Bot}, ${x0} ${y0Bot} Z`
}

export function CardSankey() {
  return (
    <svg viewBox={`0 0 ${SANKEY_VIEWBOX_W} ${SANKEY_H + 30}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        {/* Verlauf statt flacher Einheitsfarbe je Band: von der Quellfarbe am
            linken Ende zu Gold am Mittelknoten (und umgekehrt rechts) — genau
            dieser Farbübergang unterscheidet ein "fließendes" Sankey-Band von
            einem massiven, einheitlich gefüllten Balken. */}
        {SANKEY_LEFT.map((s, i) => (
          <linearGradient key={`gl${i}`} id={`sankey-l${i}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={s.color} stopOpacity={0.5} />
            <stop offset="100%" stopColor={C.gold} stopOpacity={0.32} />
          </linearGradient>
        ))}
        {SANKEY_RIGHT.map((t, i) => (
          <linearGradient key={`gr${i}`} id={`sankey-r${i}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={C.gold} stopOpacity={0.32} />
            <stop offset="100%" stopColor={t.color} stopOpacity={0.5} />
          </linearGradient>
        ))}
      </defs>
      <g transform="translate(0, 14)">
        {/* Bänder zuerst, darüber die Knoten — sonst läge die Kante der
            Knoten-Balken unter der halbtransparenten Bandfläche. Kein Rand
            mehr: die harte Kontur war es, die aus dem fließenden Band einen
            massiven Block gemacht hat — der Farbverlauf allein trägt jetzt
            die Form. */}
        {SANKEY_LEFT.map((s, i) => (
          <path
            key={s.label}
            d={sankeyRibbon(
              SANKEY_LEFT_X + SANKEY_NODE_W,
              s.y0,
              s.y0 + s.h,
              SANKEY_MID_X,
              SANKEY_MID_IN[i].y0,
              SANKEY_MID_IN[i].y0 + SANKEY_MID_IN[i].h
            )}
            fill={`url(#sankey-l${i})`}
          />
        ))}
        {SANKEY_RIGHT.map((t, i) => (
          <path
            key={t.label}
            d={sankeyRibbon(
              SANKEY_MID_X + SANKEY_NODE_W,
              SANKEY_MID_OUT[i].y0,
              SANKEY_MID_OUT[i].y0 + SANKEY_MID_OUT[i].h,
              SANKEY_RIGHT_X,
              t.y0,
              t.y0 + t.h
            )}
            fill={`url(#sankey-r${i})`}
          />
        ))}

        {/* Mittelknoten: eine durchgehende Fläche statt einzelner Segmente —
            zeigt, dass sich das Geld dort zu einem gemeinsamen Topf mischt,
            bevor es sich neu aufteilt. Volle Kapsel-Rundung (rx = halbe
            Breite) statt der früheren 2px-Ecke — passt zu den weichen
            Bandverläufen, statt wie ein Balken daraus herauszustechen. */}
        <rect x={SANKEY_MID_X} y={0} width={SANKEY_NODE_W} height={SANKEY_H} fill={C.gold} rx={SANKEY_NODE_W / 2} />
        <text
          x={SANKEY_MID_X + SANKEY_NODE_W + 10}
          y={SANKEY_H / 2 - 5}
          fill={C.onCream}
          fontSize={10}
          fontFamily="system-ui, sans-serif"
          letterSpacing="0.04em"
        >
          Einnahmen
        </text>
        <text
          x={SANKEY_MID_X + SANKEY_NODE_W + 10}
          y={SANKEY_H / 2 + 11}
          fill={C.gold}
          fontSize={11}
          fontFamily={F.mono}
        >
          {SANKEY_TOTAL.toLocaleString('de-DE')} €
        </text>

        {SANKEY_LEFT.map((s) => (
          <g key={s.label}>
            <rect x={SANKEY_LEFT_X} y={s.y0} width={SANKEY_NODE_W} height={s.h} fill={s.color} rx={SANKEY_NODE_W / 2} />
            <text
              x={SANKEY_LEFT_X - 10}
              y={s.y0 + s.h / 2 + 3}
              textAnchor="end"
              fill={C.onBody}
              fontSize={9.5}
              fontFamily="system-ui, sans-serif"
              letterSpacing="0.02em"
            >
              {s.label}
            </text>
          </g>
        ))}

        {SANKEY_RIGHT.map((t) => (
          <g key={t.label}>
            <rect x={SANKEY_RIGHT_X} y={t.y0} width={SANKEY_NODE_W} height={t.h} fill={t.color} rx={SANKEY_NODE_W / 2} />
            <text
              x={SANKEY_RIGHT_X + SANKEY_NODE_W + 10}
              y={t.y0 + t.h / 2 + 3}
              fill={C.onBody}
              fontSize={9.5}
              fontFamily="system-ui, sans-serif"
              letterSpacing="0.02em"
            >
              {t.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  )
}

/* 03 — Cashflow-Kalender: Monatsraster, Tagesfarbe nach Nettosaldo, plus das
   Popup, das im Produkt direkt am Tag aufgeht. */
const CAL_LEAD_BLANKS = 2
const CAL_POPUP_DAY = 17
const CAL_NET = Array.from({ length: 31 }, (_, i) => {
  return Math.round(hashNoise(i) * 90)
})
function calColor(v: number) {
  const a = (0.16 + Math.min(1, Math.abs(v) / 90) * 0.56).toFixed(2)
  if (v > 12) return `rgba(140,162,119,${a})`
  if (v < -12) return `rgba(169,85,60,${a})`
  return 'rgba(232,224,208,.06)'
}

export function CardCalendar() {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '6px' }}>
        {['M', 'D', 'M', 'D', 'F', 'S', 'S'].map((d, i) => (
          <span key={i} style={{ fontSize: '9px', color: C.onSubtle, textAlign: 'center' }}>
            {d}
          </span>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
        {Array.from({ length: CAL_LEAD_BLANKS }, (_, i) => (
          <span key={`b${i}`} />
        ))}
        {CAL_NET.map((v, i) => {
          const day = i + 1
          const isPopup = day === CAL_POPUP_DAY
          return (
            <div
              key={day}
              style={{
                position: 'relative',
                aspectRatio: '1.45 / 1',
                borderRadius: '2px',
                backgroundColor: calColor(v),
                border: isPopup ? `1px solid ${C.gold}` : '1px solid transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '9px',
                color: C.onBody,
              }}
            >
              {day}
              {isPopup && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 9px)',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    padding: '7px 11px',
                    borderRadius: '4px',
                    backgroundColor: C.onyxLift,
                    border: `1px solid ${C.ruleOn}`,
                    boxShadow: '0 12px 26px -12px rgba(0,0,0,.7)',
                    whiteSpace: 'nowrap',
                    textAlign: 'center',
                    lineHeight: 1.5,
                  }}
                >
                  <span style={{ display: 'block', fontSize: '9px', color: C.onSubtle }}>17. März</span>
                  <span style={{ display: 'block', fontFamily: F.mono, fontSize: '11px', color: C.terracotta }}>
                    −84,20 €
                  </span>
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
