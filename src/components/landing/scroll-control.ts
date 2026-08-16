/**
 * Programmatischer Zugriff auf den aktiven Lenis-Scroll — ausgelagert aus
 * SmoothScrollProvider.tsx (siehe dort), damit diese Datei NUR noch die
 * React-Komponente exportiert: eine .tsx-Datei, die Komponenten UND
 * einzelne Utility-Funktionen exportiert, verwässert die Fast-Refresh-
 * Grenze der Datei (react-doctor/only-export-components) — bei einer
 * fehlgeschlagenen HMR-Aktualisierung lädt der Browser dann die ganze Seite
 * neu statt nur die Komponente zu tauschen.
 */
import type Lenis from 'lenis'

/**
 * Modul-weite Referenz auf die aktive Lenis-Instanz, damit andere
 * Komponenten (siehe scrollToY unten, gebraucht von PillarsReveal fürs
 * Klick-zum-Springen) programmatisch scrollen können, ohne mit Lenis'
 * eigenem virtuellem Scroll zu kollidieren. Kein Context nötig für einen
 * einzigen Verbraucher — dieselbe Idee wie der geteilte Scroll-Listener in
 * LandingClient (useScrollDirection).
 */
let activeLenis: Lenis | null = null

/** Wird ausschließlich von SmoothScrollProvider gesetzt (Mount/Unmount) —
    kein Setter-Export nötig, der über den einen Aufrufer hinausreicht. */
export function setActiveLenis(lenis: Lenis | null) {
  activeLenis = lenis
}

/** Löscht die Referenz nur, wenn sie noch auf DIESE Instanz zeigt — schützt
    beim Strict-Mode-Doppel-Mount davor, dass ein veralteter Cleanup-Aufruf
    eine inzwischen neuere aktive Instanz überschreibt. */
export function clearActiveLenis(lenis: Lenis) {
  if (activeLenis === lenis) activeLenis = null
}

/**
 * Scrollt zur angegebenen Dokument-Position — über Lenis, wenn aktiv (das
 * ist Lenis' eigene, mit seinem virtuellen Scroll konsistente Animation),
 * sonst über natives smooth scrollTo (Fallback für reduzierte Bewegung, wo
 * SmoothScrollProvider gar keine Lenis-Instanz erstellt). Ein normales
 * `window.scrollTo` würde Lenis nicht informieren und sofort wieder von
 * dessen nächstem RAF-Tick überschrieben.
 */
export function scrollToY(y: number) {
  if (activeLenis) activeLenis.scrollTo(y, { duration: 1.2 })
  else window.scrollTo({ top: y, behavior: 'smooth' })
}

/**
 * Springt sofort zur Position, ohne die Scrollbewegung selbst zu zeigen (kein
 * Abspulen der dazwischenliegenden Sektionen) — gedacht für die
 * Sektionsnavigation, die stattdessen mit einem kurzen Fade-Cut überblendet.
 * Läuft trotzdem über Lenis' eigenes `scrollTo({ immediate: true })` statt
 * über ein natives `window.scrollTo`: Lenis' virtueller Scrollstand muss auch
 * bei einem Sprung synchron bleiben, sonst driftet ScrollTrigger danach ab.
 */
export function jumpToY(y: number) {
  if (activeLenis) activeLenis.scrollTo(y, { immediate: true })
  else window.scrollTo(0, y)
}
