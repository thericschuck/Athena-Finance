'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { LazyMotion, domAnimation, m, useReducedMotion as useFramerReducedMotion, useInView } from 'framer-motion'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { DashboardMock } from './DashboardMock'
import {
  TrendingUp, BarChart2, FileText, Target, Repeat2,
  Globe, ShieldCheck, Zap, ArrowRight,
  CandlestickChart, Wallet, Landmark, ShoppingCart,
  Infinity as InfinityIcon,
} from 'lucide-react'
import { Logo } from '@/components/ui/logo'
import { C, F, SPACE, kicker } from './landing-tokens'
import './landing.css'
import { OliveVines, LaurelWreath, MeanderFrieze } from './olive-vines'
import { SmoothScrollProvider } from './SmoothScrollProvider'
import { scrollToY, jumpToY } from './scroll-control'

if (typeof window !== 'undefined') gsap.registerPlugin(ScrollTrigger)

/**
 * framer-motions eigenes `useReducedMotion` liest `window.matchMedia` SYNCHRON
 * schon im allerersten Render (siehe Quelle: `useState(prefersReducedMotion.current)`,
 * ohne SSR-Guard) — auf dem Server (kein `window`) liefert das immer `false`,
 * auf dem Client sofort den ECHTEN Wert. Hat ein/e Nutzer:in Reduced Motion
 * tatsächlich aktiviert, weichen Server- und erster Client-Render damit
 * STRUKTURELL voneinander ab (ganze Abschnitte wie PedimentReveal rendern
 * komplett anderes Markup je nach `still`) — ein garantierter
 * Hydration-Mismatch, den React zwar mit einem kompletten Client-Neu-Render
 * "heilt", aber sichtbar als Flackern beim Laden.
 *
 * Fix: den echten Wert erst NACH dem Mounten übernehmen (klassisches
 * "hasMounted"-Muster). Der erste Client-Render bleibt dadurch exakt so wie
 * der Server-Render (immer `false`); das Umschalten auf Reduced Motion
 * passiert einen Tick später als ganz normaler, unverdächtiger Re-Render
 * statt während der Hydration selbst. Gleicher Name wie das Original, damit
 * alle bestehenden `useReducedMotion()`-Aufrufe im File automatisch diese
 * sichere Fassung bekommen.
 */
function useReducedMotion() {
  const prefersReduced = useFramerReducedMotion()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted ? prefersReduced : false
}

// ── Bewegung ──────────────────────────────────────────────────────────────────

const EASE = [0.22, 1, 0.36, 1] as const

/**
 * Nur für `Reveal`s mit `once=false` gebraucht: hält fortlaufend fest, ob
 * zuletzt nach oben oder unten gescrollt wurde. Ein reiner Vorzeichenvergleich
 * in einem `ref` statt einem State-Update — läuft potenziell bei jedem
 * Scroll-Event, ein Re-Render pro Event wäre unnötig teuer, und kein anderer
 * Teil der Komponente muss auf eine Richtungsänderung selbst reagieren
 * (der `ref`-Wert wird nur im NÄCHSTEN Render, ausgelöst durch `useInView`,
 * mitgelesen). `enabled=false` (der Normalfall — die meisten Reveals nutzen
 * `once=true` und brauchen das hier nie) hängt gar keinen Listener ein.
 */
