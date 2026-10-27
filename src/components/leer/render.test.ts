import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

/**
 * Server-Rendering der Leerzustands-Bausteine mit leeren/Null-Props: faengt Abstuerze, NaN,
 * „undefined“, „Invalid Date“ und leere Marker ab. Kein Browser — Layout und Optik prueft das nicht.
 * jiti uebersetzt TSX und den Alias `@/` ohne Build.
 */
const hier = path.dirname(fileURLToPath(import.meta.url))
const jiti = createJiti(import.meta.url, {
  alias: { '@': path.resolve(hier, '../..') },
  jsx: { runtime: 'automatic' },
  moduleCache: false,
  interopDefault: true,
})

type Mod = Record<string, unknown>
const laden = async (rel: string): Promise<Mod> => (await jiti.import(path.join(hier, rel))) as Mod
const { renderToStaticMarkup } = (await jiti.import('react-dom/server')) as { renderToStaticMarkup: (n: unknown) => string }
const { createElement: h } = (await jiti.import('react')) as { createElement: (...a: unknown[]) => unknown }

const SCHLECHT = /NaN|undefined|Invalid Date|\[object|null</

function sauber(html: string, name: string) {
  assert.ok(html.length > 0, `${name}: leer`)
  assert.doesNotMatch(html, SCHLECHT, `${name}: ${html.match(SCHLECHT)?.[0]}`)
}

test('LeerZustand: Titel, Text und primaere Aktion erscheinen', async () => {
  const { LeerZustand } = (await laden('LeerZustand.tsx')) as { LeerZustand: (p: object) => unknown }
  const html = renderToStaticMarkup(h(LeerZustand, {
    titel: 'Noch keine Konten', text: 'Konten sind die Basis.', aktion: { label: 'Konto anlegen', href: '/finance/accounts' },
    sekundaer: { label: 'Bank verbinden', href: '/settings' },
  }))
  sauber(html, 'LeerZustand')
  assert.match(html, /Noch keine Konten/)
  assert.match(html, /href="\/finance\/accounts"/)
  assert.match(html, /href="\/settings"/)
  assert.match(html, /role="status"/)
})

test('LeerZustand: ohne Aktion keine leere Aktionszeile', async () => {
  const { LeerZustand } = (await laden('LeerZustand.tsx')) as { LeerZustand: (p: object) => unknown }
  const html = renderToStaticMarkup(h(LeerZustand, { titel: 'Nichts da', text: 'Text.', variante: 'kompakt' }))
  sauber(html, 'LeerZustand kompakt')
  assert.doesNotMatch(html, /<a /)
})

test('ErsteSchritteListe: alle Zaehler 0 -> 5 Schritte, 0 von 4, erster Schritt primaer', async () => {
  const { ErsteSchritteListe } = (await laden('ErsteSchritteListe.tsx')) as { ErsteSchritteListe: (p: object) => unknown }
  const logik = (await laden('../../lib/leer/erste-schritte.ts')) as {
    ersteSchritte: (z: object) => unknown[]; LEERE_ZAEHLER: object
  }
  const html = renderToStaticMarkup(h(ErsteSchritteListe, { schritte: logik.ersteSchritte(logik.LEERE_ZAEHLER) }))
  sauber(html, 'ErsteSchritteListe')
  assert.equal((html.match(/<li /g) ?? []).length, 5)
  assert.match(html, /0 von 4/)
  assert.match(html, /aria-valuenow="0"/)
  assert.match(html, /Konto anlegen/)
})

test('ErsteSchritteListe: alles erledigt -> 4 von 4, keine Aktionen ausser Athena', async () => {
  const { ErsteSchritteListe } = (await laden('ErsteSchritteListe.tsx')) as { ErsteSchritteListe: (p: object) => unknown }
  const logik = (await laden('../../lib/leer/erste-schritte.ts')) as { ersteSchritte: (z: object) => unknown[] }
  const html = renderToStaticMarkup(h(ErsteSchritteListe, {
    schritte: logik.ersteSchritte({ konten: 2, bankVerbunden: true, buchungen: 40, kategorien: 9, vertraege: 1, sparziele: 0, athenaChats: 0, anlagen: 0 }),
  }))
  sauber(html, 'ErsteSchritteListe fertig')
  assert.match(html, /4 von 4/)
  assert.match(html, /aria-valuenow="100"/)
})

test('DashboardEinstieg: rendert ohne Hinweis und mit Hinweis', async () => {
  const { DashboardEinstieg } = (await laden('DashboardEinstieg.tsx')) as { DashboardEinstieg: (p: object) => unknown }
  const logik = (await laden('../../lib/leer/erste-schritte.ts')) as { ersteSchritte: (z: object) => unknown[]; LEERE_ZAEHLER: object }
  const schritte = logik.ersteSchritte(logik.LEERE_ZAEHLER)
  const ohne = renderToStaticMarkup(h(DashboardEinstieg, { schritte, hinweis: null }))
  sauber(ohne, 'DashboardEinstieg')
  assert.match(ohne, /Willkommen/)
  assert.match(ohne, /href="\/settings"/)
  const mit = renderToStaticMarkup(h(DashboardEinstieg, {
    schritte, hinweis: { ziel: 'gemeinsam', text: 'Hinweistext', aktion: 'Zu Gemeinsam wechseln' },
  }))
  sauber(mit, 'DashboardEinstieg mit Hinweis')
  assert.match(mit, /Hinweistext/)
})
