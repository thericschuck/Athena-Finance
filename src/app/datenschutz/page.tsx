import type { Metadata } from 'next'
import { C, F } from '@/components/landing/landing-tokens'

export const metadata: Metadata = {
  title: 'Datenschutzerklärung',
  /*
   * Nicht in den Index — als Suchtreffer taugen die beiden nichts. Aber
   * `follow: true`: die Seiten verlinken zurück auf die Startseite, und mit
   * `follow: false` würde eine Suchmaschine diesen Links nicht folgen und die
   * Verknüpfung zwischen den Seiten der Domain bliebe unvollständig.
   */
  robots: { index: false, follow: true },
}

/**
 * Entwurf, bewusst schmal gehalten: beschreibt nur, was diese Domain aktuell
 * tatsächlich tut (die Interesse-Liste unter /interesse) — kein generisches
 * Rundum-Template für Funktionen, die es noch nicht gibt. Vor echtem Live-
 * Betrieb mit Zugang für Dritte muss das erweitert und von einem/einer
 * Fachanwält:in für Datenschutzrecht geprüft werden.
 */
export default function DatenschutzPage() {
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
          Entwurf — noch nicht final geprüft
        </p>
        <h1 style={{ fontFamily: F.display, fontSize: 'clamp(28px, 4vw, 38px)', margin: 0 }}>
          Datenschutzerklärung
        </h1>

        <section style={{ marginTop: 36 }}>
          <h2 style={{ fontFamily: F.sans, fontSize: 16, fontWeight: 600 }}>Verantwortlicher</h2>
          <p style={{ fontSize: 15, lineHeight: 1.8, color: C.inkBody }}>
            Eric Schuck · Kontakt: eric@athena-finance.de
          </p>
        </section>

        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontFamily: F.sans, fontSize: 16, fontWeight: 600 }}>
            Was auf der Interesse-Seite (/interesse) passiert
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.8, color: C.inkBody }}>
            Trägst du dich dort ein, speichern wir deine E-Mail-Adresse, den Zeitpunkt der
            Eintragung und die Tatsache, dass du der Benachrichtigung per Checkbox aktiv
            zugestimmt hast. Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a
            DSGVO). Die Daten liegen bei Supabase (Hosting in der EU) und werden nicht an
            Dritte weitergegeben oder für Werbung außerhalb dieses einen Zwecks genutzt.
          </p>
          <p style={{ fontSize: 15, lineHeight: 1.8, color: C.inkBody, marginTop: 12 }}>
            Wir nutzen die Adresse ausschließlich, um dich einmalig zu benachrichtigen,
            falls sich am Zugang zu athena-finance etwas ändert — kein laufender
            Newsletter. Die Daten bleiben gespeichert, bis du der Nutzung widersprichst
            oder um Löschung bittest.
          </p>
        </section>

        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontFamily: F.sans, fontSize: 16, fontWeight: 600 }}>Deine Rechte</h2>
          <p style={{ fontSize: 15, lineHeight: 1.8, color: C.inkBody }}>
            Du hast jederzeit das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung
            der Verarbeitung, Datenübertragbarkeit und Widerspruch (Art. 15–21 DSGVO).
            Schreib dafür einfach an die oben genannte Adresse. Außerdem kannst du dich bei
            einer Datenschutz-Aufsichtsbehörde beschweren.
          </p>
        </section>

        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontFamily: F.sans, fontSize: 16, fontWeight: 600 }}>Keine Analyse, keine Cookies</h2>
          <p style={{ fontSize: 15, lineHeight: 1.8, color: C.inkBody }}>
            Diese Seite bindet keine Analyse- oder Tracking-Dienste ein und setzt keine
            Cookies außer den technisch notwendigen der Formular-Übermittlung.
          </p>
        </section>
      </div>
    </div>
  )
}
