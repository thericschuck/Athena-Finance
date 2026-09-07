import type { Metadata } from 'next'
import { C, F } from '@/components/landing/landing-tokens'

export const metadata: Metadata = {
  title: 'Impressum',
  /*
   * Nicht in den Index — als Suchtreffer taugen die beiden nichts. Aber
   * `follow: true`: die Seiten verlinken zurück auf die Startseite, und mit
   * `follow: false` würde eine Suchmaschine diesen Links nicht folgen und die
   * Verknüpfung zwischen den Seiten der Domain bliebe unvollständig.
   */
  robots: { index: false, follow: true },
}

/**
 * Entwurf — die Anschrift fehlt noch (siehe Hinweis unten). Ohne sie erfüllt
 * diese Seite § 5 DDG nicht; das MUSS ergänzt werden, bevor die Domain aktiv
 * beworben oder für die Öffentlichkeit freigegeben wird.
 */
export default function ImpressumPage() {
  return (
    <div
      style={{
        background: C.parchment,
        color: C.ink,
        fontFamily: F.serif,
        minHeight: '100vh',
        padding: '64px clamp(20px, 6vw, 64px)',
      }}
    >
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <p
          style={{
            fontFamily: F.sans,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: C.terracotta,
            marginBottom: 12,
          }}
        >
          Entwurf — Anschrift fehlt noch
        </p>
        <h1 style={{ fontFamily: F.display, fontSize: 'clamp(28px, 4vw, 38px)', margin: 0 }}>
          Impressum
        </h1>

        <section style={{ marginTop: 36 }}>
          <h2 style={{ fontFamily: F.sans, fontSize: 16, fontWeight: 600 }}>Angaben gemäß § 5 DDG</h2>
          <p style={{ fontSize: 15, lineHeight: 1.8, color: C.inkBody }}>
            Eric Schuck
            <br />
            Anschrift: wird ergänzt
            <br />
            E-Mail: eric@athena-finance.de
          </p>
        </section>

        <section style={{ marginTop: 28 }}>
          <p style={{ fontSize: 13, lineHeight: 1.7, color: C.inkFaint }}>
            Diese Seite ist ein Platzhalter für den Prototyp-Betrieb und noch nicht
            vollständig — eine ladungsfähige Anschrift fehlt. Vor öffentlichem Betrieb muss
            sie ergänzt werden.
          </p>
        </section>
      </div>
    </div>
  )
}
