'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { Logo } from '@/components/ui/logo'
import { APP, F } from '@/components/landing/landing-tokens'
import { MOCK_VIEWS, NAV } from '@/components/landing/dashboard-mock/mock-data'
import { useVisible } from '@/components/landing/dashboard-mock/mock-hooks'
import { AnalyseView } from '@/components/landing/dashboard-mock/views/AnalyseView'
import { AthenaView } from '@/components/landing/dashboard-mock/views/AthenaView'
import { CryptoView } from '@/components/landing/dashboard-mock/views/CryptoView'
import { DashboardView } from '@/components/landing/dashboard-mock/views/DashboardView'

/**
 * Illustratives Dashboard für die Vollbild-Enthüllung.
 *
 * Sidebar-Struktur, Navigation und Grundpalette bleiben wiedererkennbar,
 * Kartenform und Layout pro Szene sind freie Illustration für die Landing
 * Page — aber die CHARTS selbst (Gridlines, Tooltips, Donut mit
 * Center-Label, Composed Bar+Line, Filter-Pills/Chips) übernehmen bewusst
 * exakt die visuelle Sprache der echten Chart-Komponenten (siehe
 * src/components/dashboard/net-worth-chart.tsx, finance-analytics.tsx,
 * portfolio-donut.tsx), nur auf die APP-Tokens statt Tailwind-Theme-Klassen
 * übertragen. Jede der vier Szenen (siehe MOCK_VIEWS) hat ihr eigenes Layout
 * statt nur getauschter Karten im selben Raster.
 *
 * Alle Zahlen sind Beispieldaten. Der gesamte Block ist `aria-hidden`: ein
 * Screenreader würde sonst erfundene Kontostände als echte Finanzdaten
 * vorlesen.
 */
