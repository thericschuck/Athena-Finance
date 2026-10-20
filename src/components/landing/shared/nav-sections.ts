/**
 * Dieselbe Reihenfolge/Beschriftung wie die vier nummerierten SectionHead-
 * Instanzen weiter unten (index="I"…"IV") — hier zentral gepflegt, damit
 * SectionProgressBar sie nicht aus dem JSX herauslesen muss. `tone` steuert
 * hell/dunkel wie bei SectionHead selbst, hier aber für die Leiste: II (Die
 * Säulen) läuft auf Onyx, alle anderen auf Parchment-artigem Grund.
 */
export const NUMBERED_SECTIONS = [
  { index: 'I', label: 'Das Instrumentarium', tone: 'light' },
  { index: 'II', label: 'Die Säulen', tone: 'dark' },
  { index: 'III', label: 'Die Analyse', tone: 'light' },
  { index: 'IV', label: 'Der Weg', tone: 'light' },
] as const

export type NavItem = { index: string; label: string; tone: 'light' | 'dark' }

/** Für das Dropdown der Sticky-Leiste — Prolog plus alle nummerierten Sektionen. */
export const NAV_ITEMS: NavItem[] = [{ index: 'Prolog', label: 'Anfang', tone: 'dark' }, ...NUMBERED_SECTIONS]

/**
 * Der Footer listet dieselben Sektionen noch einmal auf (siehe FooterSections)
 * und soll beim Klick GENAUSO springen wie die Sticky-Leiste selbst — also
 * über deren `jumpTo` (Fade-Cut statt sichtbarem Durchscrollen, siehe
 * SectionProgressBar), nicht über einen nativen `href="#anchor"`-Sprung, der
 * sich anders anfühlen würde. Ein CustomEvent statt Props/Context: der Footer
 * sitzt strukturell weit von SectionProgressBar entfernt, beide werden
 * unabhängig in `LandingClient` gerendert.
 */
export const SECTION_JUMP_EVENT = 'af:jump-to-section'
export function requestSectionJump(index: string) {
  window.dispatchEvent(new CustomEvent(SECTION_JUMP_EVENT, { detail: index }))
}
