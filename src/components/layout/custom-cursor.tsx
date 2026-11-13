'use client'

import { useEffect } from 'react'
import { useCursorStil, usePrivatStil } from '@/lib/lokale-darstellung'

/**
 * Hängt die lokal gewählte Darstellung an <html> (`data-cursor`, `data-privacy-style`);
 * die eigentlichen Regeln stehen in globals.css. Rendert selbst nichts.
 *
 * Der Cursor ist ein reines CSS-Cursor-Bild (kein Overlay, das der Maus hinterherläuft):
 * kein Versatz, kein Ruckeln, und er greift nur bei Maus/Trackpad — die Media Query dafür
 * sitzt in der CSS, nicht hier, damit er nicht flackert, wenn sich der Zeigertyp ändert.
 */
export function CustomCursor() {
  const [stil] = useCursorStil()
  const [privat] = usePrivatStil()

  useEffect(() => {
    document.documentElement.setAttribute('data-privacy-style', privat)
    // Die Balken-Schrift vorab laden: bis sie da ist, bleibt der Text beim Verstecken unsichtbar
    // (font-display: block) — so entsteht keine Pause zwischen „weg“ und „Balken“.
    if (privat === 'balken') void document.fonts?.load("1em 'Athena Balken'", '0').catch(() => {})
  }, [privat])

  useEffect(() => {
    const root = document.documentElement
    if (stil === 'pfeil') root.setAttribute('data-cursor', 'pfeil')
    else root.removeAttribute('data-cursor')
    return () => root.removeAttribute('data-cursor')
  }, [stil])

  useEffect(() => {
    if (stil !== 'pfeil') return
    return pfeilFarbenSynchron()
  }, [stil])

  return null
}

/**
 * Pfeil-Form. MUSS mit dem Standard-Pfeil in globals.css (`--athena-cursor-pfeil` in :root)
 * übereinstimmen — der gilt, bis die Theme-Farben unten berechnet sind, damit zwischendurch
 * nie der System-Cursor aufblitzt.
 */
const PFEIL_PFAD = 'M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z'

function pfeilBild(fuellung: string, kontur: string) {
  // 22 px: der System-Pfeil ist ca. 17 px hoch, dieser ca. 16 — dezent, nicht groesser als gewohnt.
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 24 24'>` +
    `<path d='${PFEIL_PFAD}' fill='${fuellung}' stroke='${kontur}' stroke-width='1.7' stroke-linejoin='round' paint-order='stroke'/>` +
    `</svg>`
  // Hotspot (4 4) = Spitze des Pfeils.
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 4 4, auto`
}

/**
 * CSS-Cursor sind Bilder — `var(--primary)` greift darin nicht. Deshalb werden die
 * Theme-Farben hier in feste RGB-Werte übersetzt und als SVG-Data-URI in einer
 * CSS-Variable auf <html> abgelegt. Ein MutationObserver baut sie bei Theme-Wechsel neu.
 * Die Variable wird nur beim Abbau entfernt, nie zwischendurch — sonst gäbe es Lücken,
 * in denen der System-Cursor erscheint.
 */
function pfeilFarbenSynchron(): () => void {
  const root = document.documentElement
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  let letzter = ''

  const rgb = (cssVar: string, fallback: string) => {
    const probe = document.createElement('span')
    probe.style.color = `var(${cssVar}, ${fallback})`
    probe.style.display = 'none'
    document.body.append(probe)
    const farbe = getComputedStyle(probe).color
    probe.remove()
    if (!ctx) return fallback
    // Über das Canvas normalisiert: computed `color` kann oklch(...) sein, das nicht jeder
    // Browser im Cursor-SVG versteht.
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = fallback
    ctx.fillStyle = farbe
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    return `rgb(${r},${g},${b})`
  }

  const aktualisiere = () => {
    // Fuellung = Akzentfarbe des Themes, Kontur = Hintergrund: der Pfeil ist farbig statt weiss/
    // schwarz und bleibt auch auf gleichfarbigen Flaechen (Primary-Buttons) an der Kontur erkennbar.
    const hg = rgb('--background', '#f7f4ee')
    const akzent = rgb('--primary', '#b8902f')
    const schluessel = `${hg}|${akzent}`
    if (schluessel === letzter) return
    letzter = schluessel
    root.style.setProperty('--athena-cursor-pfeil', pfeilBild(akzent, hg))
  }

  aktualisiere()
  const beobachter = new MutationObserver(aktualisiere)
  beobachter.observe(root, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] })
  return () => {
    beobachter.disconnect()
    root.style.removeProperty('--athena-cursor-pfeil')
  }
}
