'use client'

import { useEffect, useRef, useState } from 'react'
import { Logo } from '@/components/ui/logo'
import { useReducedMotion } from '@/lib/use-reduced-motion'
import { C } from '@/components/landing/landing-tokens'
import { jumpToY } from '@/components/landing/scroll-control'
import { Kicker } from '@/components/landing/shared/editorial'
import { NAV_ITEMS, NUMBERED_SECTIONS, SECTION_JUMP_EVENT, type NavItem } from '@/components/landing/shared/nav-sections'

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

export function SectionProgressBar() {
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
