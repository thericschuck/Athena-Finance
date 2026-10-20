import { ShieldCheck, Wallet, TrendingUp } from 'lucide-react'
import { C, F, SPACE } from '@/components/landing/landing-tokens'
import { ExtrasJumpButton } from '@/components/landing/islands/ExtrasJumpButton'
import { Reveal } from '@/components/landing/islands/Reveal'
import { SectionHead } from '@/components/landing/shared/editorial'

const STEPS = [
  {
    num: 'I',
    icon: <ShieldCheck size={20} strokeWidth={1.5} />,
    title: 'Anmelden',
    desc: 'Zugang mit E-Mail und Passwort. Jeder Datensatz bleibt an das eigene Konto gebunden.',
  },
  {
    num: 'II',
    icon: <Wallet size={20} strokeWidth={1.5} />,
    title: 'Daten einrichten',
    desc: 'Konten, Transaktionen, Verträge und Portfolios nach eigenem Bedarf konfigurieren.',
  },
  {
    num: 'III',
    icon: <TrendingUp size={20} strokeWidth={1.5} />,
    title: 'Überblick behalten',
    desc: 'Alle Finanzdaten in einem übersichtlichen Dashboard — jederzeit, von überall.',
  },
]

/* ══ IV · DER WEG — erster Halt der Vorhang-Kette (siehe .overlap-*
    in landing.css): bleibt stehen, während „Weitere Eigenschaften"
    darüber hinwegzieht ══ */
/* data-section-marker sitzt hier auf der SZENE, nicht auf dem
    Überschrift-Div: der Inhalt steht innerhalb von .overlap-sticky
    per flex/align-items:center vertikal zentriert, sein `top` bleibt
    also während der ganzen Klebedauer auf einem konstanten Offset
    stehen (oft > REVEAL_LINE in SectionProgressBar) und überschreitet
    die Schwelle nie — die Leiste bliebe fälschlich auf der vorigen
    Sektion stehen. Die Szene selbst ist normaler Fluss und wandert
    stetig, genau wie bei „III · Die Analyse" (.analyse-scene). */
export function WegSection() {
  return (
    <div className="overlap-scene" data-section-marker="IV">
      <div className="overlap-sticky" style={{ zIndex: 1 }}>
        <section
          style={{
            width: '100%',
            padding: `${SPACE.section} ${SPACE.gutter}`,
            borderTop: `1px solid ${C.rule}`,
            backgroundColor: 'rgba(232,224,208,.24)',
          }}
        >
          <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <div>
              <Reveal>
                <SectionHead
                  index="IV"
                  label="Der Weg"
                  title="In drei Schritten zum"
                  emphasis="vollen Überblick."
                />
              </Reveal>
            </div>

            <div
              className="g-steps"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 'clamp(28px, 4vw, 48px)',
                marginTop: 'clamp(48px, 6vw, 76px)',
                position: 'relative',
              }}
            >
              <div
                className="g-steps-line"
                aria-hidden
                style={{
                  position: 'absolute',
                  top: '27px',
                  left: '18%',
                  right: '18%',
                  height: '1px',
                  background: `linear-gradient(90deg, transparent, ${C.rule} 12%, ${C.olive} 50%, ${C.rule} 88%, transparent)`,
                  opacity: 0.6,
                }}
              />
              {STEPS.map((step, i) => (
                <Reveal key={step.num} delay={i * 0.1} style={{ textAlign: 'center', position: 'relative' }}>
                  <div
                    style={{
                      width: '54px',
                      height: '54px',
                      margin: '0 auto 22px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: C.parchment,
                      border: `1px solid ${C.rule}`,
                      color: C.goldInk,
                    }}
                  >
                    {step.icon}
                  </div>
                  <p
                    style={{
                      fontFamily: F.display,
                      fontSize: '22px',
                      lineHeight: 1,
                      color: C.goldInk,
                      margin: '0 0 12px',
                    }}
                  >
                    {step.num}
                  </p>
                  <h3 style={{ fontFamily: F.display, fontSize: '22px', fontWeight: 500, color: C.ink, margin: '0 0 10px' }}>
                    {step.title}
                  </h3>
                  <p
                    className="af-balance"
                    style={{ fontFamily: F.serif, fontSize: '14px', lineHeight: 1.75, color: C.inkBody, margin: '0 auto', maxWidth: '30ch' }}
                  >
                    {step.desc}
                  </p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Scroll-Hinweis für die Klebezeit dieser Sektion — siehe
            .overlap-cue in landing.css. Geschwister der <section>, nicht
            Kind: er soll am unteren Rand des gepinnten VIEWPORTS sitzen,
            nicht am Ende des (vertikal zentrierten, kürzeren) Inhalts.

            Beschriftung plus tippender Pfeil, wie am Fuß der
            Kennzahlen-Säule (.mock-column-next). Die erste Fassung
            übernahm die fallende Goldlinie vom Giebel — die ist auf hellem
            Grund und ohne Beschriftung zu leise für eine Stelle, an der man
            sonst denkt, die Seite hänge. */}
        <ExtrasJumpButton />
      </div>
    </div>
  )
}
