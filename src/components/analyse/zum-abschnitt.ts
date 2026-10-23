/**
 * Scrollt sanft zu einem Abschnitt der Seite (z. B. `#buchungen`), nachdem ein Chart-Klick einen
 * Filter gesetzt hat. Der Abschnitt steht schon im DOM — nur sein Inhalt wird vom Server neu
 * geliefert —, deshalb genügt ein kurzer Aufschub, damit die Navigation (Transition) den
 * Scroll-Zustand nicht gleich wieder überschreibt. `prefers-reduced-motion` wird respektiert.
 */
export function zumAbschnitt(id: string): void {
  if (typeof window === 'undefined') return
  window.setTimeout(() => {
    const el = document.getElementById(id)
    if (!el) return
    const ruhig = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: ruhig ? 'auto' : 'smooth', block: 'start' })
  }, 80)
}