function useScrollDirection(enabled: boolean) {
  const dir = useRef<'up' | 'down'>('down')
  useEffect(() => {
    if (!enabled) return
    let lastY = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      if (y !== lastY) dir.current = y > lastY ? 'down' : 'up'
      lastY = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [enabled])
  return dir
}

/**
 * Fade-up (oder seitlich, siehe `x`) beim Scrollen ins Bild. Löst standardmäßig
 * (`once=true`) einmalig aus und bleibt danach dauerhaft sichtbar — kein
 * Zurückanimieren beim Hochscrollen (bei der kleinen Standard-Fade-up-Bewegung
 * wirkte ein Exit-Effekt in einer früheren Fassung unruhig, per Nutzerfeedback
 * wieder entfernt).
 *
 * `once={false}` (siehe Instrumentarium-Karten) ist RICHTUNGSABHÄNGIG, nicht
 * einfach die Umkehr derselben Bewegung in beide Scrollrichtungen: verlässt
 * die Karte den Viewport, während man WEITERSCROLLT (vorwärts, in derselben
 * Richtung, aus der sie kam), bleibt sie einfach stehen — man lässt sie
 * hinter sich, kein Grund, sie wegzuanimieren. Erst beim ZURÜCKSCROLLEN (man
 * bewegt sich von einer bereits gezeigten Karte weg, sie verlässt den
 * Viewport auf der GEGENÜBERLIEGENDEN Kante) fährt sie sichtbar wieder aus
 * dem Bild — als Rückspulen der Enthüllung, nicht als deren Wiederholung.
 * Ohne diese Unterscheidung „kopiert" der Effekt beim Hochscrollen einfach
 * die Herein-Animation des Runterscrollens, was sich falsch anfühlt: eine
 * Karte, die man gerade erst (vorwärts) verlassen hat, sollte nicht
 * rückwärts wieder einfliegen, nur weil man kurz weiterscrollt.
 *
 * Zwei verschachtelte Elemente statt nur einem `motion.div` mit `whileInView`:
 * `whileInView` beobachtet das Element an seiner TATSÄCHLICHEN, bereits
 * transformierten Position. Bei großem `x` (siehe Instrumentarium-Karten,
 * `x: '-100vw'`) sitzt die Karte anfangs eine volle Fensterbreite neben dem
 * Viewport — und weil `.af-landing` bewusst `overflow-x: clip` trägt (verhindert
 * horizontales Scrollen durch andere dekorative Elemente), schneidet dieser
 * Vorfahre die Karte dort clientseitig ab. IntersectionObserver behandelt
 * geclipte Fläche als nicht schneidend, unabhängig von `viewport.margin` — die
 * Karte hätte dadurch NIE ausgelöst, egal wie weit man scrollt.
 *
 * Der äußere `<div ref>` bleibt deshalb unverändert in der normalen
 * Layout-Position (trägt `className`/`style`, u. a. die Grid-Platzierung) und
 * wird per `useInView` beobachtet; der innere `motion.div` übernimmt Versatz
 * und Fade und bekommt den Sichtbarkeits-Status nur als fertigen Boolean.
 */
function Reveal({
  children,
  delay = 0,
  x = 0,
  y = 26,
  once = true,
  className,
  style,
}: {
  children: React.ReactNode
  delay?: number
  /**
   * Zahl = Pixel-Versatz (Standardfall, kleine Fade-Bewegung). Für ein
   * Einfliegen von außerhalb des Bildschirms (siehe Instrumentarium-Karten)
   * einen `vw`-String übergeben, z. B. `'-100vw'` — px-Werte reichen dafür
   * nicht, weil die Karten in einem zentrierten, schmaleren Container sitzen
   * und ein fester Pixelbetrag je nach Fensterbreite trotzdem sichtbar bliebe.
   */
  x?: number | string
  y?: number
  /**
   * `false` lässt das Element beim Zurückscrollen wieder in seinen `offset`-
   * Zustand zurückfallen (siehe Kommentar oben) statt einmalig auszulösen
   * und dauerhaft sichtbar zu bleiben (Standardfall). Für die meisten
   * Reveals bewusst NICHT gesetzt: ein Exit-Effekt bei der kleinen
   * Fade-up-Bewegung wirkte in einer früheren Fassung unruhig.
   */
  once?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  const still = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  /*
   * `amount` nur für once=false auf 0.6 angehoben: mit dem Default (`'some'`,
   * bereits 1px zählt) kippt `inView` erst auf `false`, wenn die Karte
   * VOLLSTÄNDIG unsichtbar ist — die Ausfahr-Animation würde dann komplett
   * außerhalb des Viewports laufen, man sähe sie nie. Bei once=true bleibt
   * der Default: dort zählt nur der EINMALIGE Eintritt, je früher desto
   * besser.
   */
  const inView = useInView(ref, { once, margin: '0px', amount: once ? 'some' : 0.6 })
  const offset = { opacity: 0, x: still ? 0 : x, y: still ? 0 : y }
  const scrollDir = useScrollDirection(!once)
  // Nur für once=false gebraucht: merkt sich, ob die Karte SCHON EINMAL
  // gezeigt wurde — zusammen mit `scrollDir` entscheidet das unten, ob ein
  // Verlassen des Viewports ein normales Vorwärts-Weiterscrollen ist
  // (stehenbleiben) oder ein Zurückscrollen (wieder ausfliegen), siehe
  // Kommentar an der Komponente.
  const hasEnteredRef = useRef(false)
  const [animate, setAnimate] = useState(offset)

  // `scrollDir`/`hasEnteredRef` sind Refs und dürfen nicht direkt im Render
  // gelesen werden (siehe react-hooks/refs) — die Auswertung läuft deshalb
  // in einem Effekt, ausgelöst durch dieselbe `inView`-Änderung, die auch
  // sonst den Übergang triggert. `x`/`y`/`still` statt der daraus gebauten
  // `offset`/`visible`-Objekte in den Deps: Objektliterale sind bei jedem
  // Aufruf neue Referenzen und würden den Effekt bei jedem Render erneut
  // auslösen.
  useEffect(() => {
    const off = { opacity: 0, x: still ? 0 : x, y: still ? 0 : y }
    const vis = { opacity: 1, x: 0, y: 0 }
    if (inView) {
      hasEnteredRef.current = true
      setAnimate(vis)
    } else if (!once && hasEnteredRef.current) {
      setAnimate(scrollDir.current === 'up' ? off : vis)
    } else {
      setAnimate(off)
    }
  }, [inView, once, x, y, still, scrollDir])

  return (
    <div ref={ref} className={className} style={style}>
      <m.div
        style={{ height: '100%' }}
        initial={offset}
        animate={animate}
        transition={{ duration: still ? 0.15 : 0.7, delay: still ? 0 : delay, ease: EASE }}
      >
        {children}
      </m.div>
    </div>
  )
}

// ── Editorial-Bausteine ───────────────────────────────────────────────────────

/** Gesperrte Kapitälchen, optional mit flankierenden Haarlinien. */
function Kicker({
  children,
  color = C.inkSubtle,
  rules = false,
  ruleColor = C.rule,
  center = false,
}: {
  children: React.ReactNode
  color?: string
  rules?: boolean
  ruleColor?: string
  center?: boolean
}) {
  const label = (
    <span className="af-kicker" style={{ ...kicker, color, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
  if (!rules) return label
  const rule = (
    <span
      className="af-kicker-rule"
      style={{ height: '1px', width: 'clamp(24px, 8vw, 72px)', backgroundColor: ruleColor, flexShrink: 0 }}
    />
  )
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        justifyContent: center ? 'center' : 'flex-start',
      }}
    >
      {center && rule}
      {label}
      {rule}
    </div>
  )
}

/** Doppellinie mit Raute — klassischer Absatztrenner. */
function Lozenge({ color = C.rule, mark = C.goldInk }: { color?: string; mark?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', justifyContent: 'center' }}>
      <span style={{ height: '1px', flex: 1, maxWidth: '160px', backgroundColor: color }} />
      <span
        style={{
          width: '6px',
          height: '6px',
          backgroundColor: mark,
          transform: 'rotate(45deg)',
          flexShrink: 0,
        }}
      />
      <span style={{ height: '1px', flex: 1, maxWidth: '160px', backgroundColor: color }} />
    </div>
  )
}

function SectionHead({
  index,
  label,
  title,
  emphasis,
  lead,
  tone = 'light',
  align = 'center',
}: {
  index?: string
  label: string
  title: string
  emphasis?: string
  lead?: string
  tone?: 'light' | 'dark'
  align?: 'center' | 'left'
}) {
  const dark = tone === 'dark'
  return (
    <div
      style={{
        textAlign: align,
        maxWidth: align === 'center' ? '760px' : undefined,
        margin: align === 'center' ? '0 auto' : undefined,
      }}
    >
      <div style={{ display: 'flex', justifyContent: align === 'center' ? 'center' : 'flex-start', marginBottom: '22px' }}>
        <Kicker
          rules
          center={align === 'center'}
          color={dark ? C.onSubtle : C.inkSubtle}
          ruleColor={dark ? C.ruleOn : C.rule}
        >
          {index ? `${index} · ${label}` : label}
        </Kicker>
      </div>
      <h2
        className="af-balance"
        style={{
          fontFamily: F.display,
          fontWeight: 400,
          fontSize: 'clamp(26px, 3.6vw, 44px)',
          lineHeight: 1.1,
          letterSpacing: '-0.015em',
          color: dark ? C.onCream : C.ink,
          margin: 0,
        }}
      >
        {title}
        {emphasis && (
          <>
            <br />
            <em style={{ fontStyle: 'italic', color: dark ? C.gold : C.goldInk }}>{emphasis}</em>
          </>
        )}
      </h2>
      {lead && (
        <p
          className="af-balance"
          style={{
            fontFamily: F.serif,
            fontSize: 'clamp(14px, 1.3vw, 16px)',
            lineHeight: 1.8,
            color: dark ? C.onBody : C.inkBody,
            marginTop: '20px',
            maxWidth: '600px',
            marginLeft: align === 'center' ? 'auto' : 0,
            marginRight: align === 'center' ? 'auto' : 0,
          }}
        >
          {lead}
        </p>
      )}
    </div>
  )
}

/**
 * Dieselbe Reihenfolge/Beschriftung wie die vier nummerierten SectionHead-
 * Instanzen weiter unten (index="I"…"IV") — hier zentral gepflegt, damit
 * SectionProgressBar sie nicht aus dem JSX herauslesen muss. `tone` steuert
 * hell/dunkel wie bei SectionHead selbst, hier aber für die Leiste: II (Die
 * Säulen) läuft auf Onyx, alle anderen auf Parchment-artigem Grund.
 */
const NUMBERED_SECTIONS = [
  { index: 'I', label: 'Das Instrumentarium', tone: 'light' },
  { index: 'II', label: 'Die Säulen', tone: 'dark' },
  { index: 'III', label: 'Die Analyse', tone: 'light' },
  { index: 'IV', label: 'Der Weg', tone: 'light' },
] as const

type NavItem = { index: string; label: string; tone: 'light' | 'dark' }

/** Für das Dropdown der Sticky-Leiste — Prolog plus alle nummerierten Sektionen. */
const NAV_ITEMS: NavItem[] = [{ index: 'Prolog', label: 'Anfang', tone: 'dark' }, ...NUMBERED_SECTIONS]

/**
 * Der Footer listet dieselben Sektionen noch einmal auf (siehe FooterSections)
 * und soll beim Klick GENAUSO springen wie die Sticky-Leiste selbst — also
 * über deren `jumpTo` (Fade-Cut statt sichtbarem Durchscrollen, siehe
 * SectionProgressBar), nicht über einen nativen `href="#anchor"`-Sprung, der
 * sich anders anfühlen würde. Ein CustomEvent statt Props/Context: der Footer
 * sitzt strukturell weit von SectionProgressBar entfernt, beide werden
 * unabhängig in `LandingClient` gerendert.
 */
const SECTION_JUMP_EVENT = 'af:jump-to-section'
function requestSectionJump(index: string) {
  window.dispatchEvent(new CustomEvent(SECTION_JUMP_EVENT, { detail: index }))
}

/**
 * Dezente Sticky-Leiste ganz oben im Viewport: zeigt „Prolog" bzw. die
 * Kennziffer/den Titel der Sektion, durch die man gerade scrollt — aber NUR,
 * solange deren eigene, große Überschrift (SectionHead) selbst nicht mehr zu
 * sehen ist. Sonst stünde dieselbe Information doppelt auf dem Bildschirm.
 * Per Klick öffnet sie ein Dropdown mit allen Sektionen zum direkten Anspringen.
 *
 * Bewusst ein einfacher, gedrosselter `scroll`-Listener statt ScrollTrigger:
 * das hier ist reines Scrollspy (ein diskreter Zustand — welche Sektion ist
 * aktiv, ist die Überschrift sichtbar), kein kontinuierlich gescrubbter
 * Animationsfortschritt wie bei PedimentReveal/PillarsReveal. `requestAnimationFrame`
 * statt eines Zeit-Throttles, damit die Prüfung nie öfter läuft als der
 * Browser ohnehin neu zeichnet.
 */
/** Verzögerung zwischen den Einträgen beim gestaffelten Auf-/Zuklappen. */
const NAV_ITEM_STAGGER = 90
const NAV_ITEM_DURATION = 320
/** Dauer des Fade-Cuts beim Springen zu einer Sektion über die Navigation. */
const NAV_FADE_MS = 460

function SectionProgressBar() {
  const still = useReducedMotion()
  const [active, setActive] = useState<NavItem | null>(null)
  // Hält den zuletzt aktiven Eintrag auch dann noch fest, wenn `active` schon
  // wieder null ist — sonst verschwindet der Text hart mit dem Umschalten von
  // `active`, statt zusammen mit der Kapsel weich auszufaden.
  const [display, setDisplay] = useState<NavItem | null>(null)
  const [open, setOpen] = useState(false)
  // Panel bleibt beim Zuklappen noch kurz im DOM, damit die Einträge
  // gestaffelt ausblenden können, statt hart mit `open` zu verschwinden.
  const [panelMounted, setPanelMounted] = useState(false)
  const [itemsOn, setItemsOn] = useState(false)
  const [fading, setFading] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (active) setDisplay(active)
  }, [active])

  useEffect(() => {
    if (open) {
      setPanelMounted(true)
      // Doppeltes rAF: ein einzelnes kann noch vor dem ersten Paint der
      // opacity:0-Ausgangslage laufen — dann fehlt der CSS-Transition der
      // Startwert und sie springt sofort auf den Endzustand statt zu blenden.
      let raf2 = 0
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setItemsOn(true))
      })
      return () => {
        cancelAnimationFrame(raf1)
        cancelAnimationFrame(raf2)
      }
    }
    setItemsOn(false)
    const closeDelay = NAV_ITEMS.length * NAV_ITEM_STAGGER + NAV_ITEM_DURATION
    const t = window.setTimeout(() => setPanelMounted(false), closeDelay)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    type Marker = { el: HTMLElement; index: string; label: string; tone: 'light' | 'dark' }
    const markers: Marker[] = []
    document.querySelectorAll<HTMLElement>('[data-section-marker]').forEach((el) => {
      const meta = NUMBERED_SECTIONS.find((s) => s.index === el.dataset.sectionMarker)
      if (meta) markers.push({ el, index: meta.index, label: meta.label, tone: meta.tone })
    })

    // Dieselbe Höhe wie die Leiste selbst (siehe padding unten) — die
    // Überschrift gilt als „weg", sobald ihre Unterkante diese Linie
    // passiert hat, nicht erst wenn sie komplett aus dem Bild ist.
    const REVEAL_LINE = 88

    const update = () => {
      let current: Marker | null = null
      for (const m of markers) {
        if (m.el.getBoundingClientRect().top <= REVEAL_LINE) current = m
      }
      if (!current) {
        setActive(window.scrollY > 500 ? { index: 'Prolog', label: '', tone: 'dark' } : null)
        return
      }
      const stillOnScreen = current.el.getBoundingClientRect().bottom > 0
      setActive(stillOnScreen ? null : current)
    }

    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        update()
        ticking = false
      })
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  const visible = active !== null

  // Dropdown mit ausblenden, sobald die Leiste selbst verschwindet (z.B. weil
  // man wieder auf Höhe einer Überschrift gescrollt ist).
  useEffect(() => {
    if (!visible) setOpen(false)
  }, [visible])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  /**
   * Springt zur gewählten Sektion, ohne die Scrollbewegung selbst zu zeigen:
   * kurz auf die Seitenhintergrundfarbe abblenden, im Deckungsmoment sofort
   * (nicht animiert) springen, dann wieder aufblenden. Fühlt sich dadurch wie
   * ein weicher Übergang an, statt wie ein Abspulen aller Sektionen dazwischen.
   */
  const jumpTo = (index: string) => {
    setOpen(false)
    const targetY =
      index === 'Prolog'
        ? 0
        : (() => {
            const el = document.querySelector<HTMLElement>(`[data-section-marker="${index}"]`)
            return el ? el.getBoundingClientRect().top + window.scrollY - 40 : null
          })()
    if (targetY === null) return
    if (still) {
      jumpToY(targetY)
      return
    }
    setFading(true)
    window.setTimeout(() => {
      jumpToY(targetY)
      setFading(false)
    }, NAV_FADE_MS)
  }

  /*
   * Nimmt Sprung-Wünsche von außerhalb entgegen (siehe Footer/FooterSections)
   * — per `ref` statt direkt `jumpTo` in die Dependency-Liste, sonst müsste
   * der Listener bei jedem Render ab- und neu angehängt werden, nur weil
   * `jumpTo` als Closure jedes Mal neu entsteht. Die Zuweisung selbst läuft
   * bewusst in einem eigenen Effekt (kein Ref-Write während des Renders,
   * siehe react-hooks/refs) und OHNE Dependency-Array, damit sie nach jedem
   * Render die aktuelle Closure übernimmt.
   */
  const jumpToRef = useRef(jumpTo)
  useEffect(() => {
    jumpToRef.current = jumpTo
  })
  useEffect(() => {
    const onJumpRequest = (e: Event) => {
      const index = (e as CustomEvent<string>).detail
      if (index) jumpToRef.current(index)
    }
    window.addEventListener(SECTION_JUMP_EVENT, onJumpRequest)
    return () => window.removeEventListener(SECTION_JUMP_EVENT, onJumpRequest)
  }, [])

  const dark = display?.tone === 'dark'
  const lift = still || visible ? 0 : -6

  return (
    <>
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 900,
          backgroundColor: C.parchment,
          opacity: fading ? 1 : 0,
          pointerEvents: 'none',
          transition: `opacity ${NAV_FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            opacity: fading ? 1 : 0,
            transform: `scale(${fading ? 1 : 0.92})`,
            transition: `opacity ${NAV_FADE_MS - 80}ms ease, transform ${NAV_FADE_MS - 80}ms ease`,
            transitionDelay: fading ? '60ms' : '0ms',
          }}
        >
          <Logo variant="dark" size={64} />
        </div>
      </div>
      <div
        ref={rootRef}
        style={{
          position: 'fixed',
          top: '18px',
          left: '50%',
          zIndex: 500,
          pointerEvents: visible ? 'auto' : 'none',
          opacity: visible ? 1 : 0,
          transform: `translateX(-50%) translateY(${lift}px)`,
          transition: still ? 'opacity .15s ease' : 'opacity .35s ease, transform .35s ease',
        }}
      >
        {/*
          Geschlossen: kein Rahmen, nur ein weicher Verlaufshintergrund fürs
          Lesen über unruhigem Content, dafür flankierende Linien wie bei den
          normalen SectionHead-Überschriften (derselbe <Kicker rules center>)
          — liest sich dadurch wie ein nahtloser Mini-Titel statt wie ein
          Button. Offen bleibt es dagegen genau wie zuvor (Kapsel mit Rahmen,
          ohne Linien): dort steht es klar für eine anklickbare Fläche.
        */}
        {display && (
          <button
            type="button"
            className="af-section-nav-trigger"
            onClick={() => setOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label="Abschnitt wechseln"
            tabIndex={visible ? 0 : -1}
            style={{
              padding: '9px 20px',
              borderRadius: '999px',
              border: open ? `1px solid ${dark ? C.ruleOn : C.rule}` : '1px solid transparent',
              backgroundColor: open
                ? dark
                  ? 'rgba(20,20,18,.8)'
                  : 'rgba(244,239,228,.92)'
                : dark
                  ? 'rgba(20,20,18,.5)'
                  : 'rgba(244,239,228,.65)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
            }}
          >
            {/*
              Offen zeigt die Kapsel bewusst nicht mehr den Namen der
              aktuellen Sektion — der steht ja schon (gold hervorgehoben) in
              der Liste darunter, stattdessen stünde er doppelt auf dem
              Bildschirm.
            */}
            {open ? (
              <Kicker color={dark ? C.onSubtle : C.inkSubtle}>Abschnitte</Kicker>
            ) : (
              <Kicker rules center color={dark ? C.onSubtle : C.inkSubtle} ruleColor={dark ? C.ruleOn : C.rule}>
                {display.index === 'Prolog' ? 'Prolog' : `${display.index} · ${display.label}`}
              </Kicker>
            )}
          </button>
        )}

        {/*
          Bewusst kein Listbox-/Menü-Look (eine zusammenhängende Box mit
          Trennlinien): jeder Eintrag eine eigenständige, freistehende Kachel
          im selben Stil wie die Kapsel oben, statt Zeilen in einem Container.
          Beim Öffnen kommen sie von oben herein (aufsteigende Verzögerung —
          Prolog zuerst), beim Schließen sinken sie nach unten weg und in
          umgekehrter Reihenfolge (der unterste Eintrag zuerst) — wie ein
          Stapel, der sich von unten leert. Bleibt dafür noch
          `NAV_ITEMS.length * NAV_ITEM_STAGGER + NAV_ITEM_DURATION` im DOM,
          statt beim Schließen hart zu verschwinden.
        */}
        {panelMounted && (
          <div
            role="menu"
            aria-label="Abschnitte"
            style={{
              position: 'absolute',
              top: 'calc(100% + 12px)',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
              pointerEvents: itemsOn ? 'auto' : 'none',
            }}
          >
            {NAV_ITEMS.map((item, i) => {
              const isActive = display?.index === item.index
              const delay = itemsOn ? i * NAV_ITEM_STAGGER : (NAV_ITEMS.length - 1 - i) * NAV_ITEM_STAGGER
              const hiddenY = open ? -8 : 8
              return (
                <button
                  key={item.index}
                  type="button"
                  role="menuitem"
                  className="af-section-nav-item"
                  onClick={() => jumpTo(item.index)}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '999px',
                    border: `1px solid ${isActive ? C.goldInk : C.rule}`,
                    backgroundColor: 'rgba(244,239,228,.92)',
                    backdropFilter: 'blur(6px)',
                    WebkitBackdropFilter: 'blur(6px)',
                    boxShadow: '0 12px 30px -16px rgba(26,26,26,.3)',
                    opacity: itemsOn ? 1 : 0,
                    transform: `translateY(${itemsOn ? 0 : hiddenY}px) scale(${itemsOn ? 1 : 0.94})`,
                    transition: `opacity ${NAV_ITEM_DURATION}ms ease, transform ${NAV_ITEM_DURATION}ms ease`,
                    transitionDelay: `${delay}ms`,
                  }}
                >
                  <Kicker color={isActive ? C.goldInk : C.inkSubtle}>
                    {item.index === 'Prolog' ? 'Prolog' : `${item.index} · ${item.label}`}
                  </Kicker>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

// ── Miniatur-Visualisierungen ─────────────────────────────────────────────────

/** Tonstufen für Ausgaben-Heatmaps — von Parchment zu Terrakotta. */
const CLAY = ['#EBE4D6', '#DFC9B8', '#D0A691', '#BE846C', '#B16A50', '#A9553C']
const HEAT = [0,1,2,3,2,1,1,3,4,5,3,2,0,2,5,4,3,1,1,3,5,4,2,1,0,1,3,4,2,0,1,2,3,4,3,2]

function MiniHeatmap({ cols = 6, cell = 12 }: { cols?: number; cell?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '3px' }}>
      {HEAT.map((v, i) => (
        <div key={i} style={{ height: `${cell}px`, backgroundColor: CLAY[v] }} />
      ))}
    </div>
  )
}

function MiniSparkline({ stroke = C.olive }: { stroke?: string }) {
  return (
    <svg width="100%" height="46" viewBox="0 0 160 46" preserveAspectRatio="none" aria-hidden>
      <path
        d="M0,42 C20,38 35,33 50,27 C65,21 80,19 95,13 C110,7 130,9 160,4"
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M0,42 C20,38 35,33 50,27 C65,21 80,19 95,13 C110,7 130,9 160,4 L160,46 L0,46Z"
        fill={stroke}
        opacity="0.1"
      />
    </svg>
  )
}

/** Statisch, keine Prop-/State-Abhängigkeit — Modul-Ebene statt Neuanlage
    bei jedem MiniDonut-Render (siehe MiniDonut unten). */
const MINI_DONUT_SEGMENTS = [
  { color: C.gold, len: 62 },
  { color: C.olive, len: 40 },
  { color: C.graphite, len: 23 },
]

function MiniDonut({ size = 76 }: { size?: number }) {
  let offset = 0
  return (
    <svg viewBox="0 0 80 80" width={size} height={size} aria-hidden style={{ display: 'block' }}>
      <circle cx="40" cy="40" r="30" fill="none" stroke={C.creamDeep} strokeWidth="9" />
      {MINI_DONUT_SEGMENTS.map((s, i) => {
        const dash = `${s.len} 125`
        const el = (
          <circle
            key={i}
            cx="40"
            cy="40"
            r="30"
            fill="none"
            stroke={s.color}
            strokeWidth="9"
            strokeDasharray={dash}
            strokeDashoffset={-offset}
            style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
          />
        )
        offset += s.len + 2
        return el
      })}
    </svg>
  )
}

function MiniStrategy() {
  return (
    <svg width="100%" height="46" viewBox="0 0 320 46" preserveAspectRatio="none" aria-hidden>
      <path
        d="M0,40 L40,31 L80,35 L110,23 L140,27 L170,17 L200,21 L230,12 L260,16 L290,6 L320,10"
        fill="none"
        stroke={C.terracotta}
        strokeWidth="1.4"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M0,40 L40,31 L80,35 L110,23 L140,27 L170,17 L200,21 L230,12 L260,16 L290,6 L320,10 L320,46 L0,46Z"
        fill={C.terracotta}
        opacity="0.08"
      />
    </svg>
  )
}

/**
 * Candlestick-Hintergrund für „III · Die Analyse" (siehe Aufrufstelle) — rein
 * dekorativ, kein Bezug zu echten Kursdaten. Feste, deterministisch
 * berechnete Werte statt Math.random(): ein clientseitig zufällig erzeugtes
 * Muster läge beim ersten Client-Render anders als beim Server-Rendering und
 * löste einen Hydration-Mismatch aus.
 */
const CANDLE_COUNT = 52
const CANDLE_W = 900
const CANDLE_H = 560
// Grundlinie folgt keiner geraden Diagonale mehr, sondern demselben
// Auf-ab-auf-Pfad wie die rote Referenzlinie: von unten links auf einen
// ersten Gipfel, zurück in ein Tal (etwa auf Höhe der dunklen Chart-Karte),
// dann steil weiter nach oben rechts. `CANDLE_KEYFRAMES` sind normalisierte
// Stützpunkte (t=Position 0..1 im Verlauf, y=0 oben/1 unten im Chart);
// `smoothstep` rundet die Übergänge zwischen ihnen, statt scharfe Knicke an
// Gipfel/Tal zu erzeugen.
const CANDLE_Y_TOP = 90
const CANDLE_Y_BOTTOM = 480
const CANDLE_KEYFRAMES = [
  { t: 0, y: 1 },
  { t: 0.32, y: 0.1 },
  { t: 0.6, y: 0.68 },
  { t: 1, y: 0 },
]
function smoothstep(t: number) {
  return t * t * (3 - 2 * t)
}
function candleBaselineYNorm(t: number) {
  for (let i = 0; i < CANDLE_KEYFRAMES.length - 1; i++) {
    const a = CANDLE_KEYFRAMES[i]
    const b = CANDLE_KEYFRAMES[i + 1]
    if (t <= b.t || i === CANDLE_KEYFRAMES.length - 2) {
      const local = smoothstep((t - a.t) / (b.t - a.t))
      return a.y + (b.y - a.y) * local
    }
  }
  return CANDLE_KEYFRAMES[CANDLE_KEYFRAMES.length - 1].y
}
/** Deterministisches Pseudo-Rauschen (drei überlagerte Sinuswellen statt
    Math.random) — reicht von ~-1 bis 1, für Server/Client identisch. */
function pseudoNoise(i: number, seed: number) {
  return Math.sin(i * seed) * 0.5 + Math.sin(i * seed * 2.7 + 1.3) * 0.3 + Math.sin(i * seed * 5.1 + 2.6) * 0.2
}
/**
 * Jede Kerze bekommt jetzt einen echten Open/Close-Bezug statt unabhängigem
 * Zickzack: der Schlusskurs folgt der Trendlinie (`candleBaselineYNorm`), der
 * Eröffnungskurs sitzt nah am Schlusskurs der Vorkerze plus einer kleinen
 * Kurslücke — genau wie bei echten OHLC-Daten. Körper = Spanne zwischen Open
 * und Close, Docht = kleiner, unabhängiger Über- bzw. Unterstand darüber
 * hinaus. Das Ergebnis liest sich wie ein plausibler Kursverlauf statt wie
 * eine reine Textur.
 */
const CANDLES = Array.from({ length: CANDLE_COUNT }, (_, i) => {
  const t = i / (CANDLE_COUNT - 1)
  const closeY = CANDLE_Y_TOP + candleBaselineYNorm(t) * (CANDLE_Y_BOTTOM - CANDLE_Y_TOP)
  const prevT = i === 0 ? t : (i - 1) / (CANDLE_COUNT - 1)
  const prevCloseY = CANDLE_Y_TOP + candleBaselineYNorm(prevT) * (CANDLE_Y_BOTTOM - CANDLE_Y_TOP)
  const openY = i === 0 ? closeY + 14 : prevCloseY + pseudoNoise(i, 0.9) * 9
  const bodyTop = Math.min(openY, closeY)
  const bodyBottom = Math.max(openY, closeY)
  const bodyH = Math.max(3, bodyBottom - bodyTop)
  const wickTop = bodyTop - Math.max(4, 10 + pseudoNoise(i, 1.7) * 16)
  const wickBottom = bodyBottom + Math.max(4, 10 + pseudoNoise(i, 2.3) * 16)
  // Klassische Candlestick-Konvention: gestiegener Kurs (Close über Open,
  // also kleineres y) hohl/nur Kontur, gefallener Kurs voll gefüllt.
  const up = closeY < openY
  return { wickTop, wickBottom, bodyTop, bodyH, up }
})

/**
 * Wächst beim Durchscrollen der umgebenden Sektion von der Grundlinie aus
 * auf — ein scrub-Reveal (siehe scroll-storytelling-Skill, Pattern 1), kein
 * fest getimtes Abspielen: Fortschritt entspricht exakt der Scrollposition,
 * rückwärts scrollen zieht die Kerzen also auch wieder ein.
 *
 * `attr`-Tweens auf y/height/y1 statt transform+scaleY: dafür bräuchte es
 * `transform-box: fill-box`, damit sich SVG-Formen um die eigene Mitte statt
 * um den Ursprung des `<svg>` skalieren — das direkte Animieren der
 * Geometrie selbst kommt ganz ohne diese Sonderregel aus.
 */
/** Dekorativer Ablesewert zur gehoverten Kerze — aus ihrer eigenen Geometrie
    abgeleitet, damit Server- und Client-Render identisch bleiben. */
function candleValue(i: number) {
  const c = CANDLES[i]
  return Math.round(2400 + (CANDLE_Y_BOTTOM - c.wickBottom) * 6 + (c.wickBottom - c.wickTop) * 4)
}

function AnalyseCandles() {
  const still = useReducedMotion()
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const wickRefs = useRef<(SVGLineElement | null)[]>([])
  const bodyRefs = useRef<(SVGRectElement | null)[]>([])
  const [hover, setHover] = useState<number | null>(null)
  const hoverRef = useRef<number | null>(null)

  useEffect(() => {
    if (still) return
    const svg = svgRef.current
    const scene = svg?.closest('section')
    if (!svg || !scene) return

    // Die Kerzen bauen sich auf dem Weg IN die Szene auf und stehen genau
    // dann fertig, wenn das Pinning greift (`top top`) — danach sind sie
    // ruhiger Hintergrund für die vier Schritte, statt weiter zu wachsen.
    //
    // scaleY statt y/height/y1 als animierte Attribute: Wick und Body stehen
    // im Markup jetzt bereits in ihrer FINALEN Geometrie (siehe JSX unten),
    // mit `transform-box: fill-box`/`transform-origin` an der eigenen
    // Grundlinie — „wachsen" heißt hier nur noch scaleY 0→1 auf derselben
    // Form, keine Attribut-Mutation mehr pro Frame. GSAP schreibt scaleY als
    // reine CSS-`transform`-Property (Compositor, kein SVG-Reflow), y/height/
    // y1 als Geometrie-Attribute erzwingen dagegen bei JEDER Änderung ein
    // Layout — bei 52 Kerzen à zwei Formen macht genau das beim
    // Durchscrollen den Unterschied zwischen ruckelfrei und spürbarem
    // Stottern. (Nebeneffekt: die Kerzenkörper wachsen jetzt von ihrer
    // EIGENEN Grundlinie statt vom etwas tieferen Docht-Ende aus — bei der
    // ohnehin gestaffelten/gejitterten Reveal-Animation nicht wahrnehmbar.)
    const tl = gsap.timeline({
      scrollTrigger: { trigger: scene, start: 'top bottom', end: 'top top', scrub: true },
    })

    CANDLES.forEach((_, i) => {
      const wick = wickRefs.current[i]
      const body = bodyRefs.current[i]
      if (!wick || !body) return
      gsap.set([wick, body], { scaleY: 0 })
      // Enger gestaffelt (statt strikt links-nach-rechts) und mit leichtem
      // Jitter statt gleichmäßigem Abstand — wirkt weniger wie ein sauberer
      // Sweep, mehr wie ungleichmäßiges Aufflackern.
      const pos = Math.max(0, i * 0.07 + Math.sin(i * 1.9) * 0.02)
      // Ein Tween für beide Formen (statt je einem) — dieselbe Dauer/Position,
      // GSAP animiert ein Array gleich behandelter Ziele in einem Schritt.
      tl.to([wick, body], { scaleY: 1, duration: 0.6, ease: 'none' }, pos)
    })

    return () => {
      tl.scrollTrigger?.kill()
      tl.kill()
    }
  }, [still])

  /*
   * Hover wird NICHT per pointer-events an den Kerzen selbst erkannt, sondern
   * aus der Zeigerposition über der ganzen Szene berechnet — wie das
   * Fadenkreuz eines echten Charts. Grund: die Kerzen liegen hinter der
   * Textspalte und der Karte, deren Kästen den Zeiger abfangen würden; an
   * ihnen selbst zu lauschen träfe nur die schmalen Ränder links und rechts.
   * Über Text/Karte wird die Hervorhebung bewusst zurückgenommen — dort soll
   * gelesen und nicht gespielt werden.
   */
  useEffect(() => {
    const wrap = wrapRef.current
    const host = wrap?.parentElement
    if (!wrap || !host) return

    const set = (v: number | null) => {
      if (v === hoverRef.current) return
      hoverRef.current = v
      setHover(v)
    }
    const onMove = (e: PointerEvent) => {
      const target = e.target as Element | null
      if (target?.closest?.('.analyse-copy, .split-card')) {
        set(null)
        return
      }
      const r = wrap.getBoundingClientRect()
      if (!r.width) return
      const rel = (e.clientX - r.left) / r.width
      if (rel < 0 || rel > 1) {
        set(null)
        return
      }
      set(Math.max(0, Math.min(CANDLE_COUNT - 1, Math.floor(rel * CANDLE_COUNT))))
    }
    const onLeave = () => set(null)

    host.addEventListener('pointermove', onMove)
    host.addEventListener('pointerleave', onLeave)
    return () => {
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  const hoveredX = hover === null ? 0 : (CANDLE_W / CANDLE_COUNT) * (hover + 0.5)
  const hoveredTop = hover === null ? 0 : CANDLES[hover].wickTop

  return (
    <div
      ref={wrapRef}
      aria-hidden
      style={{ position: 'absolute', left: 0, right: 0, top: '6%', height: '88%', pointerEvents: 'none' }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CANDLE_W} ${CANDLE_H}`}
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        {hover !== null && (
          <line
            x1={hoveredX}
            x2={hoveredX}
            y1={0}
            y2={CANDLE_H}
            stroke={C.goldInk}
            strokeWidth={1}
            strokeDasharray="4 6"
            opacity={0.32}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {CANDLES.map((c, i) => {
          const x = (CANDLE_W / CANDLE_COUNT) * (i + 0.5)
          const bodyW = (CANDLE_W / CANDLE_COUNT) * 0.72
          const on = hover === i
          const tone = on ? C.goldInk : C.inkFaint
          return (
            /*
              x1/x2/y1/y2 bzw. x/y/width/height stehen jetzt IMMER in ihrer
              finalen Geometrie (siehe scaleY-Kommentar im useEffect oben) —
              nur noch `transform: scaleY()` wächst/schrumpft die Form,
              verankert an ihrer eigenen Grundlinie (`transform-box: fill-box`,
              `transform-origin` unten). GSAP schreibt scaleY pro Frame,
              React fasst hier nur noch stroke/fill/opacity beim Hover an —
              die WACHSTUMS-Property (`transform`) bleibt für React unangetastet,
              ein Hover setzt den Aufbau-Fortschritt der Kerze also nicht zurück.
            */
            <g key={i} opacity={on ? 0.5 : 0.15} style={{ transition: 'opacity .18s ease' }}>
              <line
                ref={(el) => {
                  wickRefs.current[i] = el
                }}
                x1={x}
                x2={x}
                y1={c.wickTop}
                y2={c.wickBottom}
                strokeWidth={1.6}
                vectorEffect="non-scaling-stroke"
                style={{
                  transformBox: 'fill-box',
                  transformOrigin: '50% 100%',
                  // Default vor dem ersten Effekt-Lauf schon kollabiert
                  // (nicht `undefined`/scaleY(1)) — sonst blitzen die fertig
                  // gebauten Kerzen einen Frame lang auf, bevor `gsap.set`
                  // sie herunterskaliert (bei reduzierter Bewegung läuft
                  // dieser Effekt gar nicht, dort bleibt scaleY(1) final).
                  transform: still ? 'scaleY(1)' : 'scaleY(0)',
                  stroke: tone,
                  transition: 'stroke .18s ease',
                }}
              />
              <rect
                ref={(el) => {
                  bodyRefs.current[i] = el
                }}
                x={x - bodyW / 2}
                y={c.bodyTop}
                width={bodyW}
                height={c.bodyH}
                strokeWidth={c.up ? 1.6 : 0}
                vectorEffect="non-scaling-stroke"
                style={{
                  transformBox: 'fill-box',
                  transformOrigin: '50% 100%',
                  // Default vor dem ersten Effekt-Lauf schon kollabiert
                  // (nicht `undefined`/scaleY(1)) — sonst blitzen die fertig
                  // gebauten Kerzen einen Frame lang auf, bevor `gsap.set`
                  // sie herunterskaliert (bei reduzierter Bewegung läuft
                  // dieser Effekt gar nicht, dort bleibt scaleY(1) final).
                  transform: still ? 'scaleY(1)' : 'scaleY(0)',
                  // "Hohle" (gestiegene) Kerzen bekommen keinen echten
                  // Transparent-Körper — sie werden mit der Seitenfarbe
                  // gefüllt, genau wie in echten Chart-Bibliotheken. Sonst
                  // schiene der Docht (dahinterliegend im selben <g>) als
                  // Linie durch den Körper, weil `fill: none` ihn nicht
                  // verdeckt.
                  fill: c.up ? C.parchment : tone,
                  stroke: c.up ? tone : 'none',
                  transition: 'fill .18s ease, stroke .18s ease',
                }}
              />
            </g>
          )
        })}
      </svg>

      {hover !== null && (
        <span
          style={{
            position: 'absolute',
            left: `${(hoveredX / CANDLE_W) * 100}%`,
            top: `${(hoveredTop / CANDLE_H) * 100}%`,
            transform: 'translate(-50%, -150%)',
            padding: '5px 10px',
            borderRadius: '999px',
            border: `1px solid ${C.rule}`,
            backgroundColor: 'rgba(244,239,228,.94)',
            fontFamily: F.mono,
            fontSize: '10px',
            whiteSpace: 'nowrap',
            color: C.inkSubtle,
          }}
        >
          {candleValue(hover).toLocaleString('de-DE')} €
        </span>
      )}
    </div>
  )
}

