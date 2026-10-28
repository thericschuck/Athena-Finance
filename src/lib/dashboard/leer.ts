/**
 * "Keine Daten" auf dem Dashboard - EINE Regel, die alle Karten teilen (reine Logik, ohne React).
 *
 * - `keineKonten`:    es gibt kein einziges Konto im Scope.
 * - `keineBuchungen`: kein Konto hat je eine Buchung (inkl. "keine Konten"). Dann gibt es nichts zu
 *                     prognostizieren oder zu pruefen (Liquiditaets-Ausblick, Steuer-Zustand).
 * - `leer`:           wirklich nichts da - keine Buchungen UND kein Vermoegen (Depot, Krypto, Net Worth 0).
 *                     Nur dann werden Kennzahlen gedaempft und Hinweis-/Zustandszeilen ausgeblendet.
 * - `verlauf`:        'daten' ab zwei Snapshots; sonst 'leer' (keine Konten) oder 'wartet'
 *                     (Konto da, aber der Verlauf hat noch keine zwei Tage).
 */

export interface LeerKern {
  netWorth: number
  konten: readonly { hatBuchungen: boolean }[]
  depots: readonly unknown[]
  krypto: { gesamt: number }
  snapshots: readonly unknown[]
}

export type VerlaufZustand = 'daten' | 'leer' | 'wartet'

export interface DashboardLeer {
  keineKonten: boolean
  keineBuchungen: boolean
  leer: boolean
  verlauf: VerlaufZustand
}

export function dashboardLeer(kern: LeerKern): DashboardLeer {
  const keineKonten = kern.konten.length === 0
  const keineBuchungen = !kern.konten.some(k => k.hatBuchungen)
  const leer = keineBuchungen && kern.netWorth === 0 && kern.depots.length === 0 && kern.krypto.gesamt === 0
  const verlauf: VerlaufZustand = kern.snapshots.length >= 2 ? 'daten' : keineKonten ? 'leer' : 'wartet'
  return { keineKonten, keineBuchungen, leer, verlauf }
}
