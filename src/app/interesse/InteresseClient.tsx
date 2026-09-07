'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Logo } from '@/components/ui/logo'
import { C, kicker } from '@/components/landing/landing-tokens'
import { LaurelWreath, MeanderFrieze } from '@/components/landing/olive-vines'
import { SmoothScrollProvider } from '@/components/landing/SmoothScrollProvider'
import { useReducedMotion } from '@/lib/use-reduced-motion'
import { WaitlistForm, WAITLIST_PROMISES } from '@/components/waitlist/WaitlistForm'
import './interesse.css'

if (typeof window !== 'undefined') gsap.registerPlugin(ScrollTrigger)

/**
 * Scroll-gebundene Einblendung statt eines einmaligen Fade-ins (kein
 * `whileInView`): der Fortschritt hängt direkt an der Scrollposition zwischen
 * den `start`/`end`-Marken — hoch- und runterscrollen spulen die Bewegung in
 * beide Richtungen, nichts bleibt „schon abgespielt" hängen. `scrub: true` ist
 * dafür der entscheidende Teil, `ease: 'none'`, weil ein Scrub linear zur
 * Fingerbewegung laufen soll statt mit einer eigenen Kurve dagegenzuarbeiten.
 *
 * Nur für den unteren Streifen gedacht: der Aufmacher steht beim Laden schon
 * im Bild und hat nichts, woran er sich beim Scrollen entlangbewegen könnte.
 */
function useScrollReveals(rootRef: React.RefObject<HTMLElement | null>, disabled: boolean) {
  useEffect(() => {
    if (disabled) return
    const root = rootRef.current
    if (!root) return

    const ctx = gsap.context(() => {
      root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
        gsap.fromTo(
          el,
          { opacity: 0.2, y: 28 },
          {
            opacity: 1,
            y: 0,
            ease: 'none',
            scrollTrigger: { trigger: el, start: 'top 92%', end: 'top 62%', scrub: true },
          },
        )
      })
    }, root)

    return () => ctx.revert()
  }, [rootRef, disabled])
}

export function InteresseClient() {
  const rootRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()
  useScrollReveals(rootRef, reducedMotion)

  return (
    <SmoothScrollProvider>
      <div ref={rootRef} className="int-root">
        <header className="int-head">
          <Link href="/" className="int-brand" aria-label="Zur Startseite">
            <Logo variant="transparent" size={22} />
            <span className="int-brand-name">Athena Finance</span>
          </Link>
          <Link href="/" className="int-back">
            Zur Startseite
          </Link>
        </header>

        <main className="int-hero">
          <div>
            <div className="int-kicker-row">
              {/* Der Kranz als Siegel neben der Zeile statt als eigenes
                  Ornament irgendwo in der Fläche — an der Beschriftung liest
                  er sich als deren Wappen, freistehend als vergessenes
                  Beiwerk (dieselbe Überlegung wie im Landing-Fuß). */}
              <LaurelWreath size={30} tone="dark" opacity={0.85} />
              <span style={{ ...kicker, fontSize: '11px', color: C.gold }}>Noch im Bau</span>
            </div>

            <h1 className="int-title">
              Sieh dem Bau zu.
              <br />
              <em>Und schieb mit an.</em>
            </h1>

            <p className="int-lead">
              Athena Finance entsteht gerade — Konten, Depots, Verträge und Strategien in
              einer Ansicht, jede Zahl aus einer echten Buchung. Heute läuft das für eine
              einzelne Person. Ob und wann daraus etwas für mehr wird, ist offen: Für
              mehrere Nutzer braucht es mehr als Code, und die rechtlichen Fragen rund um
              Kontodaten werden vorher sauber geklärt statt nebenbei. Wer den Weg dorthin
              mitverfolgen will, trägt sich hier ein.
            </p>

            <div className="int-form-wrap">
              <WaitlistForm />
            </div>

            <p className="int-signin">
              Du hast schon einen Zugang? <Link href="/login">Anmelden</Link>
            </p>
          </div>

          <div className="int-statue-wrap" aria-hidden>
            <span className="int-statue-glow" />
            {/*
              Athena auf ionischem Kapitell — dieselbe Zeichnung wie im Hero
              der Startseite, hier als eigenständiges Bildmotiv statt als
              Randfigur. `unoptimized`, weil Nexts Optimizer die SVG rastern
              und ihr damit die Kanten nehmen würde.
            */}
            <Image
              src="/athena-statue.svg"
              alt=""
              width={95}
              height={142}
              unoptimized
              priority
              className="int-statue"
            />
          </div>
        </main>

        <div className="int-promises-band">
          <MeanderFrieze id="interesse-frieze" color={C.cream} opacity={0.22} />
          <div className="int-promises" data-reveal>
            {WAITLIST_PROMISES.map((p) => (
              <div key={p.num}>
                <span className="int-promise-num">{p.num}</span>
                <div className="int-promise-rule" />
                <h2 className="int-promise-title">{p.title}</h2>
                <p className="int-promise-text">{p.text}</p>
              </div>
            ))}
          </div>
        </div>

        <footer className="int-foot">
          <p>athena-finance.de ist ein privates Projekt in Entwicklung, kein aktives Angebot.</p>
          <p>
            <Link href="/datenschutz">Datenschutzerklärung</Link>
            {' · '}
            <Link href="/impressum">Impressum</Link>
          </p>
        </footer>
      </div>
    </SmoothScrollProvider>
  )
}