// ── III · Die Analyse: Karten-Visualisierungen ───────────────────────────────

/*
 * Vier dunkle Karten, je eine pro Listenpunkt der Analyse-Sektion (siehe
 * AnalyseReveal). Alle Werte sind fest notierte Demo-Daten wie im übrigen
 * Mockup — deterministisch statt Math.random(), sonst wiche der erste
 * Client-Render vom Server-Render ab (Hydration-Mismatch).
 */

/** Gemeinsame Hülle: die feste Mindesthöhe verhindert, dass die Spalte beim
    Kartenwechsel springt, weil die vier Grafiken unterschiedlich hoch sind. */
function AnalyseCardShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      aria-hidden
      style={{
        backgroundColor: C.onyxWarm,
        // Helle Haarlinie statt der früheren dunklen: im Stapel liegen dunkle
        // Karten übereinander, eine dunkle Kante verschwände darin und der
        // Stapel sähe aus wie ein einziger grauer Block.
        border: `1px solid ${C.ruleOn}`,
        padding: 'clamp(22px, 3vw, 30px)',
        boxShadow: '0 30px 70px -28px rgba(26,26,26,.38)',
        minHeight: '330px',
        // Füllt im Stapel die feste Deck-Höhe (siehe .analyse-deck), damit
        // alle vier Karten exakt deckungsgleich übereinanderliegen; im
        // mobilen Fallback steht die Höhe auf auto und minHeight greift.
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <p style={{ ...kicker, fontSize: '10px', color: C.onSubtle, margin: '0 0 22px' }}>{title}</p>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {children}
      </div>
    </div>
  )
}

/* 01 — Ausgaben-Heatmap im GitHub-Stil, mit GuV-Modus. Divergierende Skala:
   Terrakotta für Verlust-, Olive für Gewinntage, neutral für ruhige Tage. */
const GUV_COLS = 18
const GUV_ROWS = 7
const GUV_NEG = ['#3A231B', '#6B3427', '#8E4634', '#A9553C']
const GUV_POS = ['#2C3826', '#41522F', '#5B6E4B', '#8CA277']
const GUV_ZERO = '#232320'
const GUV_CELLS = Array.from({ length: GUV_COLS * GUV_ROWS }, (_, i) => {
  const w = Math.sin(i * 0.7) * 2 + Math.cos(i * 1.9) * 1.6 + Math.sin(i * 0.23) * 1.2
  return Math.max(-4, Math.min(4, Math.round(w)))
})
function guvColor(v: number) {
  if (v === 0) return GUV_ZERO
  return v < 0 ? GUV_NEG[Math.min(3, -v - 1)] : GUV_POS[Math.min(3, v - 1)]
}

function CardHeatmap() {
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

function CardSankey() {
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
  const d = i + 1
  return Math.round(Math.sin(d * 1.3) * 60 + Math.cos(d * 0.7) * 40 + Math.sin(d * 2.9) * 25)
})
function calColor(v: number) {
  const a = (0.16 + Math.min(1, Math.abs(v) / 90) * 0.56).toFixed(2)
  if (v > 12) return `rgba(140,162,119,${a})`
  if (v < -12) return `rgba(169,85,60,${a})`
  return 'rgba(232,224,208,.06)'
}

