import { Repeat2, ShieldCheck, Globe, Zap } from 'lucide-react'
import { C, F, SPACE } from '@/components/landing/landing-tokens'
import { ExtrasCarousel } from '@/components/landing/islands/ExtrasCarousel'
import { EXTRAS_ANCHOR_ID } from '@/components/landing/islands/ExtrasJumpButton'
import { Reveal } from '@/components/landing/islands/Reveal'

const EXTRAS = [
  { icon: <Repeat2 size={18} strokeWidth={1.5} />, title: 'Auto-Buchungen', desc: 'Wiederkehrende Verträge werden automatisch als Transaktionen gebucht.' },
  { icon: <ShieldCheck size={18} strokeWidth={1.5} />, title: 'Datenschutz', desc: 'Deine Daten bleiben deine. Keine Weitergabe, kein Tracking.' },
  { icon: <Globe size={18} strokeWidth={1.5} />, title: 'Überall verfügbar', desc: 'Vollständig responsiv — auf Desktop, Tablet und Mobil.' },
  { icon: <Zap size={18} strokeWidth={1.5} />, title: 'Echtzeitdaten', desc: 'Preise und Portfoliowerte aktualisieren sich automatisch.' },
]

/* ══ WEITERE EIGENSCHAFTEN — letzter Halt der Vorhang-Kette: zieht
    per Negativ-Margin über „Der Weg" hinweg (siehe .overlap-*-
    Kommentar in landing.css), bleibt dabei aber selbst normaler
    Fluss — kein eigenes Sticky-Pinning mehr, sonst hängt sie nach
    dem Überziehen tot in der Luft, bevor der Abschluss aufschließt.
    Der Abschluss folgt direkt danach, ohne weiteren Vorhang ══ */
export function ExtrasSection() {
  return (
    <div id={EXTRAS_ANCHOR_ID} className="overlap-cover" style={{ zIndex: 2, backgroundColor: C.parchment }}>
      <section style={{ width: '100%', padding: `clamp(56px, 7vw, 88px) ${SPACE.gutter}`, borderTop: `1px solid ${C.rule}` }}>
        <div style={{ maxWidth: '1160px', margin: '0 auto' }}>
          {/*
            Nur für Screenreader und Suchmaschinen sichtbar.
            Gestalterisch braucht dieser Streifen keine Überschrift — er ist
            der ruhige Ausklang nach vier betitelten Kapiteln. In der
            Dokumentgliederung fehlte damit aber die Ebene dazwischen: die
            vier Kacheln standen als h4 direkt unter dem h1 der Seite, ohne
            h2 und h3 dazwischen. Ein Sprung in der Ebenenfolge ist für
            Screenreader-Nutzer ein Orientierungsverlust („wo bin ich
            gelandet?"), und Suchmaschinen lesen die Gliederung als Aussage
            darüber, wie die Seite aufgebaut ist.

            Die Kacheln selbst sind jetzt h3 unter diesem h2.
          */}
          <h2 className="sr-only">Weitere Eigenschaften</h2>
          <div
            className="g-extras"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'clamp(24px, 3vw, 40px)' }}
          >
            {EXTRAS.map((f, i) => (
              <Reveal key={f.title} delay={i * 0.06}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <span style={{ color: C.oliveDeep }}>{f.icon}</span>
                  <div style={{ height: '1px', backgroundColor: C.rule }} />
                  <h3 style={{ fontFamily: F.display, fontSize: '17px', fontWeight: 500, color: C.ink, margin: 0 }}>
                    {f.title}
                  </h3>
                  <p style={{ fontFamily: F.serif, fontSize: '13px', lineHeight: 1.75, color: C.inkBody, margin: 0 }}>
                    {f.desc}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
          {/* Unter 420px läuft statt des Rasters oben ein horizontales
              Karussell (siehe .extras-carousel in landing.css und
              ExtrasCarousel-Komponente) — beide immer gemountet, per CSS
              gegeneinander ausgeblendet (siehe Chat). */}
          <ExtrasCarousel items={EXTRAS} />
        </div>
      </section>
    </div>
  )
}
