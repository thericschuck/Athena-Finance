import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { WaitlistPromiseLine } from '@/components/waitlist/WaitlistForm'
import { C, F, SPACE } from '@/components/landing/landing-tokens'
import { LaurelWreath } from '@/components/landing/olive-vines'
import { Reveal } from '@/components/landing/islands/Reveal'
import { Kicker } from '@/components/landing/shared/editorial'

/* ══ ABSCHLUSS — folgt direkt im normalen Fluss auf „Weitere
    Eigenschaften", kein Vorhang mehr darüber. Braucht aber trotzdem
    position+z-index: die vorigen Sektionen sind noch sticky-positioniert
    mit eigenem z-index, und positionierte Geschwister mit z-index
    malen sich laut CSS-Stacking-Regeln IMMER über normale, nicht
    positionierte Geschwister — unabhängig von der DOM-Reihenfolge.
    Ohne das hier würde „Der Weg" (z-index 1) durch den Abschluss
    hindurchscheinen ══ */
export function WaitlistSection() {
  return (
    <section id="warteliste" style={{ position: 'relative', zIndex: 3, padding: `${SPACE.section} ${SPACE.gutter}`, backgroundColor: C.parchment }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <Reveal y={30}>
          <div
            className="portal"
            style={{
              position: 'relative',
              overflow: 'hidden',
              backgroundColor: C.onyx,
              padding: 'clamp(52px, 7vw, 88px) clamp(24px, 5vw, 64px)',
              textAlign: 'center',
            }}
          >
            {/*
              Zwei gleiche Säulen flankieren den Block wie ein Portal — ein
              Portal trägt beidseitig dieselbe Ordnung. Bewusst nicht
              gespiegelt: die Grafik hat eine gerichtete Lichtkante, gespiegelt
              käme das Licht von zwei Seiten.
              Rein dekorativ, unter 900px ausgeblendet (dort fehlt die Breite).
            */}
            {(['left', 'right'] as const).map((side) => (
              <Image
                key={side}
                src="/column-slim.svg"
                alt=""
                aria-hidden
                width={76}
                height={329}
                unoptimized
                className={`portal-column portal-${side}`}
              />
            ))}

            <div style={{ position: 'relative' }}>
              {/* Kranz als Wappen über dem Kicker — als Wasserzeichen hinter
                  dem Text kollidieren die Blätter mit den Zeilen. */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '22px' }}>
                <LaurelWreath size={78} tone="dark" opacity={0.9} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
                <Kicker rules center color={C.onSubtle} ruleColor={C.ruleOn}>
                  Der Anfang
                </Kicker>
              </div>
              <h2
                className="af-balance"
                style={{
                  fontFamily: F.display,
                  fontWeight: 400,
                  fontSize: 'clamp(27px, 4.2vw, 46px)',
                  lineHeight: 1.08,
                  letterSpacing: '-0.02em',
                  color: C.onCream,
                  margin: 0,
                }}
              >
                Klarheit über alles,
                <br />
                <em style={{ fontStyle: 'italic', color: C.gold }}>was dir gehört.</em>
              </h2>
              <p
                className="af-balance"
                style={{
                  fontFamily: F.serif,
                  fontSize: 'clamp(14px, 1.3vw, 16px)',
                  lineHeight: 1.85,
                  color: C.onBody,
                  maxWidth: '520px',
                  margin: '26px auto 34px',
                }}
              >
                Athena Finance bündelt Konten, Depots, Verträge und Strategien in einer
                einzigen Oberfläche — damit jede Entscheidung auf vollständigen Daten
                beruht. Fertig ist das nicht: Es entsteht gerade, für den eigenen
                Gebrauch. Wer den Weg dorthin mitverfolgen will, trägt sich ein.
              </p>

              {/*
                Hier stand bisher ein „Anmelden"-Knopf. Der ging für fast
                jeden ins Leere: es gibt keine offene Registrierung, das
                Projekt läuft heute für eine Person. Der Abschluss der Seite
                ist aber genau der Moment, in dem jemand alles gesehen hat —
                also steht hier die Handlung, die tatsächlich möglich ist.

                Eine Zwischenfassung hatte das Eintragefeld direkt hier
                stehen, um den Seitenwechsel zu sparen. Der Knopf ist die
                bessere Lösung: /interesse erklärt in Ruhe, worauf man sich
                einträgt (und worauf ausdrücklich nicht — kein Zugang, kein
                Datum), und dieser Abschluss bleibt ein Abschluss statt
                mitten im letzten Bild zu einem Formular zu werden. Ohne den
                Knopf war die Seite außerdem von der Startseite aus praktisch
                nur über den Fuß erreichbar.

                Die drei Zusagen stehen trotzdem schon HIER, nicht erst
                drüben: sie nehmen die Sorge weg, die jemanden vor dem Klick
                abhält, und wer sie liest, kommt entschiedener an.
              */}
              <Link href="/interesse" className="af-btn af-btn-cream">
                Am Bau teilhaben <ArrowRight size={15} strokeWidth={2} />
              </Link>
              <WaitlistPromiseLine />

              <p
                style={{
                  fontFamily: F.sans,
                  fontSize: '12.5px',
                  color: C.onSubtle,
                  margin: 'clamp(26px, 3vw, 34px) 0 0',
                }}
              >
                Du hast schon einen Zugang?{' '}
                <Link href="/login" style={{ color: C.gold, textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                  Anmelden
                </Link>
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