function CardCalendar() {
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

/* 04 — Divergierende Balken: Ausgaben nach links, Einnahmen nach rechts, um
   eine gemeinsame Nulllinie.
 *
 * Die Nulllinie sitzt NICHT mittig, sondern teilt die Balkenfläche im
 * Verhältnis der beiden Maxima (1.200 zu 3.800). Dadurch gilt links wie
 * rechts derselbe Maßstab — ein Euro ist auf beiden Seiten gleich breit —
 * und trotzdem füllt jede Seite ihre Hälfte aus. Bei starr mittiger Achse
 * müsste sich die Ausgabenseite denselben Maßstab mit dem viermal größeren
 * Gehalt teilen und bliebe als kaum sichtbarer Stummel übrig.
 */
const DIVERGING_NEG_MAX = 1200
const DIVERGING_POS_MAX = 3800
const DIVERGING = [
  { cat: 'Gehalt', val: 3800 },
  { cat: 'Freelance', val: 950 },
  { cat: 'Wohnen', val: -1200 },
  { cat: 'Lebensmittel', val: -480 },
  { cat: 'Mobilität', val: -320 },
  { cat: 'Freizeit', val: -180 },
]

function CardDiverging() {
  const still = useReducedMotion()
  return (
    <div>
      {DIVERGING.map((d, i) => {
        const income = d.val > 0
        const pct = (Math.abs(d.val) / (income ? DIVERGING_POS_MAX : DIVERGING_NEG_MAX)) * 100
        const color = income ? C.oliveLight : C.terracotta
        const bar = (
          <m.div
            initial={still ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: still ? 0 : 0.7, delay: still ? 0 : 0.05 * i, ease: EASE }}
            style={{
              height: '100%',
              width: `${pct}%`,
              backgroundColor: color,
              opacity: 0.85,
              transformOrigin: income ? 'left center' : 'right center',
            }}
          />
        )
        return (
          <div key={d.cat} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <span style={{ fontSize: '10px', color: C.onSubtle, width: '76px', textAlign: 'right', flexShrink: 0 }}>
              {d.cat}
            </span>
            <div style={{ flex: 1, display: 'flex', height: '13px' }}>
              <div style={{ flexGrow: DIVERGING_NEG_MAX, flexBasis: 0, display: 'flex', justifyContent: 'flex-end' }}>
                {!income && bar}
              </div>
              <span style={{ width: '1px', backgroundColor: C.ruleOn, flexShrink: 0 }} />
              <div style={{ flexGrow: DIVERGING_POS_MAX, flexBasis: 0 }}>{income && bar}</div>
            </div>
            <span style={{ fontFamily: F.mono, fontSize: '11px', color, width: '58px', textAlign: 'right' }}>
              {income ? '+' : '−'}
              {Math.abs(d.val).toLocaleString('de-DE')}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Die vier Karten in Listenreihenfolge — Index = Index des Listenpunkts. */
const ANALYSE_CARDS = [
  { title: 'Ausgaben-Heatmap · GuV-Modus', body: <CardHeatmap /> },
  { title: 'Geldfluss · Sankey', body: <CardSankey /> },
  { title: 'Cashflow-Kalender', body: <CardCalendar /> },
  { title: 'Einnahmen & Ausgaben', body: <CardDiverging /> },
]

/*
 * Kartenstapel: nicht eine Karte, die gegen die nächste ausgetauscht wird,
 * sondern alle vier gleichzeitig im Bild — die aktive vorn, die folgenden
 * gestaffelt dahinter, die erledigten nach links weggeräumt. Man sieht
 * dadurch jederzeit, wie viel noch kommt, statt die Karten nur einzeln
 * aufblitzen zu sehen.
 *
 * Die zurückliegenden Karten bleiben mit sehr geringer Deckkraft stehen
 * (statt ganz zu verschwinden), damit der Stapel beim Zurückscrollen nicht
 * aus dem Nichts wieder auftaucht.
 */
function deckGeometry(d: number) {
  if (d === 0) return { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1, z: 40 }
  if (d > 0) {
    return {
      x: 34 + (d - 1) * 26,
      y: -18 - (d - 1) * 13,
      scale: 1 - d * 0.05,
      rotate: 2 * Math.min(d, 3),
      opacity: Math.max(0.2, 0.66 - (d - 1) * 0.2),
      z: 40 - d,
    }
  }
  return { x: -38 + d * 10, y: 16, scale: 0.9, rotate: -2.6, opacity: 0.16, z: 40 + d }
}

function AnalyseDeck({ active, onSelect }: { active: number; onSelect: (i: number) => void }) {
  const still = useReducedMotion()
  // Vor dem ersten Schritt liegt bereits Karte 01 vorn — der Stapel ist so
  // schon beim Heranscrollen als Vorschau lesbar.
  const front = Math.max(0, active)

  return (
    <div className="analyse-deck">
      {ANALYSE_CARDS.map((card, i) => {
        const d = i - front
        const g = deckGeometry(d)
        const isFront = d === 0
        return (
          <m.div
            key={card.title}
            className="analyse-deck-card"
            animate={{ x: g.x, y: g.y, scale: g.scale, rotate: g.rotate, opacity: g.opacity }}
            transition={still ? { duration: 0 } : { type: 'spring', stiffness: 210, damping: 26, mass: 0.8 }}
            style={{ zIndex: g.z }}
          >
            {/*
              Die hinteren Karten sind selbst anklickbar (nicht nur der
              Listenpunkt links) — der sichtbare Rand einer Karte ist das
              naheliegendste Ziel, wenn man „die da" sehen will. Die vordere
              Karte ist kein Button: sie ist bereits das Ziel.
            */}
            {isFront ? (
              <AnalyseCardShell title={card.title}>{card.body}</AnalyseCardShell>
            ) : (
              <button
                type="button"
                className="analyse-deck-btn"
                onClick={() => onSelect(i)}
                aria-label={`Zu „${ANALYSE_ITEMS[i]}" springen`}
              >
                <AnalyseCardShell title={card.title}>{card.body}</AnalyseCardShell>
              </button>
            )}
          </m.div>
        )
      })}
    </div>
  )
}

// ── III · Die Analyse: gepinnte Schritt-Erzählung ────────────────────────────

/** Ab hier läuft die Analyse-Sektion als gepinnte Erzählung (siehe
    AnalyseReveal); darunter bleibt die bestehende zweispaltige Darstellung
    unverändert. Gleiche Schwelle wie beim Säulen-Karussell. */
const ANALYSE_MIN_WIDTH = 1024
/** Scrollstrecke pro Listenpunkt — lang genug, um die Grafik zu erfassen. */
const ANALYSE_STEP_VH = 65
/** Nachlauf, damit der vierte Punkt nicht im selben Moment abreißt, in dem er
    fertig aufgebaut ist. */
const ANALYSE_OUTRO_VH = 30

const ANALYSE_ITEMS = [
  'Ausgaben-Heatmap im GitHub-Stil, mit GuV-Modus',
  'Sankey-Diagramm für die vollständige Geldfluss-Visualisierung',
  'Interaktiver Cashflow-Kalender — Popup direkt am Tag',
  'Divergierende Balken für Einnahmen und Ausgaben',
]

const ANALYSE_SCROLL_VH = ANALYSE_STEP_VH * ANALYSE_ITEMS.length + ANALYSE_OUTRO_VH
const ANALYSE_SCENE_VH = 100 + ANALYSE_SCROLL_VH

const ANALYSE_LEAD_WORDS = (
  'Der Analyse-Tab verwandelt rohe Transaktionsdaten in aussagekräftige Bilder. ' +
  'Saisonale Muster werden sichtbar, Geldflüsse nachvollziehbar — und damit die ' +
  'Frage beantwortbar, wohin das Geld wirklich geht.'
).split(' ')

/**
 * „Die Analyse" als gepinnte Schritt-Erzählung ab ANALYSE_MIN_WIDTH: die
 * Sektion bleibt stehen, während nacheinander 01–04 hervorgehoben werden und
 * die dunkle Karte zur jeweils passenden Visualisierung wechselt. Erst danach
 * scrollt die Seite weiter.
 *
 * Dieselbe Halte-Technik wie PillarsReveal/PedimentReveal: zusätzliche
 * Scrollstrecke an der Sektion plus ein `position: sticky`-Kind statt GSAP-
 * `pin` (erspart dessen Pin-Spacer-DOM).
 *
 * Anders als beim Säulen-Karussell geht der Schritt-Index bewusst DOCH über
 * React-State: er ändert sich nur viermal über die ganze Szene (nicht pro
 * Frame), und die Karten sind eigene Komponenten — imperatives DOM-Schreiben
 * brächte hier nichts. Der fortlaufende Teil (die Wörter des Einleitungs-
 * satzes) läuft dagegen wie gewohnt direkt über GSAP.
 */
function AnalyseReveal() {
  const still = useReducedMotion()
  const sceneRef = useRef<HTMLElement>(null)
  const leadRef = useRef<HTMLParagraphElement>(null)
  const [step, setStep] = useState(-1)
  const stepRef = useRef(-1)

  useEffect(() => {
    if (still) return
    const scene = sceneRef.current
    const lead = leadRef.current
    if (!scene || !lead) return

    const mm = gsap.matchMedia()
    mm.add(`(min-width: ${ANALYSE_MIN_WIDTH}px)`, () => {
      /*
       * Einleitungssatz: die Wörter hellen beim Heranscrollen nacheinander
       * auf und dunkeln beim Zurückscrollen wieder ab (scrub). Der Startwert
       * wird hier per JS gesetzt, NICHT im Markup — sonst stünde der Satz
       * unterhalb von ANALYSE_MIN_WIDTH und bei reduzierter Bewegung, wo
       * diese Timeline nie läuft, dauerhaft ausgegraut da.
       *
       * Der Aufhell-Lauf sitzt bewusst in der hinteren Hälfte des Fensters:
       * die erste Hälfte vergeht, während der Satz noch unter der Falz nach
       * oben wandert — dort wäre die Animation schlicht nicht zu sehen.
       */
      const words = gsap.utils.toArray<HTMLElement>('.analyse-word', lead)
      gsap.set(words, { opacity: 0.24 })
      const introTl = gsap.timeline({
        scrollTrigger: { trigger: scene, start: 'top bottom', end: 'top top', scrub: true },
      })
      words.forEach((w, i) => {
        introTl.to(w, { opacity: 1, duration: 0.1, ease: 'none' }, 0.45 + (i / words.length) * 0.5)
      })

      const applyStep = (next: number) => {
        if (next === stepRef.current) return
        stepRef.current = next
        setStep(next)
      }
      const pin = ScrollTrigger.create({
        trigger: scene,
        start: 'top top',
        end: 'bottom bottom',
        scrub: true,
        onUpdate: (self) => {
          const scrolled = self.progress * ANALYSE_SCROLL_VH
          applyStep(Math.min(ANALYSE_ITEMS.length - 1, Math.floor(scrolled / ANALYSE_STEP_VH)))
        },
        // Oberhalb der Szene zurück zur Übersichtskarte — ohne das bliebe
        // beim Hochscrollen der zuletzt erreichte Schritt hervorgehoben.
        onLeaveBack: () => applyStep(-1),
      })

      return () => {
        introTl.scrollTrigger?.kill()
        introTl.kill()
        pin.kill()
        gsap.set(words, { clearProps: 'opacity' })
        applyStep(-1)
      }
    })

    return () => mm.revert()
  }, [still])

  /**
   * Springt zu der Scrollposition, an der Schritt `i` vorn steht — gezielt in
   * dessen Mitte, damit man nicht auf der Kante zum nächsten landet.
   *
   * `scrollDistance <= 0` erkennt zuverlässig, ob die Szene überhaupt gepinnt
   * läuft: unterhalb von ANALYSE_MIN_WIDTH und bei reduzierter Bewegung
   * bleibt .analyse-scene per CSS auf `height: auto` (siehe landing.css) und
   * ist nie höher als der Viewport — dort sind ohnehin alle vier Karten
   * gleichzeitig zu sehen, ein Sprung ergäbe keinen Sinn.
   */
  const jumpToStep = (i: number) => {
    const scene = sceneRef.current
    if (!scene) return
    const scrollDistance = scene.offsetHeight - window.innerHeight
    if (scrollDistance <= 0) return
    const sceneTop = scene.getBoundingClientRect().top + window.scrollY
    const targetVh = (i + 0.5) * ANALYSE_STEP_VH
    scrollToY(sceneTop + (targetVh / ANALYSE_SCROLL_VH) * scrollDistance)
  }

  return (
    <section
      ref={sceneRef}
      data-section-marker="III"
      className="analyse-scene"
      style={{
        ['--analyse-scene-h' as string]: `${ANALYSE_SCENE_VH}vh`,
        padding: `${SPACE.section} ${SPACE.gutter}`,
        position: 'relative',
      }}
    >
      <div className="analyse-sticky">
        <AnalyseCandles />
        <div
          className="g-split"
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: '1080px',
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'clamp(40px, 6vw, 80px)',
            alignItems: 'center',
          }}
        >
          <Reveal className="analyse-copy">
            <SectionHead index="III" label="Die Analyse" title="Ausgaben in einem ganz neuen Licht." align="left" />
            <p
              ref={leadRef}
              style={{
                fontFamily: F.serif,
                fontSize: '16px',
                lineHeight: 1.85,
                color: C.inkBody,
                margin: '22px 0 28px',
              }}
            >
              {ANALYSE_LEAD_WORDS.map((w, i) => (
                // Bewusst KEIN inline-block: als reine Inline-Spans brechen
                // die Wörter ganz normal um; ein Transform wird hier ohnehin
                // nicht animiert, nur die Deckkraft.
                <span key={i} className="analyse-word">
                  {w}{' '}
                </span>
              ))}
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, borderTop: `1px solid ${C.ruleSoft}` }}>
              {ANALYSE_ITEMS.map((item, i) => {
                const active = step === i
                // step === −1: Übersicht bzw. Fallback ohne gepinnte Szene —
                // dort ist kein Punkt „dran", also alle gleich present.
                const neutral = step === -1
                return (
                  <li
                    key={item}
                    style={{
                      position: 'relative',
                      borderBottom: `1px solid ${C.ruleSoft}`,
                      opacity: neutral || active ? 1 : 0.34,
                      transition: 'opacity .4s ease',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute',
                        left: '-16px',
                        top: '50%',
                        width: '3px',
                        height: active ? '56%' : '0%',
                        backgroundColor: C.goldInk,
                        transform: 'translateY(-50%)',
                        transition: 'height .4s ease',
                      }}
                    />
                    {/* Jeder Punkt ist anklickbar und springt an die Stelle,
                        an der er vorn steht — dieselbe Idee wie beim
                        Säulen-Karussell (siehe jumpToPillar): „hinspringen"
                        heißt schlicht, dorthin zu scrollen, wo dieser Schritt
                        aktiv wäre. */}
                    <button
                      type="button"
                      className="analyse-step-btn"
                      onClick={() => jumpToStep(i)}
                      style={{ display: 'flex', gap: '16px', alignItems: 'baseline', width: '100%', padding: '14px 0' }}
                    >
                      <span
                        style={{
                          fontFamily: F.mono,
                          fontSize: '11px',
                          color: active ? C.goldInkDeep : C.goldInk,
                          flexShrink: 0,
                          transition: 'color .4s ease',
                        }}
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span
                        style={{
                          fontFamily: F.serif,
                          fontSize: '14px',
                          lineHeight: 1.7,
                          textAlign: 'left',
                          color: active ? C.ink : C.inkBody,
                          transition: 'color .4s ease',
                        }}
                      >
                        {item}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </Reveal>

          <Reveal delay={0.1} className="split-card">
            <AnalyseDeck active={step} onSelect={jumpToStep} />
          </Reveal>
        </div>
      </div>
    </section>
  )
}

// ── Kennzahlen ────────────────────────────────────────────────────────────────

/**
 * Vier Kennzahlen, die beim Durchscrollen der Mockup-Szene nacheinander um die
 * Säule rotieren (siehe MockColumn). Lagen früher zusätzlich in einem
 * gebogenen Onyx-Band direkt darunter — dieselben vier Zahlen zweimal kurz
 * hintereinander hätten die Wirkung halbiert, deshalb trägt sie jetzt nur
 * noch die Säule.
 */
const STATS = [
  { value: '360°', label: 'Finanzüberblick' },
  { value: '8+', label: 'Analysetools' },
  { value: '∞', label: 'Transaktionen' },
  { value: '24/7', label: 'Echtzeitdaten' },
]

// ── Giebel-Enthüllung ─────────────────────────────────────────────────────────

/*
 * Die Szene läuft in vier Phasen, alle in vh Scrollstrecke bemessen und erst
 * am Ende in Timeline-Anteile umgerechnet (siehe `p()`). Absolute vh statt
 * direkt notierter Progress-Anteile, weil jede Änderung an einer Phase sonst
 * stillschweigend das Tempo ALLER anderen verschiebt: ein Anteil ist immer
 * relativ zur Gesamtlänge, vh sind es nicht.
 */
/** Giebel öffnet sich und gibt das Dashboard frei. */
const OPEN_VH = 115
/** Dashboard steht einen Moment still, bevor die Säule kommt. */
const HOLD_VH = 45
/**
 * Die vier Kennzahlen rotieren um die Säule. Vier Schritte à 90°, nicht drei:
 * die Säule steht bewusst LEER da (siehe COLUMN_START_DEG), die erste
 * Kennzahl muss also erst noch hereingedreht werden. Die Säule selbst fährt
 * NICHT mehr separat von unten ein (kein eigener Enter-Schritt mehr) — sie
 * blendet stattdessen sanft ein (siehe COLUMN_FADE_VH), sobald der Halteweg
 * beginnt, statt vorher noch leer hochzufahren.
 */
const COLUMN_ROTATE_VH = 220
/**
 * Dauer der Einblendung der Säule (siehe Tween in der Timeline unten) — läuft
 * INNERHALB des Rotationswegs, braucht keinen eigenen Anteil an TOTAL_VH: bei
 * COLUMN_START_DEG steht die erste Zahl ohnehin noch unsichtbar auf der
 * Silhouettenkante, die Blende ist also längst vorbei, bevor überhaupt etwas
 * zu lesen wäre.
 */
const COLUMN_FADE_VH = 20
/** Letzte Kennzahl steht, bevor die Seite weiterläuft. */
const COLUMN_OUTRO_VH = 30

/** Gesamte Scrollstrecke der Szene (ohne die 100vh, die das Pinning „frisst"). */
const TOTAL_VH = OPEN_VH + HOLD_VH + COLUMN_ROTATE_VH + COLUMN_OUTRO_VH
/**
 * Auf schmalen Displays entfällt die Säule (siehe .mock-column) — die Szene
 * endet dort nach dem Halteweg. Ohne diese Kürzung bliebe die Säulenstrecke
 * als reine Leerstrecke stehen: gut 240vh Scrollen, bei dem sichtbar nichts
 * passiert.
 */
const MOBILE_TOTAL_VH = OPEN_VH + HOLD_VH
/** Ab hier trägt das Layout die Säule (dieselbe Grenze wie in landing.css). */
const COLUMN_MIN_WIDTH = 900

/** Höhe des Abschnitts: Scrollstrecke plus die vom sticky Kind belegte Viewporthöhe. */
const SCENE_VH = 100 + TOTAL_VH
const MOBILE_SCENE_VH = 100 + MOBILE_TOTAL_VH

/** vh → Anteil der Timeline-Gesamtdauer (Timeline läuft normalisiert von 0 bis 1). */
const p = (vh: number) => vh / TOTAL_VH
/** Dasselbe für die verkürzte Fassung — dort ist der Nenner ein anderer. */
const pMobile = (vh: number) => vh / MOBILE_TOTAL_VH

/**
 * Vorzieh-Überlappung in den Hero hinein: die Szene beginnt bereits, während
 * noch ein Rest des Hero sichtbar ist, statt erst nach dessen vollständigem
 * Verschwinden. Negativer margin-top auf die Szene zieht ihren Startpunkt um
 * diesen Betrag nach oben — sie überlappt den unteren Rand des Hero, ohne
 * dessen eigene Höhe oder Inhalte zu verändern.
 */
const PULL_INTO_HERO_VH = 42

/**
 * Ein Tempelgiebel wächst beim Scrollen aus der Bildschirmmitte und gibt das
 * Dashboard frei.
 *
 * Alle drei Eckpunkte laufen bei v=0 in einem einzigen Punkt in der
 * Bildschirmmitte (50%, 50%) zusammen — ein Dreieck der Größe null. Mit
 * wachsendem v spreizen sie sich symmetrisch um diesen Mittelpunkt: die
 * Spitze nach oben, die Basis nach unten und seitlich. So wächst die Form
 * sichtbar aus der Mitte, statt von der unteren Bildschirmkante aus
 * hochzuwachsen.
 *
 * `x%`/`y%` in `clip-path: polygon()` sind IMMER relativ zur eigenen Achse
 * (x zur Breite, y zur Höhe der Box) — ein früherer, einzelner Prozentwert
 * für beide Achsen ergab dadurch je nach Bildschirm ein komplett anderes
 * Dreieck: auf einem breiten Desktop-Fenster (Breite > Höhe) zufällig ein
 * flaches, giebeltypisches Dreieck, auf einem hohen Mobil-Portrait (Höhe >
 * Breite) dagegen einen schmalen, spitzen Nadel-Umriss — derselbe Giebel sah
 * abhängig vom Gerät völlig anders aus, statt überall gleich zu wirken.
 *
 * PEDIMENT_ASPECT fixiert das Seitenverhältnis der Form selbst, unabhängig
 * vom Viewport — 16:9 trifft ein typisch breites Desktop-Browserfenster,
 * für einen Viewport nahe diesem Verhältnis ändert sich gegenüber der alten
 * Rechnung praktisch nichts (siehe clipPathAt), erst auf stark abweichenden
 * Formaten (Mobil-Portrait) greift die Korrektur und hält die Form bei
 * ihrem Seitenverhältnis statt sie zu strecken.
 */
const PEDIMENT_ASPECT = 16 / 9
/**
 * Wie weit die Dreiecksecken bei v=1 über die jeweilige Bildschirmhälfte
 * hinausschießen müssen — ein Dreieck, dessen Ecken exakt auf den
 * Viewport-Ecken liegen, deckt die Fläche NICHT ab (die schrägen Kanten
 * schneiden die oberen Ecken weg). Faktor statt fester Prozentwert (früher
 * Q=167 gegen die dafür nötigen 50 Einheiten Mindestreichweite), damit er
 * unabhängig von der tatsächlichen Bildschirmgröße dieselbe Wirkung hat.
 */
const PEDIMENT_OVERSHOOT = 167 / 50

/**
 * Fries und Kranz sind FEST sichtbar, ohne jede Fade-in-Animation — auch
 * ganz am Anfang, bevor ScrollTrigger überhaupt zu zählen beginnt. Eine an
 * scrollYProgress/GSAP gekoppelte Einblendung hätte hier immer eine
 * Totzone: ScrollTrigger startet erst bei `start:'top top'`, also erst
 * PULL_INTO_HERO_VH Scroll-vh NACH Seitenanfang der Szene — bis dahin bliebe
 * die Fläche leer, obwohl beide Elemente längst gefahrlos sichtbar sein
 * könnten. Stattdessen positioniert sich die Gruppe per Layout knapp
 * UNTERHALB der Hero-Überlappung (siehe .pediment-intro-Style unten) — schon
 * bei Progress 0 außerhalb der Zone, die während der Überlappung transparent
 * bleiben muss.
 *
 * Blendet dann schnell aus (plus kleiner Lift nach oben), statt in der
 * gepinnten Fläche stehen zu bleiben, bis der wachsende Giebel sie einfach
 * unter sich begräbt: eine sticky-gepinnte Sektion hält den Viewport per
 * Definition fest, ein normales "wegscrollen" gibt es darin nicht.
 *
 * Ein GESTES Wegscrollen (nur Bewegung, keine Blende) würde hier nicht
 * reichen: der Giebel wächst aus der exakten Bildschirmmitte mit fester Rate
 * (siehe clipPathAt) — seine Spitze rast beim Scrollen schneller nach oben, als eine
 * ruhig wirkende Bewegung der Gruppe je mitziehen könnte. Jeder Versuch,
 * „davonzulaufen“, sähe entweder abgehackt aus oder würde die Gruppe ohnehin
 * wieder einholen. Der Ausweg: schon nach ~4vh ist die Gruppe unsichtbar —
 * das Ausblenden gewinnt das Rennen gegen das Wachstum, statt es zu verlieren.
 * Diese 4vh sind bewusst kurz genug, dass die Bewegungsrate unter der
 * Schließrate der Hero-Überlappungszone bleibt; sonst reißt die Gruppe kurz in
 * die Zone hinein, die währenddessen noch transparent bleiben muss.
 *
 * Die konkreten vh-Werte stehen direkt an den Tweens (`scale(4)`, `scale(8)`,
 * `scale(11)`), weil sie je nach Fassung auf eine andere Gesamtlänge normiert
 * werden — siehe `build()` in PedimentReveal.
 */

// ── Kennzahlen-Säule ──────────────────────────────────────────────────────────

/**
 * Winkelabstand der vier Kennzahlen auf dem gedachten Zylinder. 4 × 90° = 360°:
 * steht eine Zahl vorn (θ=0), sitzen ihre Nachbarn exakt auf den Silhouetten-
 * kanten (θ=±90°, dort ist cos=0 → unsichtbar). Es ist also immer genau eine
 * lesbar, ohne dass sich zwei überlagern.
 */
const STAT_STEP_DEG = 90
/**
 * Startwinkel der Drehung: −90° statt 0°. Bei 0° stünde die erste Kennzahl
 * sofort mittig — die Säule käme also schon beschriftet herein. Mit −90°
 * sitzt sie stattdessen auf der rechten Silhouettenkante (cos = 0, also
 * unsichtbar) und muss erst hereingedreht werden: die Säule fährt leer ein
 * und bekommt ihre erste Zahl erst nach einem Stück Scrollen.
 */
const COLUMN_START_DEG = -STAT_STEP_DEG
/**
 * Endwinkel: bei 270° steht die VIERTE Zahl vorn. Zusammen mit dem Start bei
 * −90° ergibt das eine volle Umdrehung (360°) und damit vier Auftritte.
 */
const COLUMN_END_DEG = STAT_STEP_DEG * (STATS.length - 1)

/**
 * Der sichtbare Schaft, auf dem die Beschriftung läuft — als Anteil des
 * Säulenbilds. Kapitell und Basis der gedrehten Säule ragen seitlich über den
 * Schaft hinaus und dürfen keine Schrift tragen; die Werte grenzen genau den
 * geraden Teil dazwischen ein.
 */
const SHAFT_INSET = { top: '11%', bottom: '10%', left: '14%', right: '14%' }

/**
 * Zylinder-Projektion einer Beschriftung, die um die Säule gewickelt ist.
 *
 * Ein Punkt auf einem Zylinder mit Radius r bei Drehwinkel θ erscheint dem
 * Betrachter bei x = r·sin(θ), und die Fläche dort ist um cos(θ) gestaucht —
 * daher `scaleX`. Ohne diese Stauchung liefe die Schrift bloß flach seitwärts
 * und läse sich wie ein Schiebebanner statt wie eine bedruckte Rundung.
 *
 * `depth` macht die Zahl in der Mitte zusätzlich etwas größer als am Rand
 * (gewünschter Effekt: von rechts wachsend hereinkommen, nach links kleiner
 * verschwinden). Die Deckkraft folgt cos steiler als linear, damit die
 * Beschriftung an der Silhouettenkante sauber verschwindet, statt dort als
 * schmaler Strich stehen zu bleiben.
 */
/**
 * Statisches Kennzahlen-Band — der Ersatz überall dort, wo die rotierende
 * Säule nicht läuft: bei reduzierter Bewegung und auf schmalen Displays.
 * Ohne diesen Ersatz gingen die vier Zahlen dort ersatzlos verloren, seit
 * das früher hier stehende gebogene Band entfallen ist.
 */
function StatsBandFallback({ className }: { className?: string }) {
  return (
    <div className={className} style={{ backgroundColor: C.onyx }}>
      <MeanderFrieze id={`frieze-stats-${className ?? 'still'}-top`} color={C.cream} opacity={0.16} />
      <div style={{ ...SHELL, padding: `clamp(48px, 6vw, 76px) ${SPACE.gutter}` }}>
        <div className="g-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
          {STATS.map((s, i) => (
            <div
              key={s.label}
              style={{
                textAlign: 'center',
                borderLeft: i === 0 ? 'none' : `1px solid ${C.ruleOnSoft}`,
                padding: '0 12px',
              }}
            >
              <p
                style={{
                  fontFamily: F.display,
                  fontWeight: 400,
                  fontSize: 'clamp(34px, 5vw, 58px)',
                  lineHeight: 1,
                  color: C.cream,
                  margin: '0 0 12px',
                  letterSpacing: '-0.02em',
                }}
              >
                {s.value}
              </p>
              <p className="af-micro" style={{ ...kicker, fontSize: '10px', color: C.onSubtle, margin: 0 }}>
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>
      <MeanderFrieze id={`frieze-stats-${className ?? 'still'}-bottom`} color={C.cream} opacity={0.16} />
    </div>
  )
}

function cylinderTransform(thetaDeg: number, radius: number) {
  /*
   * Sichtbar nur auf der Vorderseite EINES Umlaufs — geprüft am rohen Winkel,
   * NICHT über cos: cos ist 360°-periodisch, θ=360° liefert exakt dasselbe
   * wie θ=0°. Bei vier Kennzahlen à 90° ergibt ein Umlauf aber genau 360°,
   * die vierte landet beim Startwinkel −90° also rechnerisch bei 360° und
   * stünde damit schon vorn, bevor die Drehung überhaupt beginnt (die Säule
   * kam mit „24/7" herein statt leer). Der rohe Winkel unterscheidet die
   * beiden Fälle, cos kann es nicht.
   */
  if (Math.abs(thetaDeg) >= 90) return null
  const t = (thetaDeg * Math.PI) / 180
  const cos = Math.cos(t)
  if (cos <= 0.02) return null // Silhouettenkante — nichts mehr zu sehen
  const depth = 0.88 + 0.12 * cos
  return {
    transform:
      `translate(-50%, -50%) translateX(${(Math.sin(t) * radius).toFixed(2)}px)` +
      ` scaleX(${(cos * depth).toFixed(4)}) scaleY(${depth.toFixed(4)})`,
    opacity: Math.min(1, cos * 1.5).toFixed(3),
  }
}

/**
 * Giebel-Silhouette bei Fortschritt v (0…1). Skaliert wie `background-size:
 * cover`: die halbe Höhe UND die halbe Breite (im festen PEDIMENT_ASPECT)
 * müssen bei v=1 über die jeweilige Bildschirmhälfte hinausreichen — sonst
 * blieben auf einem stark von 16:9 abweichenden Viewport (z. B. hohes
 * Mobil-Portrait) Parchment-Ecken sichtbar, obwohl der Giebel „fertig offen“
 * sein soll. Die GRÖSSERE der beiden Anforderungen bestimmt deshalb den
 * Maßstab; das Seitenverhältnis selbst bleibt davon unberührt und damit auf
 * jedem Gerät gleich.
 *
 * `window`-Zugriff statt eines übergebenen Werts: läuft aus einem
 * GSAP-`onUpdate` während des Scrollens, `innerWidth`/`innerHeight` live zu
 * lesen macht die Form automatisch robust gegen Größenänderungen (Rotation,
 * einklappende Mobil-Adressleiste), ohne einen eigenen Resize-Listener.
 * `typeof window` schützt nur den SSR-Aufruf mit v=0 unten im JSX ab, wo das
 * Ergebnis ohnehin unabhängig von vw/vh immer derselbe Punkt ist.
 */
const clipPathAt = (v: number) => {
  if (v <= 0) return 'polygon(50% 50%, 50% 50%, 50% 50%)'
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1600
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900
  const halfHeightAtFull = Math.max(vh / 2, vw / 2 / PEDIMENT_ASPECT) * PEDIMENT_OVERSHOOT
  const halfWidthAtFull = halfHeightAtFull * PEDIMENT_ASPECT
  const spreadX = ((halfWidthAtFull * v) / vw) * 100
  const spreadY = ((halfHeightAtFull * v) / vh) * 100
  return `polygon(50% ${50 - spreadY}%, ${50 - spreadX}% ${50 + spreadY}%, ${50 + spreadX}% ${50 + spreadY}%)`
}

function PedimentReveal() {
  const still = useReducedMotion()
  const sceneRef = useRef<HTMLElement>(null)
  const clipRef = useRef<HTMLDivElement>(null)
  const cueRef = useRef<HTMLDivElement>(null)
  const introRef = useRef<HTMLDivElement>(null)
  const columnRef = useRef<HTMLDivElement>(null)
  const shaftRef = useRef<HTMLDivElement>(null)
  const statRefs = useRef<(HTMLDivElement | null)[]>([])

  // Zahlen und Balken erst starten, wenn der Giebel weit genug offen ist
  const [run, setRun] = useState(false)
  /*
   * Welche Dashboard-Szene das Mockup zeigt (siehe MOCK_VIEWS). Zusätzlich
   * als Ref gespiegelt: der Scroll-Handler läuft außerhalb des Render-Zyklus
   * und bräuchte sonst `view` in seinen Closure-Abhängigkeiten — der Ref
   * liefert den aktuellen Stand ohne die Timeline neu aufbauen zu müssen.
   */
  const [view, setView] = useState(0)
  const viewRef = useRef(0)

  /*
   * Getrieben von GSAP ScrollTrigger statt Framer-Motion-Scroll-Hooks (siehe
   * scroll-storytelling-Skill, Muster „Pin-and-play“): die Kopplung an Lenis
   * (siehe SmoothScrollProvider) hält das Beschneiden exakt synchron zum
   * sichtbaren, gedämpften Scroll. `scrub: true` bindet den Fortschritt
   * direkt an die Scrollposition statt an einen einmaligen Trigger — beim
   * Zurückscrollen läuft alles exakt rückwärts.
   *
   * clip-path wird bewusst nicht direkt von GSAP getweent, sondern über eine
   * numerische Zwischengröße `state.v` plus manuellem `onUpdate`: die
   * String-Interpolation eines mehrteiligen polygon() ist kein Fall, den
   * GSAPs CSS-Plugin zuverlässig abdeckt, ein Zahlenwert schon.
   */
  useEffect(() => {
    if (still) return
    const scene = sceneRef.current
    const clip = clipRef.current
    if (!scene || !clip) return

    /*
     * Zwei Fassungen derselben Szene, per gsap.matchMedia an die Breite
     * gebunden: mit Säule (breit) und ohne (schmal). matchMedia statt eines
     * eigenen resize-Listeners, weil es die Timeline beim Breitenwechsel
     * selbst abräumt und neu aufbaut — `mm.revert()` im Cleanup genügt für
     * beide Fassungen und für React Strict Mode.
     *
     * Der einzige inhaltliche Unterschied ist die Säulenphase; alles davor
     * ist identisch, nur eben auf eine andere Gesamtlänge normiert (`scale`).
     */
    const build = (withColumn: boolean) => {
      const scale = withColumn ? p : pMobile
      const state = { v: 0, phi: COLUMN_START_DEG }
      let hasRun = false

      /*
       * Der Zylinder-Radius ist die halbe Schaftbreite. Einmal gemessen und
       * gecacht statt bei jedem Frame gelesen: ein offsetWidth im onUpdate
       * einer scrub-Timeline erzwingt pro Frame ein Re-Layout. onRefresh
       * feuert u. a. bei Resize — genau dann, wenn sich die Breite ändern kann.
       */
      let radius = 0
      const measure = () => {
        radius = (shaftRef.current?.offsetWidth ?? 0) / 2
      }

      const applyRotation = () => {
        statRefs.current.forEach((el, i) => {
          if (!el) return
          const proj = cylinderTransform(i * STAT_STEP_DEG - state.phi, radius)
          if (!proj) {
            el.style.visibility = 'hidden'
            return
          }
          el.style.visibility = 'visible'
          el.style.transform = proj.transform
          el.style.opacity = proj.opacity
        })

        /*
         * Das Mockup wechselt im selben Takt wie die Säule: welche Kennzahl
         * gerade vorn steht, bestimmt auch die Dashboard-Szene (siehe
         * MOCK_VIEWS). Nur bei echtem Indexwechsel setzen — ein setState pro
         * Scroll-Frame würde React bei jedem Pixel neu rendern lassen.
         *
         * -1 ist bewusst ein gültiger Wert, keine Untergrenze zum Abklemmen:
         * bei phi=COLUMN_START_DEG (-90°) rundet das auf -1 statt auf 0. Statt
         * dafür eine eigene Skeleton-Szene zu zeigen, fällt DashboardMock hier
         * bewusst auf die volle Dashboard-Ansicht durch — kein Ladezustand
         * mehr, bevor „360°” überhaupt lesbar ist.
         */
        const next = Math.min(STATS.length - 1, Math.round(state.phi / STAT_STEP_DEG))
        if (next !== viewRef.current) {
          viewRef.current = next
          setView(next)
        }
      }

      if (withColumn) {
        measure()
        applyRotation()
      }

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: scene,
          start: 'top top',
          end: 'bottom bottom',
          scrub: true,
          onRefresh: withColumn
            ? () => {
                measure()
                applyRotation()
              }
            : undefined,
        },
      })

      if (cueRef.current) {
        tl.to(
          cueRef.current,
          { opacity: 0, ease: 'none', duration: scale(11) },
          scale(8),
        )
      }
      // Blendet ab Progress 0 aus — siehe Kommentar oben, das Ausblenden muss
      // vor dem Giebelwachstum fertig sein, nicht danach ansetzen.
      if (introRef.current) {
        tl.to(introRef.current, { y: -30, opacity: 0, ease: 'none', duration: scale(4) }, 0)
      }
      tl.to(
        state,
        {
          v: 1,
          duration: scale(OPEN_VH),
          ease: 'none',
          onUpdate: () => {
            clip.style.clipPath = clipPathAt(state.v)
            // früh auslösen: der Giebel gibt schon ab ~10 % Fläche frei, ein
            // noch totes Dashboard dahinter (Balken auf 0, Zahlen bei 0) sähe
            // leer aus
            if (!hasRun && state.v > 0.06) {
              hasRun = true
              setRun(true)
            }
          },
        },
        0,
      )

      if (!withColumn) {
        // Halteweg bis zum Szenenende — ohne Säule endet die Szene danach.
        tl.to({}, { duration: scale(HOLD_VH) }, scale(OPEN_VH))
        return
      }

      /*
       * Säule blendet am Ende des Haltewegs sanft ein — kein eigener
       * Einfahr-Schritt mehr, der sie erst leer von unten hochfährt, aber
       * auch kein hartes Umschalten von unsichtbar auf sichtbar: `autoAlpha`
       * (GSAP-Kurzform für opacity + visibility zugleich) blendet sie über
       * COLUMN_FADE_VH hinweg ein und hebt dabei genau im richtigen Moment
       * die `visibility:hidden`-Sperre aus .mock-column auf. NUR als Teil
       * der scrollgekoppelten Timeline (statt eines ungebundenen `gsap.set`)
       * bleibt sie vorher — auch während der Hero-Überlappung, siehe
       * PULL_INTO_HERO_VH — verborgen und taucht exakt an der richtigen
       * Scrollstelle auf, statt sofort beim Mounten sichtbar zu sein. Die
       * Kennzahlen-Rotation startet trotzdem schon mit dieser Blende
       * zusammen: bei COLUMN_START_DEG (−90°) ist die erste Zahl ohnehin erst
       * unsichtbar (siehe cylinderTransform) und braucht selbst einen
       * Moment Drehung, bis sie überhaupt zu lesen ist — die kurze Blende
       * ist davor längst abgeschlossen.
       */
      tl.fromTo(
        columnRef.current,
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: scale(COLUMN_FADE_VH), ease: 'none' },
        scale(OPEN_VH + HOLD_VH),
      )

      // Die vier Kennzahlen drehen sich um die Säule (siehe cylinderTransform)
      tl.to(
        state,
        {
          phi: COLUMN_END_DEG,
          duration: scale(COLUMN_ROTATE_VH),
          ease: 'none',
          onUpdate: applyRotation,
        },
        scale(OPEN_VH + HOLD_VH),
      )

      // Halteweg: Füll-Tween ohne Wirkung, damit die Timeline-Gesamtdauer dem
      // vollen Scrollbereich entspricht statt vor dem Szenenende abzubrechen —
      // die letzte Kennzahl steht dadurch einen Moment, bevor es weitergeht.
      tl.to({}, { duration: scale(COLUMN_OUTRO_VH) }, scale(TOTAL_VH - COLUMN_OUTRO_VH))
    }

    const mm = gsap.matchMedia()
    mm.add(`(min-width: ${COLUMN_MIN_WIDTH}px)`, () => build(true))
    mm.add(`(max-width: ${COLUMN_MIN_WIDTH - 1}px)`, () => build(false))

    return () => mm.revert()
  }, [still])

  /*
   * Bei reduzierter Bewegung entfällt die gesamte Pinning-Mechanik: kein
   * überlanger Abschnitt, kein Scroll-gesteuertes Beschneiden. Das Dashboard
   * steht einfach da. Scroll-Jacking ist für Betroffene besonders unangenehm,
   * weil es die erwartete Scrollstrecke verfälscht.
   */
  if (still) {
    return (
      <>
        <section style={{ height: '100svh', position: 'relative', backgroundColor: C.onyxWarm }}>
          <DashboardMock run />
        </section>
        <StatsBandFallback />
      </>
    )
  }

  return (
    <>
    <section
      ref={sceneRef}
      className="pediment-scene"
      style={{
        /*
         * Zwei Höhen als Custom Properties, die Auswahl trifft die Media
         * Query in landing.css: schmale Displays zeigen die Säule nicht und
         * bekommen deshalb die kürzere Szene (siehe MOBILE_TOTAL_VH).
         */
        ['--scene-h' as string]: `${SCENE_VH}vh`,
        ['--scene-h-sm' as string]: `${MOBILE_SCENE_VH}vh`,
        position: 'relative',
        marginTop: `-${PULL_INTO_HERO_VH}vh`,
        /*
         * pointer-events:none auf einem Kind macht nur DIESES Kind und seine
         * eigenen Nachfahren für Klicks durchsichtig — die äußere <section>
         * selbst bleibt eine eigene, hit-testbare Box (mehrere Viewports hoch,
         * per negativem margin-top über den Hero gezogen) und fängt Klicks in
         * der Überlappungszone weiterhin ab, obwohl visuell nichts davon zu
         * sehen ist. Muss deshalb HIER zusätzlich gesetzt werden, nicht nur
         * auf dem inneren Sticky-Wrapper (siehe elementFromPoint-Check: ohne
         * dies landete der Klick auf der leeren <section>, nie am Button).
         */
        pointerEvents: 'none',
      }}
    >
      <div style={{ position: 'sticky', top: 0, height: '100svh', overflow: 'hidden' }}>
        {/*
          Zierfüllung für den Moment, bevor der Giebel genug Fläche freigibt —
          fest sichtbar von Anfang an, keine Fade-in-Logik (siehe Kommentar
          oben). `top` per Inline-Style statt CSS-Klasse: muss exakt an
          PULL_INTO_HERO_VH gekoppelt bleiben, damit die Gruppe nie in die
          Zone rutscht, die während der Hero-Überlappung transparent bleiben
          muss, egal wie diese Konstante später angepasst wird.
        */}
        <div
          ref={introRef}
          className="pediment-intro"
          style={{ top: `calc(${PULL_INTO_HERO_VH}vh + 12px)` }}
          aria-hidden
        >
          {/*
            Fries mit Lücke in der Mitte statt einer durchgehenden Bahn —
            klassisches Motiv „Mäander mit Medaillon": der Kranz nestet sich
            in die Lücke, statt lose darunter zu schweben, und kann dadurch
            viel näher an den Fries heranrücken (Kranz zentriert exakt auf
            der Frieshöhe, siehe .pediment-intro-wreath).
          */}
          <div className="pediment-intro-frieze-row">
            <div className="pediment-intro-frieze-half">
              <MeanderFrieze id="frieze-pediment-top-l" color={C.ink} opacity={0.14} />
            </div>
            <div className="pediment-intro-gap" />
            <div className="pediment-intro-frieze-half">
              <MeanderFrieze id="frieze-pediment-top-r" color={C.ink} opacity={0.14} />
            </div>
          </div>
          <div className="pediment-intro-wreath">
            <LaurelWreath size={230} tone="light" opacity={0.2} />
          </div>
        </div>

        {/* Kleiner Scroll-Hinweis — liegt ebenfalls außerhalb der Überlappungszone */}
        <div ref={cueRef} className="pediment-cue" aria-hidden>
          <span className="pediment-cue-label" style={{ ...kicker, fontSize: '10px', color: C.inkSubtle }}>
            Scroll
          </span>
          <span className="pediment-cue-line" />
        </div>

        <div
          ref={clipRef}
          style={{ position: 'absolute', inset: 0, clipPath: clipPathAt(0), willChange: 'clip-path' }}
        >
          <DashboardMock run={run} view={view} reserveRight />
          {/* weicher Auslauf nach unten ins Parchment — dieselbe Idee wie die
              Kuppel im Hero, damit die dunkle Fläche nicht hart abbricht */}
        </div>

        {/*
          Kennzahlen-Säule, rechts über dem offenen Dashboard; fährt beim
          Auftritt von unten herein. Bewusst NACH (und damit über) dem
          clipRef-Container: läge sie darin, schnitte das Giebel-Dreieck sie
          beim Öffnen mit an — sie soll aber als eigenständiges Element in
          die fertig geöffnete Fläche fahren.

          Der Startversatz kommt ausschließlich von GSAP (gsap.set in build()),
          NICHT zusätzlich aus CSS: GSAP liest einen vorhandenen CSS-Transform
          als Basis und rechnet seinen eigenen obendrauf — die Säule stünde
          dann doppelt so weit draußen und käme nie ganz herein. Gegen ein
          Aufblitzen im allerersten Frame schützt stattdessen
          `visibility: hidden` in .mock-column, das dasselbe gsap.set aufhebt.
        */}
        <div ref={columnRef} className="mock-column">
          <Image
            src="/column-twisted.svg"
            alt=""
            aria-hidden
            width={61}
            height={330}
            unoptimized
            /* eager, weil die Säule bis zu ihrem Auftritt außerhalb des
               Viewports parkt — lazy geladen bliebe sie dauerhaft leer */
            loading="eager"
            className="mock-column-img"
          />
          {/*
            Nur der gerade Schaft trägt Schrift — Kapitell und Basis ragen
            seitlich darüber hinaus (siehe SHAFT_INSET). `overflow: hidden`
            kappt die Beschriftung an der Silhouette, damit sie nicht neben
            der Säule weiterläuft.
          */}
          <div ref={shaftRef} className="mock-column-shaft" style={SHAFT_INSET}>
            {STATS.map((s, i) => (
              <div
                key={s.label}
                ref={(el) => {
                  statRefs.current[i] = el
                }}
                className="mock-column-stat"
                style={{ visibility: 'hidden' }}
              >
                {/*
                  Nur für das Unendlich-Zeichen: im vertikalen Schreibfluss
                  legt der Browser jede Glyphe um 90° auf die Seite — bei ∞
                  steht die liegende Acht dadurch senkrecht und liest sich als
                  „8" statt als ∞. Sowohl `text-orientation: upright` als auch
                  `sideways` + Gegen-`rotate` und selbst ein `writing-mode:
                  horizontal-tb`-Ausbruch aus dem vertikalen Fluss verhielten
                  sich zwischen Chromium und WebKit/Safari unterschiedlich und
                  blieben mal falsch herum stehen — alles reine Textlösungen,
                  die auf dem cross-engine uneinheitlichen Zeichenverhalten
                  aufsetzen. Zuverlässig, weil gar keine Textglyphe mehr im
                  Spiel ist: das Zeichen als SVG-Icon zeichnen (Lucides
                  `Infinity`) statt als Unicode-Zeichen — ein Pfad hat keine
                  Schreibrichtung, die der Browser drehen könnte. Ziffern
                  dürfen NICHT so gesetzt werden, sie stünden sonst einzeln
                  untereinander statt als Zahl.
                */}
                <span className="mock-column-value">
                  {s.value === '∞' ? (
                    <InfinityIcon
                      aria-hidden
                      strokeWidth={1.5}
                      style={{ width: 'clamp(30px, 3.4vw, 52px)', height: 'clamp(30px, 3.4vw, 52px)', display: 'block', rotate: '90deg' }}
                    />
                  ) : (
                    s.value
                  )}
                </span>
                <span className="mock-column-label">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>

    {/*
      Ersatz für die Säule auf schmalen Displays, wo sie dem Mockup die Breite
      nähme (siehe .mock-column-Media-Query). Nur dort sichtbar — sonst
      stünden die vier Zahlen zweimal auf der Seite.
    */}
    <StatsBandFallback className="stats-band-sm" />
    </>
  )
}

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
    title: 'Lebenshaltungskosten',
    desc: 'Berechnet das nötige Mindestgehalt auf Basis realer Lebenshaltungskosten.',
    icon: <ShoppingCart size={17} strokeWidth={1.6} />,
    tags: ['Budget', 'Kalkulation'],
    wide: true,
    visual: <MiniSparkline />,
  },
]

/**
 * Die vier Säulen — jede in einer eigenen klassischen Ordnung, von der
 * schlichtesten zur reichsten (toskanisch → dorisch → ionisch → korinthisch).
 * Die Bilddateien liegen in public/ und stammen aus dem Figma-Export.
 */
const PILLARS = [
  {
    num: 'I',
    src: '/column-tuscan.svg',
    w: 102,
    h: 332,
    title: 'Überblick',
    desc: 'Konten, Depots und Verträge stehen in einer Ansicht — kein Wechseln zwischen Portalen.',
  },
  {
    num: 'II',
    src: '/column-doric.svg',
    w: 95,
    h: 330,
    title: 'Präzision',
    desc: 'Jede Zahl stammt aus einer echten Buchung. Keine Schätzung, keine Hochrechnung.',
  },
  {
    num: 'III',
    src: '/column-ionic.svg',
    w: 115,
    h: 332,
    title: 'Regeln',
    desc: 'Wiederkehrendes bucht sich selbst, Strategien folgen definierten Indikatoren.',
  },
  {
    num: 'IV',
    src: '/column-corinthian.svg',
    w: 101,
    h: 330,
    title: 'Historie',
    desc: 'Jede Buchung bleibt erhalten — Vergleiche über Jahre statt Momentaufnahmen.',
  },
]

/** Ab hier läuft die Säulenreihe als scroll-gesteuertes Karussell (siehe
    PillarsReveal); darunter bleibt die bestehende Grid-/Listen-Darstellung
    unverändert (siehe die .g-pillars-Regeln in landing.css). */
const PILLARS_MIN_WIDTH = 1024
/** Scrollstrecke pro Säulen-Wechsel — genug, um Titel und Beschreibung in
    Ruhe zu lesen, bevor der Vordergrund zur nächsten Säule wandert. */
const PILLARS_STEP_VH = 70
const PILLARS_SCENE_VH = 100 + PILLARS_STEP_VH * (PILLARS.length - 1)
/** Abstand zwischen zwei Säulen auf der 0–1-Fortschrittsachse (4 Säulen an
    den Stellen 0, ⅓, ⅔, 1). */
const PILLARS_PROGRESS_STEP = 1 / (PILLARS.length - 1)

/**
 * „Die Säulen" als scroll-gesteuertes Karussell ab PILLARS_MIN_WIDTH: alle
 * vier bleiben durchgehend sichtbar (nebeneinander, wie im normalen Raster),
 * aber immer genau eine steht gerade im Vordergrund — größer, hell, leicht
 * angehoben — während die anderen kleiner, blasser und leicht zurückversetzt
 * daliegen. Fortschritt beim Scrollen wandert den Vordergrund von Säule zu
 * Säule; kein horizontales Verschieben, nur Größe/Helligkeit/Höhe je Säule.
 *
 * Dieselbe Halte-Technik wie PedimentReveal: die Sektion bekommt
 * zusätzliche Scrollstrecke, ein `position: sticky`-Kind hält den Ausschnitt
 * fest (kein GSAP-`pin`, das erspart dessen Pin-Spacer-DOM), während JS pro
 * Säule Transform/Opacity/Filter direkt setzt statt über React-State zu
 * gehen — bei einem scrub-getriebenen Update pro Scroll-Frame wäre ein
 * Re-Render pro Säule pro Frame spürbar.
 *
 * Unter PILLARS_MIN_WIDTH und bei reduzierter Bewegung bleibt exakt die
 * bisherige Grid-/Listen-Darstellung erhalten (siehe landing.css) — dieselbe
 * Markup-Struktur, CSS entscheidet per Breakpoint, ob sie gepinnt/animiert
 * läuft, GSAP baut die Timeline nur dort, wo die CSS sie auch zeigt.
 */
function PillarsReveal() {
  const still = useReducedMotion()
  const sceneRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const pillarRefs = useRef<(HTMLSpanElement | null)[]>([])

  useEffect(() => {
    if (still) return
    const scene = sceneRef.current
    if (!scene) return

    const mm = gsap.matchMedia()
    mm.add(`(min-width: ${PILLARS_MIN_WIDTH}px)`, () => {
      const state = { p: 0 }

      /*
       * Spaltenbreite fürs Zentrieren gecacht statt pro Frame gemessen — ein
       * offsetWidth-Zugriff in onUpdate einer scrub-Timeline erzwingt sonst
       * pro Frame ein Re-Layout (dasselbe Prinzip wie der Zylinder-Radius in
       * PedimentReveal).
       */
      let colWidth = 0
      const measure = () => {
        colWidth = (rowRef.current?.offsetWidth ?? 0) / PILLARS.length
      }

      const applyEmphasis = () => {
        pillarRefs.current.forEach((el, i) => {
          if (!el) return
          // 0 an der eigenen Stelle (voll im Vordergrund), 1 sobald eine
          // volle Säulen-Distanz entfernt oder weiter (weiter entfernte
          // Säulen sollen nicht noch kleiner werden als der Ruhezustand).
          const d = Math.min(1, Math.abs(i * PILLARS_PROGRESS_STEP - state.p) / PILLARS_PROGRESS_STEP)
          const scale = 1.12 - d * 0.3 // 1.12 im Vordergrund → 0.82 im Hintergrund
          // Plateau statt linearem Abfall: bleibt bis d=0.35 voll deckend,
          // erst danach setzt das Ausblenden ein. Ohne das war schon die
          // Säule, die gerade zur Mitte zieht (und dabei Nachbarn optisch
          // überlappt), selbst leicht transparent — kombiniert mit dem
          // z-index-Fix (siehe .pillar-inner in landing.css) sah das aus, als
          // schiene eine Säule durch die andere hindurch.
          const opacity = d <= 0.35 ? 1 : 1 - ((d - 0.35) / 0.65) * 0.5
          const dim = d * 0.75 // Entsättigung/Abdunklung der zurückliegenden Säulen
          // Dieselbe Plateau-Kurve für die Stufenkante am Säulenfuß (siehe
          // --pillar-base-alpha in .pillar-shaft, landing.css): die
          // Vordergrundsäule bekommt eine blickdichte Kante (1 statt der
          // sonst halbtransparenten .44), damit sie beim Überlappen nicht
          // die Kante der Nachbarsäule durchscheinen lässt.
          const baseAlpha = d <= 0.35 ? 1 : 1 - ((d - 0.35) / 0.65) * 0.56

          /*
           * Statt starrer Rasterposition: die eigene Rasterspalte ist der
           * Ruhepunkt (centerPull = 0), auf dem Weg dorthin wird die Säule
           * zur Bildschirmmitte gezogen (centerPull → 1 am eigenen Moment) —
           * die jeweils vorderste steht dadurch immer mittig, statt nur
           * größer zu werden. Bewusst nur Position/Größe/Licht, keine
           * Rotation und kein zusätzlicher Bogen-Schwung in der Höhe mehr —
           * beides sah bei der Bildhöhe von Schaft + Text schnell nach
           * zufälligem Wackeln statt nach einer klaren Bewegung aus.
           */
          const centerPull = Math.max(0, 1 - d)
          const naturalCenterOffset = (i - (PILLARS.length - 1) / 2) * colWidth
          const xArc = -naturalCenterOffset * centerPull
          const lift = -16 + d * 26

          el.style.transform = `translate(${xArc.toFixed(1)}px, ${lift.toFixed(1)}px) scale(${scale.toFixed(3)})`
          el.style.opacity = opacity.toFixed(3)
          el.style.filter = `grayscale(${dim.toFixed(2)}) brightness(${(1.05 - d * 0.22).toFixed(2)})`
          el.style.zIndex = String(Math.round((1 - d) * 10))
          el.style.setProperty('--pillar-base-alpha', baseAlpha.toFixed(3))

          // Nur die Beschreibung bekommt einen eigenen, deutlich schärferen
          // Ausblendverlauf — Nummer und Titel bleiben auf allen vier Säulen
          // die ganze Zeit sichtbar (auf demselben Dimm-Niveau wie die Säule
          // selbst), nur der lange Fließtext ist der Vordergrundsäule
          // vorbehalten. .pillar-copy ist das letzte Kind von .pillar-inner,
          // .af-balance wiederum dessen letztes Kind (siehe JSX) —
          // lastElementChild statt einer erneuten Suche pro Frame.
          //
          // Harter Cutoff statt sanftem Verlauf: mit einem sanften Verlauf
          // waren beim Vorbeiziehen zweier Nachbarn kurz BEIDE Beschreibungen
          // teilweise sichtbar und überlagerten sich lesbar. Ab d>0.35 (genau
          // die Schwelle, ab der auch die Säule selbst schon abgeblendet
          // wird) ist die Beschreibung stattdessen ganz weg — beim Übergang
          // bleibt kurz gar keine sichtbar, statt dass sich zwei überlagern.
          const copy = el.lastElementChild as HTMLElement | null
          const desc = copy?.lastElementChild as HTMLElement | null
          if (desc) desc.style.opacity = d <= 0.15 ? '1' : Math.max(0, 1 - (d - 0.15) / 0.2).toFixed(3)
        })
      }
      measure()
      applyEmphasis()

      gsap
        .timeline({
          scrollTrigger: {
            trigger: scene,
            start: 'top top',
            end: 'bottom bottom',
            scrub: true,
            onRefresh: () => {
              measure()
              applyEmphasis()
            },
          },
        })
        .to(state, { p: 1, ease: 'none', onUpdate: applyEmphasis })
    })

    return () => mm.revert()
  }, [still])

  /**
   * Klick auf eine (auch zurückliegende) Säule springt zu ihrem Moment: die
   * Vordergrund-Position ist reiner Scroll-Fortschritt (state.p, siehe oben),
   * „hinspringen" heißt also schlicht dorthin scrollen, wo state.p = i *
   * PILLARS_PROGRESS_STEP wäre — kein zweiter Animationsmechanismus nötig.
   *
   * `scrollDistance <= 0` erkennt zuverlässig, ob das Karussell überhaupt
   * aktiv ist: unter PILLARS_MIN_WIDTH und bei reduzierter Bewegung bleibt
   * .pillars-scene per CSS auf `height: auto` (siehe landing.css), dann ist
   * sie nie größer als der Viewport — genau dann ergibt ein Sprung ohnehin
   * keinen Sinn, weil nichts gepinnt ist.
   */
  const jumpToPillar = (i: number) => {
    const scene = sceneRef.current
    if (!scene) return
    const scrollDistance = scene.offsetHeight - window.innerHeight
    if (scrollDistance <= 0) return
    const sceneTop = scene.getBoundingClientRect().top + window.scrollY
    scrollToY(sceneTop + i * PILLARS_PROGRESS_STEP * scrollDistance)
  }

  return (
    <section style={{ backgroundColor: C.onyx, padding: `${SPACE.section} ${SPACE.gutter}` }}>
      <div style={{ maxWidth: '1160px', margin: '0 auto' }}>
        <div data-section-marker="II">
          <Reveal>
            <SectionHead
              index="II"
              label="Die Säulen"
              title="Vier Grundsätze."
              emphasis="Ein Fundament."
              lead="Worauf das System steht — vier Prinzipien, die jede Ansicht und jede Berechnung tragen."
              tone="dark"
            />
          </Reveal>
        </div>

        <div
          ref={sceneRef}
          className="pillars-scene"
          style={{ ['--pillars-scene-h' as string]: `${PILLARS_SCENE_VH}vh` }}
        >
          <div className="pillars-sticky">
            {/*
              Gebälk: bewusst INNERHALB der gepinnten Fläche statt davor —
              bliebe es ein normaler Reveal vor der Szene, wäre es schon
              weggescrollt, sobald das Pinning greift. So bleibt es die ganze
              Karussell-Dauer über oben stehen, während der Vordergrund
              darunter wandert (dasselbe Tempelfront-Bild wie zuvor, nur ohne
              die künstliche Lücke).
            */}
            <Reveal y={16} style={{ marginTop: 'clamp(44px, 6vw, 76px)', flexShrink: 0 }}>
              <div className="entablature">
                <MeanderFrieze id="frieze-pillars" color={C.cream} opacity={0.3} />
                <span className="architrave" />
              </div>
            </Reveal>

            <div
              ref={rowRef}
              className="g-pillars"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}
            >
              {PILLARS.map((p, i) => (
                <Reveal key={p.src} delay={0.08 + i * 0.1} y={20} className="pillar">
                  {/*
                    Eigene Ebene für die eigentliche Anordnung UND für die
                    Vordergrund-Betonung: Reveal legt intern einen unbewegten
                    Sentinel-Wrapper um ein animiertes <motion.div>, Schaft
                    und Text sind dadurch Enkel von .pillar, keine direkten
                    Kinder mehr — .pillar-inner trägt deshalb sowohl das
                    Flex-Layout als auch (ab PILLARS_MIN_WIDTH) das
                    scroll-gesteuerte transform/opacity/filter von oben.

                    Klickbar/fokussierbar, damit auch eine zurückliegende
                    Säule direkt angesprungen werden kann (siehe
                    jumpToPillar) — unterhalb PILLARS_MIN_WIDTH und bei
                    reduzierter Bewegung ist das Karussell gar nicht aktiv,
                    dort no-opt jumpToPillar über den scrollDistance-Check
                    ohnehin still.
                  */}
                  <span
                    ref={(el) => {
                      pillarRefs.current[i] = el
                    }}
                    className="pillar-inner"
                    role="button"
                    tabIndex={0}
                    aria-label={`Zu „${p.title}" springen`}
                    onClick={() => jumpToPillar(i)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        jumpToPillar(i)
                      }
                    }}
                  >
                    <span className="pillar-shaft">
                      <Image
                        src={p.src}
                        alt=""
                        aria-hidden
                        width={p.w}
                        height={p.h}
                        unoptimized
                        className="pillar-img"
                      />
                    </span>
                    <span className="pillar-copy">
                      <span
                        style={{
                          display: 'block',
                          fontFamily: F.display,
                          fontSize: '15px',
                          letterSpacing: '0.14em',
                          color: C.gold,
                          marginBottom: '10px',
                        }}
                      >
                        {p.num}
                      </span>
                      <h3
                        style={{
                          fontFamily: F.display,
                          fontSize: 'clamp(19px, 2vw, 23px)',
                          fontWeight: 500,
                          color: C.onCream,
                          margin: '0 0 10px',
                        }}
                      >
                        {p.title}
                      </h3>
                      <span
                        className="af-balance"
                        style={{
                          display: 'block',
                          fontFamily: F.serif,
                          fontSize: '14px',
                          lineHeight: 1.75,
                          color: C.onBody,
                        }}
                      >
                        {p.desc}
                      </span>
                    </span>
                  </span>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

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

const EXTRAS = [
  { icon: <Repeat2 size={18} strokeWidth={1.5} />, title: 'Auto-Buchungen', desc: 'Wiederkehrende Verträge werden automatisch als Transaktionen gebucht.' },
  { icon: <ShieldCheck size={18} strokeWidth={1.5} />, title: 'Datenschutz', desc: 'Deine Daten bleiben deine. Keine Weitergabe, kein Tracking.' },
  { icon: <Globe size={18} strokeWidth={1.5} />, title: 'Überall verfügbar', desc: 'Vollständig responsiv — auf Desktop, Tablet und Mobil.' },
  { icon: <Zap size={18} strokeWidth={1.5} />, title: 'Echtzeitdaten', desc: 'Preise und Portfoliowerte aktualisieren sich automatisch.' },
]

const SHELL: React.CSSProperties = {
  maxWidth: '1160px',
  margin: '0 auto',
  padding: `0 ${SPACE.gutter}`,
}

/**
 * Ranken-Hintergrund fürs Instrumentarium — dieselbe Zeichentechnik wie im
 * Hero (siehe OliveVines), aber erst gemountet, sobald die jeweilige Ecke ins
 * Bild scrollt (reine CSS-Wachs-Animation, siehe vines.css — läge sie wie im
 * Hero dauerhaft im Baum, wäre sie beim Erreichen der Sektion längst fertig
 * gewachsen und stünde nur noch reglos da). Zwei Instanzen rahmen die
 * Sektion oben UND unten (`dock`) statt einer einzigen, gestreckten Fläche —
 * die Karten dazwischen bleiben frei von Ranken-Deko.
 *
 * Liegt bewusst per z-index VOR dem Kartenraster (siehe zIndex am
 * Inhalts-Container), nicht dahinter — sonst schneidet das opake Raster jeden
 * weit genug reichenden Zweig an der eigenen Kante ab statt ihn sichtbar
 * über die Kacheln ragen zu lassen. `pointer-events:none` sorgt dafür, dass
 * Klicks/Hover trotzdem ganz normal bei den Karten ankommen.
 *
 * Höhe bewusst GEKAPPT statt über die volle (deutlich höhere) Sektion
 * gestreckt: OliveVines ist für eine ~viewporthohe Fläche im Seitenverhältnis
 * 520:900 gezeichnet (siehe VB in olive-vines.tsx). `preserveAspectRatio=
 * "slice"` skaliert dabei EINHEITLICH in x UND y auf den größeren der beiden
 * nötigen Faktoren — über eine viel höhere als breite Fläche gestreckt
 * gewinnt der Höhenfaktor deutlich, und genau dieser einheitliche Faktor
 * bläht dann auch die BREITE der Zweig-Geometrie auf: Astenden (und ihre
 * Ranken-Locken) landen weit außerhalb der eigenen Box — abgeschnitten vom
 * eigenen Ranken-Layer, nicht vom Kartenraster. Breite UND Höhe hier bewusst
 * größer als der Hero-Standard (clamp(112px,26vw,450px)), aber im GLEICHEN
 * Seitenverhältnis (900/520 ≈ 1.73) mitskaliert, damit der Vergrößerungs-
 * wunsch nicht denselben Streckungsfehler reproduziert.
 */
function InstrumentariumVines({ dock }: { dock: 'top' | 'bottom' }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-10% 0px' })
  const width = 'clamp(130px, 28vw, 500px)'
  // 500 * (900/520) ≈ 865 — derselbe Seitenverhältnis-Kompromiss wie bei `width`.
  const fade = 'linear-gradient(to bottom, black 0%, black 78%, transparent 96%)'
  return (
    <div
      ref={ref}
      aria-hidden
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        [dock]: 0,
        height: 'min(48%, 865px)',
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 2,
        maskImage: fade,
        WebkitMaskImage: fade,
        // Untere Ecke ist dieselbe Geometrie, nur gespiegelt — lässt die
        // Zweige von der Unterkante nach oben ins Bild wachsen, statt eigene
        // Kurven für eine Aufwärtsrichtung zu entwerfen. Die Maske bleibt
        // dieselbe Formel: sie fasst „nahe der eigenen Kante voll deckend,
        // zur Sektionsmitte hin ausblendend" — genau das kehrt der Spiegel
        // automatisch mit um.
        transform: dock === 'bottom' ? 'scaleY(-1)' : undefined,
      }}
    >
      {/*
        swaying={false}: diese Ranken sitzen dauerhaft (einmal `inView`, nie
        wieder unmontiert) HINTER der `maskImage` oben — mit der endlosen
        Wiege-Schleife (siehe swaying-Kommentar in olive-vines.tsx) müsste
        der Browser diese Maske für den Rest der Seite ständig neu
        kompositieren, sichtbar als andauerndes Ruckeln ab genau dieser
        Sektion. Die einmalige Wachs-Animation bleibt.
      */}
      {inView && <OliveVines tone="light" opacity={0.42} width={width} swaying={false} />}
    </div>
  )
}

/**
 * Footer-Spalte mit allen Sektionen (Prolog, I–IV) — dieselbe Liste wie
 * NAV_ITEMS in der Sticky-Leiste und derselbe Sprung (siehe
 * requestSectionJump), damit sich ein Klick hier identisch anfühlt statt nur
 * simpel zur Anker-Position zu scrollen.
 */
function FooterSections() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '10px' }}>
      <span className="af-micro" style={{ ...kicker, fontSize: '10px', color: C.inkFaint, marginBottom: '2px' }}>
        Sektionen
      </span>
      {NAV_ITEMS.map((item) => (
        <button
          key={item.index}
          type="button"
          onClick={() => requestSectionJump(item.index)}
          className="foot-link"
          style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer', textAlign: 'left' }}
        >
          <span className="af-quiet af-micro" style={{ ...kicker, fontSize: '11px', color: C.inkSubtle }}>
            {item.index === 'Prolog' ? 'Prolog' : `${item.index} · ${item.label}`}
          </span>
        </button>
      ))}
    </div>
  )
}

// ── Seite ─────────────────────────────────────────────────────────────────────

export function LandingClient() {
  const stillMotion = useReducedMotion()
  const heroRef = useRef<HTMLElement>(null)
  const heroPhotoImgRef = useRef<HTMLImageElement>(null)

  /*
   * Parallax auf dem Hero-Aquarell: das Bild hinkt beim Scrollen hinter der
   * eigentlichen Scrollgeschwindigkeit her (y bewegt sich langsamer als der
   * Rest der Seite). Dadurch wirkt es, als schöbe sich die weiße Sektion
   * darunter beim Runterscrollen sichtbar ÜBER das Bild, statt nur normal
   * daran vorbeizuscrollen.
   *
   * yPercent statt fester Pixel: bewegt sich relativ zur eigenen (durch
   * scale(1.24) vergrößerten) Bildhöhe, damit die Stärke auf jeder
   * Viewport-Höhe gleich bleibt — der zugehörige Kanten-Puffer in
   * landing.css ist ebenfalls relativ (scale), beide bleiben so im
   * gleichen Verhältnis zueinander, egal wie hoch der Hero tatsächlich ist.
   *
   * Bewegt wird NUR das Bild selbst, nicht sein Fenster (.hero-photo bleibt
   * unbewegt, siehe dessen scale(1.24)-Kommentar in landing.css) — sonst
   * legte die Verschiebung an einer Kante des Hero eine leere Fläche frei.
   */
  useEffect(() => {
    if (stillMotion) return
    const hero = heroRef.current
    const img = heroPhotoImgRef.current
    if (!hero || !img) return

    const tween = gsap.to(img, {
      yPercent: 10,
      ease: 'none',
      scrollTrigger: {
        trigger: hero,
        start: 'top top',
        end: 'bottom top',
        scrub: true,
      },
    })

    return () => {
      tween.scrollTrigger?.kill()
      tween.kill()
    }
  }, [stillMotion])

  return (
    <SmoothScrollProvider>
    <div
      className="af-landing"
      style={{
        position: 'relative',
        backgroundColor: C.parchment,
        color: C.ink,
        minHeight: '100vh',
        fontFamily: F.sans,
        /*
         * `clip` statt `hidden`: hidden auf einer Achse rechnet die andere auf
         * `auto` hoch und macht dieses Div damit zum Scroll-Container — die
         * sticky Navigationsleiste klebt dann an ihm statt am Viewport und
         * scrollt mit weg. `clip` beschneidet ohne Scrollport.
         */
        overflowX: 'clip',
      }}
    >
      <SectionProgressBar />

      {/*
        Die Ranken liegen absichtlich AUSSERHALB des Hero und über der
        Navigationsleiste (z-index 60 gegen deren 50) — sie sollen die Leiste
        überwachsen. Läge die Schicht im Hero, würde dessen overflow:hidden sie
        an der Oberkante abschneiden.
      */}
      <div className="vine-layer-over" aria-hidden>
        <OliveVines tone="light" opacity={0.62} />
      </div>

      {/*
        ══ NAV ══
        Liegt `absolute` über dem Hero und scrollt normal mit weg — nicht
        mehr `fixed`. Dadurch reicht das Aquarell weiter bis an die
        Seitenoberkante, die Leiste bleibt aber dauerhaft transparent, weil
        sie nie über anderem Inhalt als dem Hero steht.
      */}
      <header className="site-header">
        <div
          style={{
            ...SHELL,
            height: '66px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Link
            href="/"
            className="nav-brand"
            style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}
          >
            <Logo variant="dark" size={30} priority />
            <span
              className="nav-wordmark"
              style={{
                fontFamily: F.display,
                fontSize: '18px',
                fontWeight: 500,
                letterSpacing: '0.005em',
                color: C.ink,
                whiteSpace: 'nowrap',
              }}
            >
              Athena Finance
            </span>
          </Link>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 'clamp(16px, 3vw, 32px)' }}>
            <a href="#features" className="nav-link">
              <span
                className="af-quiet"
                style={{ ...kicker, fontSize: '11px', color: C.inkSubtle, whiteSpace: 'nowrap' }}
              >
                Instrumentarium
              </span>
            </a>
            <Link href="/login" className="af-btn hero-btn-primary nav-cta" style={{ padding: '11px 22px' }}>
              Anmelden
            </Link>
          </nav>
        </div>
        <div className="af-dentil" />
      </header>

      {/* ══ HERO ══ */}
      {/*
        Der Hero füllt bewusst den ganzen Viewport: die Dashboard-Vorschau
        soll erst beim Scrollen auftauchen. Die Leiste ist jetzt `fixed` statt
        `absolute` (siehe .site-header) und reserviert deshalb keinen Platz mehr
        im Fluss — der Hero beginnt an der echten Seitenoberkante, damit das
        Bild hinter der anfangs transparenten Leiste sichtbar ist. Der fehlende
        Abstand kommt hier über paddingTop zurück (Leistenhöhe + der alte
        Wert), die Überschrift steht dadurch optisch an derselben Stelle wie
        zuvor. Lead, Buttons und Zeile darunter rutschen als Gruppe an den
        unteren Rand (siehe .hero-foot).
      */}
      <section
        ref={heroRef}
        className="hero"
        style={{
          position: 'relative',
          overflow: 'hidden',
          paddingTop: 'calc(var(--af-nav-h) + clamp(52px, 10vh, 132px))',
          paddingBottom: 'clamp(34px, 5vh, 60px)',
        }}
      >
        {/* Aquarell-Landschaft, vollflächig und unverändert (siehe .hero-photo) */}
        <div className="hero-photo" aria-hidden>
          <Image
            ref={heroPhotoImgRef}
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

            <div className="af-rise" style={{ animationDelay: '.46s', marginTop: 'clamp(26px, 4vh, 48px)' }}>
              <Lozenge />
            </div>
          </div>
        </div>
      </section>

      {/*
        ══ GIEBEL-ENTHÜLLUNG ══
        Ersetzt die frühere gerahmte Browserfenster-Vorschau: dasselbe
        Dashboard zweimal kurz hintereinander hätte die Wirkung des Effekts
        verpuffen lassen.

        Aufbau: die Szene ist SCENE_VH hoch, darin klebt ein Viewport-hoher
        Container. Beim Durchscrollen wächst ein Tempelgiebel (clip-path-
        Dreieck) über den Bildschirm und gibt das Dashboard frei. Der letzte
        Viertel des Scrollwegs ist bewusst Halteweg, damit das offene
        Dashboard einen Moment steht, bevor die Seite weiterläuft.
      */}
      <PedimentReveal />

      {/* ══ I · INSTRUMENTARIUM ══ */}
      <section id="features" style={{ padding: `${SPACE.section} ${SPACE.gutter}`, position: 'relative' }}>
        {/* Liegt per z-index VOR dem Inhalt (siehe zIndex:2 dort, gegen
            zIndex:1 hier) — die Ranken sollen sichtbar über die Kartenkanten
            ragen, siehe Kommentar an InstrumentariumVines. Zwei Instanzen
            (oben/unten) statt einer über die volle Sektion gestreckten. */}
        <InstrumentariumVines dock="top" />
        <InstrumentariumVines dock="bottom" />
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

      {/* ══ II · DIE SÄULEN (horizontaler Scroll-Schieber ab Desktop) ══ */}
      <PillarsReveal />

      {/* ══ III · DIE ANALYSE (gepinnte Schritt-Erzählung ab Desktop) ══ */}
      <AnalyseReveal />

      {/* ══ IV · DER WEG ══ */}
      <section
        style={{
          padding: `${SPACE.section} ${SPACE.gutter}`,
          borderTop: `1px solid ${C.rule}`,
          backgroundColor: 'rgba(232,224,208,.24)',
        }}
      >
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div data-section-marker="IV">
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

      {/* ══ WEITERE EIGENSCHAFTEN ══ */}
      <section style={{ padding: `clamp(56px, 7vw, 88px) ${SPACE.gutter}`, borderTop: `1px solid ${C.rule}` }}>
        <div style={{ maxWidth: '1160px', margin: '0 auto' }}>
          <div
            className="g-extras"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'clamp(24px, 3vw, 40px)' }}
          >
            {EXTRAS.map((f, i) => (
              <Reveal key={f.title} delay={i * 0.06}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <span style={{ color: C.oliveDeep }}>{f.icon}</span>
                  <div style={{ height: '1px', backgroundColor: C.rule }} />
                  <h4 style={{ fontFamily: F.display, fontSize: '17px', fontWeight: 500, color: C.ink, margin: 0 }}>
                    {f.title}
                  </h4>
                  <p style={{ fontFamily: F.serif, fontSize: '13px', lineHeight: 1.75, color: C.inkBody, margin: 0 }}>
                    {f.desc}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ ABSCHLUSS ══ */}
      <section style={{ padding: `0 ${SPACE.gutter} ${SPACE.section}` }}>
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
                    maxWidth: '480px',
                    margin: '26px auto 38px',
                  }}
                >
                  Athena Finance bündelt Konten, Depots, Verträge und Strategien in einer
                  einzigen Oberfläche — damit jede Entscheidung auf vollständigen Daten beruht.
                </p>
                <Link href="/login" className="af-btn af-btn-cream">
                  Anmelden <ArrowRight size={15} strokeWidth={2} />
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══ FOOTER ══ */}
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
              <a href="mailto:eric@athena-finance.de" className="foot-link">
                <span className="af-quiet af-micro" style={{ ...kicker, fontSize: '11px', color: C.inkSubtle }}>
                  Kontakt
                </span>
              </a>
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
              Der Zugang ist aktuell begrenzt — es werden vorübergehend keine neuen Konten angelegt.
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
    </div>
    </SmoothScrollProvider>
  )
}
