'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Image from 'next/image'
import { ChevronDown, Infinity as InfinityIcon } from 'lucide-react'
import { useReducedMotion } from '@/lib/use-reduced-motion'
import { C, kicker } from '@/components/landing/landing-tokens'
import { scrollToY } from '@/components/landing/scroll-control'
import { gsap } from '@/components/landing/islands/gsap-setup'
import { STATS } from '@/components/landing/shared/stats'
import { DashboardMock } from '@/components/landing/DashboardMock'

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

export function PedimentReveal({
  introContent,
  statsStill,
  statsBand,
}: {
  /** Fries + Kranz der Zierfüllung (Server-gerendert, siehe PedimentSection). */
  introContent: ReactNode
  /** Kennzahlen-Band für reduzierte Bewegung. */
  statsStill: ReactNode
  /** Kennzahlen-Band für schmale Displays (.stats-band-sm). */
  statsBand: ReactNode
}) {
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

  /**
   * Klick auf den Pfeil unter der Säule springt weiter — zur nächsten
   * Kennzahl, oder, auf der letzten Kennzahl, über das Szenenende hinaus in
   * den nächsten Seitenabschnitt (siehe Chat: "sollte nicht verschwinden,
   * dann kann es nach unten führen" — der Pfeil bleibt also stehen, statt
   * ins Nichts zu zeigen, sobald nichts mehr zu rotieren ist).
   *
   * Dieselbe Idee wie jumpToPillar/jumpToStep in PillarsReveal/AnalyseReveal:
   * die Säulen-Rotation ist reiner Scroll-Fortschritt (state.phi, siehe
   * `build()` oben), "hinspringen" heißt also nur, dorthin zu scrollen, wo
   * phi = i * STAT_STEP_DEG wäre — kein zweiter Animationsmechanismus nötig.
   *
   * Die Rechnung spiegelt exakt das Rotations-Tween in `build()`: es läuft
   * von Timeline-Position p(OPEN_VH + HOLD_VH) über die Dauer p(COLUMN_ROTATE_VH)
   * linear (`ease:'none'`) von COLUMN_START_DEG bis COLUMN_END_DEG. `rotateFrac`
   * ist der Anteil davon, den phi bis zum Ziel-Winkel schon zurückgelegt hat.
   *
   * `scrollDistance <= 0` erkennt zuverlässig, ob die Säule überhaupt aktiv
   * ist (siehe jumpToPillar-Kommentar) — unter COLUMN_MIN_WIDTH bleibt die
   * Sektion per `build(false)` auf die kürzere, säulenlose Fassung genormt,
   * in der ein Sprung ohnehin ins Leere liefe.
   */
  const jumpToNextStat = () => {
    const scene = sceneRef.current
    if (!scene) return
    const scrollDistance = scene.offsetHeight - window.innerHeight
    if (scrollDistance <= 0) return
    const sceneTop = scene.getBoundingClientRect().top + window.scrollY

    const current = Math.max(0, view)
    if (current >= STATS.length - 1) {
      // Letzte Kennzahl: über das Szenenende hinaus scrollen, statt an Ort
      // und Stelle zu verharren — führt in den nächsten Seitenabschnitt.
      scrollToY(sceneTop + scene.offsetHeight)
      return
    }

    const targetDeg = (current + 1) * STAT_STEP_DEG
    const rotateFrac = (targetDeg - COLUMN_START_DEG) / (COLUMN_END_DEG - COLUMN_START_DEG)
    const t = p(OPEN_VH + HOLD_VH) + rotateFrac * p(COLUMN_ROTATE_VH)
    scrollToY(sceneTop + t * scrollDistance)
  }

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
        {statsStill}
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
          {introContent}
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

          {/*
            "Weiter"-Hinweis am Fuß der Säule — spiegelt den "Scroll"-Hinweis
            über dem Giebel (siehe .pediment-cue), diesmal mit klickbarem
            Pfeil statt reiner Deko. pointer-events:auto nötig, weil
            .mock-column selbst komplett pointer-events:none ist (siehe
            dort) — sonst gäbe es kein Klick-Ziel.

            Bleibt bewusst auch auf der letzten Kennzahl stehen, statt zu
            verschwinden (siehe Chat): jumpToNextStat springt dort über das
            Szenenende hinaus in den nächsten Seitenabschnitt statt zur
            nächsten Kennzahl — derselbe Pfeil, dieselbe Richtung, nur ein
            anderes Ziel.
          */}
          <button
            type="button"
            onClick={jumpToNextStat}
            aria-label="Weiter"
            className="mock-column-next"
          >
            <span className="mock-column-next-label" style={{ ...kicker, fontSize: '10px' }}>Scroll</span>
            <ChevronDown size={16} strokeWidth={1.6} aria-hidden />
          </button>
        </div>
      </div>
    </section>

    {/*
      Ersatz für die Säule auf schmalen Displays, wo sie dem Mockup die Breite
      nähme (siehe .mock-column-Media-Query). Nur dort sichtbar — sonst
      stünden die vier Zahlen zweimal auf der Seite.
    */}
    {statsBand}
    </>
  )
}
