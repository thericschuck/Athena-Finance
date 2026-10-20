import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { C, F, kicker } from '@/components/landing/landing-tokens'
import { MeanderFrieze } from '@/components/landing/olive-vines'
import { HeroParallax } from '@/components/landing/islands/HeroParallax'
import { Kicker, Lozenge } from '@/components/landing/shared/editorial'
import { SHELL } from '@/components/landing/shared/layout'

/*
  Der Hero füllt bewusst den ganzen Viewport: die Dashboard-Vorschau
  soll erst beim Scrollen auftauchen. Die Leiste ist jetzt `fixed` statt
  `absolute` (siehe .site-header) und reserviert deshalb keinen Platz mehr
  im Fluss — der Hero beginnt an der echten Seitenoberkante, damit das
  Bild hinter der anfangs transparenten Leiste sichtbar ist. Der fehlende
  Abstand kommt hier über paddingTop zurück (Leistenhöhe + der alte
  Wert), die Überschrift steht dadurch optisch an derselben Stelle wie
  zuvor. Lead, Buttons und Zeile darunter rutschen als Gruppe an den
  unteren Rand (siehe .hero-foot).
*/
export function Hero() {
  return (
    <section
      className="hero"
      style={{
        position: 'relative',
        overflow: 'hidden',
        paddingTop: 'calc(var(--af-nav-h) + clamp(52px, 10vh, 132px))',
        paddingBottom: 'clamp(34px, 5vh, 60px)',
      }}
    >
      <HeroParallax />
      {/* Aquarell-Landschaft, vollflächig und unverändert (siehe .hero-photo) */}
      <div className="hero-photo" aria-hidden>
        <Image
          src="/hero-landscape.avif"
          alt=""
          fill
          priority
          sizes="100vw"
          className="hero-photo-img"
        />
      </div>

      {/*
        Athena auf ionischem Kapitell, rechts im Hero. In Originalfarben wie
        das Aquarell. Unter 900px ausgeblendet — dort steht die Textspalte auf
        voller Breite und es bleibt kein Platz neben ihr.
      */}
      <Image
        src="/athena-statue.svg"
        alt=""
        aria-hidden
        width={95}
        height={142}
        unoptimized
        className="hero-athena"
      />

      {/* Weißer Halbkreis, der von der Unterkante aufsteigt — siehe .hero-dome */}
      <div className="hero-dome" aria-hidden>
        {/* Mäanderfries als Gesimslinie auf dem Trichter-Rand — dasselbe
            Zierelement wie das Gebälk in der Säulen-Sektion, hier auf dem
            „Podest" der Hero-Aktionen statt auf einem Onyx-Band. Sitzt
            exakt auf der oberen Kante des clip-path-Trichters (20% der
            Kuppelhöhe), der Rest der Kuppel bleibt schlicht. */}
        <span className="hero-dome-frieze">
          <MeanderFrieze id="frieze-hero-dome" color={C.ink} opacity={0.16} />
        </span>
      </div>

      <div className="hero-shell" style={{ ...SHELL, position: 'relative', textAlign: 'center' }}>
        <div
          className="af-rise"
          style={{ display: 'flex', justifyContent: 'center', marginBottom: '30px' }}
        >
          {/* dunkler als sonst: über dem Bild erreicht inkSubtle nur 2.9:1 */}
          <Kicker rules center color={C.ink} ruleColor="rgba(26,26,26,.35)">
            ΑTΗEΝΑ · Finanzen im Überblick
          </Kicker>
        </div>

        <h1
          className="af-balance af-rise"
          style={{
            animationDelay: '.1s',
            fontFamily: F.display,
            fontWeight: 400,
            fontSize: 'clamp(30px, 6.6vw, 80px)',
            lineHeight: 1.02,
            letterSpacing: '-0.022em',
            margin: '0 auto',
            maxWidth: '15ch',
            color: C.ink,
          }}
        >
          Finanzen im Griff.
          <br />
          <em style={{ fontStyle: 'italic', color: C.goldInkDeep }}>Vollständig überblickt.</em>
        </h1>

        {/* Aktionen und Trenner bilden eine Gruppe am unteren Rand */}
        <div className="hero-foot">
          <div
            className="af-rise cta-row"
            style={{
              animationDelay: '.22s',
              display: 'flex',
              gap: '14px',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <Link href="/login" className="af-btn hero-btn-primary">
              Anmelden <ArrowRight size={15} strokeWidth={2} />
            </Link>
            <a href="#features" className="af-btn hero-btn-outline">
              Das Instrumentarium
            </a>
          </div>

          <p
            className="af-rise af-micro"
            style={{
              ...kicker,
              animationDelay: '.34s',
              fontSize: '10px',
              /* inkSubtle statt inkFaint: bei 10px reicht inkFaint (3.4:1,
                 nur für ≥18px geeicht) nicht — die Zeile liegt jetzt auf der
                 weißen Kuppel (.hero-dome) und braucht 4.5:1 */
              color: C.inkSubtle,
              margin: 'clamp(22px, 3vw, 30px) 0 0',
            }}
          >
            Portfolio · Ausgaben · Verträge · Strategie
          </p>

          {/* Unter 640px aus (siehe .hero-lozenge in landing.css) — der Steg
              aus Linie + Raute sitzt dort direkt auf dem Verlaufs-Auslauf der
              Kuppel (siehe .hero-dome) statt wie am Desktop auf ruhigem
              Parchment, und liest sich in diesem Übergang als überflüssige
              zweite Linie neben dem eigentlichen Bühnenrand (siehe Chat). */}
          <div className="af-rise hero-lozenge" style={{ animationDelay: '.46s', marginTop: 'clamp(26px, 4vh, 48px)' }}>
            <Lozenge />
          </div>
        </div>
      </div>
    </section>
  )
}
