import Link from 'next/link'
import { Logo } from '@/components/ui/logo'
import { C, F, SPACE, kicker } from '@/components/landing/landing-tokens'
import { LaurelWreath, MeanderFrieze } from '@/components/landing/olive-vines'
import { FooterSections } from '@/components/landing/islands/FooterSections'
import { SHELL } from '@/components/landing/shared/layout'

export function SiteFooter() {
  return (
    <footer style={{ borderTop: `1px solid ${C.rule}` }}>
      <MeanderFrieze id="frieze-footer" color={C.ink} opacity={0.14} />
      <div style={{ ...SHELL, padding: `clamp(40px, 6vw, 64px) ${SPACE.gutter} clamp(24px, 4vw, 36px)` }}>
        <div
          className="footer-row"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 'clamp(28px, 5vw, 56px)',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '320px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Logo variant="dark" size={26} />
              <span style={{ fontFamily: F.display, fontSize: '17px', color: C.ink }}>Athena Finance</span>
              {/* Kranz als kleiner Wappen-Akzent direkt an der Marke statt
                  als eigenständiges Element irgendwo in der Fläche — dort
                  wirkte er wie vergessenes Beiwerk statt wie ein bewusstes
                  Detail. An der Marke liest er sich als ihr Siegel. Unter
                  ~36px verschwimmen Blätter und Ranken zu einer
                  unleserlichen Schnörkellinie statt eines Kranzes — daher
                  deutlich größer als ein reines Text-Icon. */}
              <LaurelWreath size={38} tone="light" opacity={0.8} />
            </div>
            <p
              style={{
                fontFamily: F.serif,
                fontStyle: 'italic',
                fontSize: '13.5px',
                lineHeight: 1.6,
                color: C.inkBody,
                margin: 0,
              }}
            >
              Finanzen im Griff — jederzeit im Überblick.
            </p>
          </div>

          <FooterSections />

          <nav style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '10px' }}>
            <span className="af-micro" style={{ ...kicker, fontSize: '10px', color: C.inkFaint, marginBottom: '2px' }}>
              Mehr
            </span>
            <a href="mailto:info@schuck-webdesign.de" className="foot-link">
              <span className="af-quiet af-micro" style={{ ...kicker, fontSize: '11px', color: C.inkSubtle }}>
                Kontakt
              </span>
            </a>
            <Link href="/interesse" className="foot-link">
              <span className="af-quiet af-micro" style={{ ...kicker, fontSize: '11px', color: C.inkSubtle }}>
                Am Bau teilhaben
              </span>
            </Link>
            <Link href="/login" className="foot-link">
              <span className="af-quiet af-micro" style={{ ...kicker, fontSize: '11px', color: C.inkSubtle }}>
                Anmelden
              </span>
            </Link>
          </nav>
        </div>

        {/* Hinweis zum eingeschränkten Zugang — bewusst als eigene, ruhige
            Zeile statt als Badge/Pill (wie die entfernten LIVE/BETA-Tags):
            das ist eine sachliche Information, kein Status-Schmuck. Der
            Punkt davor ist rein visuell, keine Ampel-Farbcodierung nötig. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '10px',
            marginTop: 'clamp(24px, 3.5vw, 32px)',
          }}
        >
          <span
            aria-hidden
            style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: C.goldInk, flexShrink: 0, transform: 'translateY(-2px)' }}
          />
          <p style={{ fontFamily: F.sans, fontSize: '12.5px', lineHeight: 1.6, color: C.inkSubtle, margin: 0, maxWidth: '560px' }}>
            Der Zugang ist aktuell ausschließlich für Eric Schuck Persönlich — Es werden vorübergehend keine neuen Konten angelegt.
          </p>
        </div>

        <div style={{ height: '1px', backgroundColor: C.rule, margin: 'clamp(24px, 3.5vw, 32px) 0 20px' }} />

        <div
          className="footer-row"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}
        >
          <span className="af-micro" style={{ ...kicker, fontSize: '10px', color: C.inkFaint }}>
            {/* Ausgeschrieben statt fest notiert — sonst müsste der Wert
                jedes Jahr manuell nachgezogen werden. */}
            © {new Date().getFullYear()} Athena Finance. Alle Rechte vorbehalten.
          </span>
          <span className="af-micro" style={{ ...kicker, fontSize: '10px', color: C.inkFaint }}>
            Entwickelt von Eric Schuck
          </span>
        </div>
      </div>
    </footer>
  )
}