export function DashboardMock({
  run,
  view = 0,
  /**
   * Hält rechts Platz für die Kennzahlen-Säule frei. Ohne das lägen Beträge,
   * Prozentwerte und Kurse — also genau die rechtsbündigen Zahlen — unter der
   * Säule und wären angeschnitten.
   */
  reserveRight = false,
}: {
  run: boolean
  view?: number
  reserveRight?: boolean
}) {
  const [hoveredNav, setHoveredNav] = useState<string | null>(null)
  // -1 = Säule noch leer (siehe PedimentReveal, phi startet bei
  // COLUMN_START_DEG) — zeigt trotzdem schon die volle Dashboard-Szene
  // (kein Skeleton-Zwischenschritt mehr), Math.max fängt nur den Index ab.
  const activeView = MOCK_VIEWS[Math.max(view, 0)] ?? MOCK_VIEWS[0]
  const active = activeView.nav
  /*
   * Seit der Umbau der echten Sidebar Depot und Krypto unter „Investing"
   * gruppiert hat (siehe NAV), reicht die Gruppe allein nicht mehr, um die
   * Szene zu benennen: zwei der vier Szenen leuchten auf demselben
   * Hauptpunkt. Der Unterpunkt sagt, welche gemeint ist.
   */
  const activeChild = 'child' in activeView ? activeView.child : undefined
  // Gate für Hintergrund-Arbeit, die pausieren soll, sobald das Mockup aus
  // dem Viewport gescrollt ist (siehe useLiveTicker/CryptoView) — `view`
  // bleibt nach der Säulen-Rotation dauerhaft auf dem letzten Stand stehen
  // (siehe Kommentar an useLiveTicker), ohne dieses Gate liefe die
  // Crypto-Szene sonst für den Rest der Seite im Hintergrund weiter.
  const rootRef = useRef<HTMLDivElement>(null)
  const visible = useVisible(rootRef)

  return (
    <div
      ref={rootRef}
      aria-hidden
      /*
       * data-theme="athena-dark": DashboardMock liegt außerhalb des normalen
       * [data-theme]-Scopes (siehe landing-tokens.ts) — die eigenen
       * APP-Inline-Styles bräuchten das Attribut nicht. Für die echten
       * App-Komponenten, die hier mitgerendert werden (IncomeExpenseChart,
       * PortfolioAreaChart, DonutCard, AusgabenHeatmap, GeldflussChart,
       * CashflowKalender, NetWorthChart, PortfolioDonut), ist es dagegen
       * Pflicht: die arbeiten
       * mit Tailwind-Klassen wie bg-card/border-border/text-muted-foreground
       * und bekämen ohne dieses Attribut die Default-Light-Palette.
       *
       * MUSS deshalb immer dasselbe Preset nennen wie die APP-Tokens in
       * landing-tokens.ts — sonst laufen zwei Paletten nebeneinander im
       * selben Mockup.
       */
      data-theme="athena-dark"
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: APP.bg,
        /* Derselbe Schimmer, den `[data-theme="athena-dark"] body` in
           globals.css auf die echte App legt — ohne ihn wirkt die Fläche
           hier flacher als im eingeloggten Zustand. Prozentwerte statt der
           dortigen px-Radien, weil das Mockup nur einen Ausschnitt der
           Fensterbreite einnimmt. */
        backgroundImage:
          'radial-gradient(ellipse 70% 60% at 12% 100%, rgba(184, 143, 81, 0.08), transparent 60%),'
          + ' radial-gradient(ellipse 90% 70% at 88% -10%, rgba(140, 162, 119, 0.06), transparent 60%)',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 224px) minmax(0, 1fr)',
        overflow: 'hidden',
        /*
         * Die umschließende <section> in PedimentReveal setzt bewusst
         * pointer-events: none (sie ist mehrere Viewport-Höhen groß und läge
         * sonst über echten Inhalten davor/danach, siehe Kommentar dort).
         * Für die Tilt-/Crosshair-/Puls-Effekte hier muss das gezielt wieder
         * aufgehoben werden — erst ab `run`, also erst wenn der Giebel schon
         * sichtbar offen ist, sonst wäre schon der winzige Dreieck-Spalt zu
         * Beginn über dem Hero-Button klickbar.
         */
        pointerEvents: run ? 'auto' : 'none',
      }}
      className="mock-root"
    >
      {/* ── Sidebar ── */}
      <aside
        className="mock-side"
        style={{
          backgroundColor: APP.sidebar,
          borderRight: `1px solid ${APP.sidebarBorder}`,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        {/* Kopf mit Logo — im echten Dashboard durch eine Linie abgesetzt */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '0 16px',
            height: '56px',
            flexShrink: 0,
            borderBottom: `1px solid ${APP.sidebarBorder}`,
          }}
        >
          <Logo variant="transparent" size={22} />
          <span style={{ fontFamily: F.display, fontSize: '15px', color: APP.sidebarAccentFg, whiteSpace: 'nowrap' }}>
            Athena Finance
          </span>
        </div>

        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '2px', minHeight: 0, overflow: 'hidden' }}>
          {NAV.map(({ icon: Icon, label, children }) => {
            const isActive = label === active
            const isHovered = hoveredNav === label
            return (
              <div key={label}>
                <div
                  className="mock-nav-item"
                  onMouseEnter={() => setHoveredNav(label)}
                  onMouseLeave={() => setHoveredNav(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    fontSize: 'clamp(11px, .92vw, 13px)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    color: isActive ? APP.sidebarPrimaryFg : APP.sidebarFg,
                    backgroundColor: isActive ? APP.sidebarPrimary : isHovered ? 'rgba(184,143,81,.08)' : 'transparent',
                    fontWeight: isActive ? 500 : 400,
                    transition: 'background-color .35s ease, color .35s ease',
                  }}
                >
                  <Icon
                    size={15}
                    strokeWidth={1.6}
                    style={{ flexShrink: 0, color: isActive ? APP.sidebarPrimaryFg : 'currentColor', transition: 'color .35s ease' }}
                  />
                  {label}
                </div>

                {/*
                  Anders als in der echten Sidebar stehen hier IMMER alle
                  Untermenüs offen, nicht nur das der aktiven Gruppe. Bewusste
                  Abweichung: in der App kennt man den Umfang längst und ein
                  zugeklapptes Menü hält die Liste kurz — auf der Landing Page
                  ist diese Sidebar das einzige Inhaltsverzeichnis der App, das
                  jemand zu sehen bekommt. Zugeklappt verschwieg sie elf der
                  achtzehn Bereiche.

                  Die Klasse bleibt trotzdem `open` statt fest ins CSS gezogen
                  zu werden: das Auf-/Zuklappen soll dieselbe Regel bleiben wie
                  in der echten Sidebar (.subnav-container in globals.css),
                  falls hier je wieder umgeschaltet wird.
                */}
                {children && (
                  <div className="mock-subnav-container open">
                    <div className="mock-subnav-inner">
                      {children.map((child) => {
                        // Vorher fest der erste Unterpunkt — das stimmte nur
                        // zufällig, solange jede Szene der erste Eintrag ihrer
                        // Gruppe war. Bei „Investing" ist Depot der zweite.
                        const childActive = child === activeChild
                        return (
                          <div
                            key={child}
                            className="mock-subnav-item"
                            style={{
                              color: childActive ? APP.sidebarAccentFg : APP.mutedFg,
                              backgroundColor: childActive ? APP.sidebarAccent : 'transparent',
                              fontWeight: childActive ? 500 : 400,
                            }}
                          >
                            {child}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Fußbereich: Konto → Einstellungen, wie im echten Dashboard */}
        <div style={{ borderTop: `1px solid ${APP.sidebarBorder}`, padding: '10px 8px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 8px', borderRadius: '6px' }}>
            <Image
              src="/avatar.webp"
              alt=""
              width={28}
              height={28}
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                objectFit: 'cover',
                flexShrink: 0,
                border: `1px solid ${APP.sidebarBorder}`,
              }}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 500, color: APP.sidebarAccentFg, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Eric Schuck
              </p>
              <p style={{ margin: 0, fontSize: '11px', color: APP.mutedFg, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                eric@athena-finance.de
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Inhalt ──
          minHeight: 0 ist hier Pflicht, nicht Kosmetik: `.mock-content` ist
          eine Grid-Zelle in `.mock-root` (das `overflow:hidden` trägt, siehe
          Kommentar unten). Grid-Zellen bekommen ohne explizites minHeight:0
          ein implizites min-height:auto — der Flex-Column-Inhalt kann dadurch
          über die feste Root-Höhe hinauswachsen, statt zu schrumpfen, und der
          Überstand wird kommentarlos abgeschnitten (genau das Kacheln-
          abgeschnitten/Transaktionen-unsichtbar-Problem aus dem Chat). */}
      <div
        className={reserveRight ? 'mock-content mock-content-inset' : 'mock-content'}
        style={{
          padding: 'clamp(18px, 2.2vw, 34px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(12px, 1.4vw, 20px)',
          minWidth: 0,
          minHeight: 0,
        }}
      >
        {/*
          `key={Math.max(view, 0)}` statt roh `key={view}` erzwingt einen
          Remount bei jedem ECHTEN Szenenwechsel und triggert damit die
          mock-view-fade-Animation (siehe landing.css) — ohne das würden die
          Szenen hart umschalten statt weich einzublenden. Jede Szene rendert
          hier ihr KOMPLETTES eigenes Layout, nicht nur getauschte Karten in
          einem gemeinsamen Raster.

          Der Clamp ist hier Pflicht, nicht Kosmetik: `view` durchläuft beim
          Öffnen kurz -1 (Säule noch leer, siehe Kommentar unten) BEVOR es 0
          erreicht — beides zeigt exakt dieselbe Dashboard-Szene (siehe
          `active` oben), aber mit dem rohen `view` als Key sah React darin
          einen Szenenwechsel und blendete die IDENTISCHE Szene einmal aus und
          wieder ein, bevor die Säule überhaupt zu rotieren begann (siehe
          Chat: "dieselbe Szene nochmal mit demselben Übergang, sieht komisch
          aus"). Mit dem Clamp bleiben -1 und 0 derselbe Key — kein Fade,
          die Szene steht einfach durchgehend da, bis der erste ECHTE
          Wechsel (0 → 1) kommt. */}
        <div key={Math.max(view, 0)} className="mock-view-fade" style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(12px, 1.4vw, 20px)', flex: 1, minHeight: 0 }}>
          {/* -1 (Säule noch leer) fällt bewusst auf die Dashboard-Szene durch
              — kein Skeleton-Zwischenschritt mehr, siehe Kommentar bei `active`. */}
          {view === 1 ? <AnalyseView />
            : view === 2 ? <AthenaView />
            : view === 3 ? <CryptoView visible={visible} />
            : <DashboardView run={run} />}
        </div>
      </div>
    </div>
  )
}
