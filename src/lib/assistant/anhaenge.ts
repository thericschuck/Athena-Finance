/**
 * Reine Hilfen für Datei-Anhänge im Eingabefeld: Entscheidung „Bild verkleinern?“, Zielgröße,
 * Byte-Budget einer Nachricht. Die Browser-Teile (Canvas, Upload) liegen in
 * components/assistant/chat/useAnhaenge.ts und rufen nur diese Funktionen.
 *
 * Importe mit .ts-Endung, damit node:test die Datei ohne Bundler laden kann (tsconfig erlaubt es).
 */

import { MAX_DATEIEN_PRO_NACHRICHT, MODELL_BILD_TYPEN, MODELL_BYTE_BUDGET, formatGroesse } from './dateien.ts'

const MB = 1024 * 1024

/** Längste Kante nach dem Verkleinern. */
export const MAX_KANTE_PX = 2000
/** Ab dieser Größe wird ein Bild auch dann verkleinert, wenn Typ und Kante passen. */
export const VERKLEINERN_AB_BYTES = 3 * MB
/** Grenzen der API je Bild: 5 MB und 8000 px. */
export const API_MAX_BILD_BYTES = 5 * MB
export const API_MAX_KANTE_PX = 8000
export const JPEG_QUALITAET = 0.85
/** Reihenfolge der Qualitätsstufen, falls das Ergebnis noch über 5 MB liegt. */
export const JPEG_STUFEN = [JPEG_QUALITAET, 0.7, 0.55, 0.4] as const

export function istModellBildTyp(typ: string): boolean {
  return (MODELL_BILD_TYPEN as readonly string[]).includes(typ)
}

/** `true` für HEIC/HEIF — Browser außer Safari können sie nicht dekodieren. */
export function istHeic(typ: string, name: string): boolean {
  return /^image\/hei[cf]$/i.test(typ) || /\.hei[cf]$/i.test(name)
}

/**
 * Muss das Bild vor dem Upload neu kodiert werden? GIF bleibt unverändert (Neukodieren
 * würde die Animation zerstören). Sonst: Typ unbekannt für die API, oder zu groß in Bytes, oder
 * zu große Kante.
 */
export function sollBildVerkleinern(b: {
  mediaType: string
  size: number
  width: number
  height: number
}): boolean {
  if (b.mediaType === 'image/gif') return false
  if (!istModellBildTyp(b.mediaType)) return true
  if (b.size > VERKLEINERN_AB_BYTES) return true
  return Math.max(b.width, b.height) > MAX_KANTE_PX
}

/** Zielgröße bei längster Kante `maxKante`; vergrößert nie, bleibt >= 1 px. */
export function zielGroesse(
  breite: number,
  hoehe: number,
  maxKante: number = MAX_KANTE_PX,
): { breite: number; hoehe: number } {
  const laengste = Math.max(breite, hoehe)
  if (laengste <= 0) return { breite: 1, hoehe: 1 }
  const faktor = Math.min(1, maxKante / laengste)
  return {
    breite: Math.max(1, Math.round(breite * faktor)),
    hoehe: Math.max(1, Math.round(hoehe * faktor)),
  }
}

/** Passt ein fertiges Bild in die Grenzen der API? */
export function bildErfuelltApiGrenzen(b: { size: number; width: number; height: number }): boolean {
  return b.size <= API_MAX_BILD_BYTES && Math.max(b.width, b.height) <= API_MAX_KANTE_PX
}

/** Dateiname mit neuer Endung (`foto.heic` -> `foto.jpg`). */
export function mitEndung(name: string, endung: string): string {
  const i = name.lastIndexOf('.')
  return `${i > 0 ? name.slice(0, i) : name}.${endung}`
}

/** Summe der Endgrößen. */
export function summeBytes(groessen: number[]): number {
  return groessen.reduce((s, g) => s + g, 0)
}

/** `null` = passt; sonst verständliche Ablehnung, wenn `neu` zu `bisher` nicht mehr hinein darf. */
export function pruefeBudget(bisher: number, neu: number, name: string): string | null {
  if (bisher + neu <= MODELL_BYTE_BUDGET) return null
  return `„${name}“ passt nicht mehr in diese Nachricht: zusammen höchstens ${formatGroesse(MODELL_BYTE_BUDGET)} (bisher ${formatGroesse(bisher)}).`
}

/** `null` = noch Platz für eine weitere Datei. */
export function pruefeAnzahl(aktuell: number, name: string): string | null {
  if (aktuell < MAX_DATEIEN_PRO_NACHRICHT) return null
  return `„${name}“ nicht hinzugefügt: höchstens ${MAX_DATEIEN_PRO_NACHRICHT} Dateien pro Nachricht.`
}

/** Kürzt einen Dateinamen in der Mitte, die Endung bleibt sichtbar (`lange-rechnung….pdf`). */
export function kuerzeName(name: string, max = 22): string {
  if (name.length <= max) return name
  const i = name.lastIndexOf('.')
  const endung = i > 0 && name.length - i <= 6 ? name.slice(i) : ''
  const kopf = name.slice(0, Math.max(1, max - endung.length - 1))
  return `${kopf}…${endung}`
}
