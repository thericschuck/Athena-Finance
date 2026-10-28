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

test('ErsteSchritteListe: alle Zaehler 0 -> 8 Schritte in 2 Gruppen, 0 von 8, erster Schritt primaer, Direktlinks', async () => {
  const { ErsteSchritteListe } = (await laden('ErsteSchritteListe.tsx')) as { ErsteSchritteListe: (p: object) => unknown }
  const logik = (await laden('../../lib/leer/erste-schritte.ts')) as {
    ersteSchritte: (z: object) => unknown[]; LEERE_ZAEHLER: object
  }
  const html = renderToStaticMarkup(h(ErsteSchritteListe, { schritte: logik.ersteSchritte(logik.LEERE_ZAEHLER) }))
  sauber(html, 'ErsteSchritteListe')
  assert.equal((html.match(/<li /g) ?? []).length, 8)
  assert.match(html, /0 von 8/)
  assert.match(html, /aria-valuenow="0"/)
  assert.match(html, /Konto anlegen/)
  // zwei Gruppen mit Ueberschrift, Nummerierung laeuft durch (1..8)
  assert.match(html, /Grundlagen/)
  assert.match(html, /Anbindungen und mehr/)
  assert.match(html, />8</)
  // Direktlinks in die Einstellungen
  assert.match(html, /href="\/settings\?tab=integrationen"/)
  assert.match(html, /Bank verbinden/)
  assert.match(html, /Krypto verbinden/)
  // Athena kennenlernen: Titel, Aktion und Direktlink in den Chat
  assert.match(html, /Athena kennenlernen/)
  assert.match(html, /href="\/assistant\?start=kennenlernen"/)
})

test('ErsteSchritteListe: Eigentuemer ohne Partner sieht zusaetzlich "Partner einladen" (9 Schritte)', async () => {
  const { ErsteSchritteListe } = (await laden('ErsteSchritteListe.tsx')) as { ErsteSchritteListe: (p: object) => unknown }
  const logik = (await laden('../../lib/leer/erste-schritte.ts')) as {
    ersteSchritte: (z: object) => unknown[]; LEERE_ZAEHLER: object
  }
  const html = renderToStaticMarkup(h(ErsteSchritteListe, {
    schritte: logik.ersteSchritte({ ...logik.LEERE_ZAEHLER, partnerEinladbar: true }),
  }))
  sauber(html, 'ErsteSchritteListe mit Partner-Schritt')
  assert.equal((html.match(/<li /g) ?? []).length, 9)
  assert.match(html, /Partner einladen/)
  assert.match(html, /href="\/settings\?tab=haushalt"/)
})

test('ErsteSchritteListe: alles erledigt -> 8 von 8, 100 %', async () => {
  const { ErsteSchritteListe } = (await laden('ErsteSchritteListe.tsx')) as { ErsteSchritteListe: (p: object) => unknown }
  const logik = (await laden('../../lib/leer/erste-schritte.ts')) as { ersteSchritte: (z: object) => unknown[] }
  const html = renderToStaticMarkup(h(ErsteSchritteListe, {
    schritte: logik.ersteSchritte({
      konten: 2, bankVerbunden: true, buchungen: 40, kategorien: 9, vertraege: 1, sparziele: 0, athenaChats: 2,
      kryptoAssets: 1, depots: 1,
    }),
  }))
  sauber(html, 'ErsteSchritteListe fertig')
  assert.match(html, /8 von 8/)
  assert.match(html, /aria-valuenow="100"/)
})

type Logik = {
  checklisteStatus: (z: object | null, flag: string | null) => unknown
  LEERE_ZAEHLER: Record<string, unknown>
}

async function karte(teil: object, flag: string | null = null): Promise<string> {
  const { ErsteSchritteKarte } = (await laden('ErsteSchritteKarte.tsx')) as { ErsteSchritteKarte: (p: object) => unknown }
  const logik = (await laden('../../lib/leer/erste-schritte.ts')) as Logik
  const ansicht = logik.checklisteStatus({ ...logik.LEERE_ZAEHLER, ...teil }, flag)
  assert.equal(typeof ansicht, 'object')
  return renderToStaticMarkup(h(ErsteSchritteKarte, { ansicht }))
}

test('ErsteSchritteKarte: zugeklappt nur der naechste Schritt, X mit aria-label, Aufklapper mit aria-expanded', async () => {
  const html = await karte({ konten: 1, buchungen: 4, kategorien: 2 })
  sauber(html, 'ErsteSchritteKarte')
  assert.match(html, /Erste Schritte/)
  assert.match(html, /3 von 8/)
  assert.match(html, /aria-label="Checkliste ausblenden"/)
  assert.match(html, /aria-expanded="false"/)
  assert.match(html, /Alle Schritte anzeigen/)
  // naechster Schritt: Vertrag anlegen, mit Aktion
  assert.match(html, /Vertrag oder Sparziel anlegen/)
  assert.match(html, /href="\/finance\/contracts"/)
  // weder Liste noch andere Schritte
  assert.equal((html.match(/<li /g) ?? []).length, 0)
  assert.doesNotMatch(html, /Krypto-Konto verbinden/)
  assert.doesNotMatch(html, /Anbindungen und mehr/)
})

test('ErsteSchritteKarte: Willkommen-Titel nur bei voellig leerem Konto', async () => {
  const leer = await karte({})
  sauber(leer, 'ErsteSchritteKarte leer')
  assert.match(leer, /Willkommen – so legst du los/)
  assert.match(leer, /0 von 8/)
  assert.match(leer, /Konto anlegen/)
  assert.doesNotMatch(await karte({ konten: 1 }), /Willkommen/)
})

test('ErsteSchritteKarte: alle Schritte erledigt, ausgeblendet oder fertig liefert keine Ansicht', async () => {
  const logik = (await laden('../../lib/leer/erste-schritte.ts')) as Logik
  const alles = { konten: 1, buchungen: 1, kategorien: 1, vertraege: 1, athenaChats: 1, bankVerbindungen: 1, kryptoKonten: 1, depots: 1 }
  assert.equal(logik.checklisteStatus({ ...logik.LEERE_ZAEHLER, ...alles }, null), 'fertig')
  assert.equal(logik.checklisteStatus(null, 'ausgeblendet'), 'ausgeblendet')
  assert.equal(logik.checklisteStatus(null, 'fertig'), 'fertig')
})

test('ErsteSchritteKarte: Fortschrittsbalken mit role/aria-Werten, Prozent sichtbar, Titel gross, Aktion', async () => {
  const html = await karte({ konten: 1, buchungen: 4, kategorien: 2 })
  assert.match(html, /role="progressbar"/)
  assert.match(html, /aria-valuenow="38"/)
  assert.match(html, /aria-valuemin="0"/)
  assert.match(html, /aria-valuemax="100"/)
  assert.match(html, /aria-label="3 von 8 Schritten erledigt"/)
  assert.match(html, />38 %</)
  assert.match(html, /Als Nächstes/)
  assert.match(html, /erste-schritte-ein/)
  assert.doesNotMatch(html, /Grundlagen erledigt/)
})

test('ErsteSchritteKarte: Grundlagen fertig, Anbindungen offen -> freundlicher Zwischenzustand', async () => {
  const html = await karte({ konten: 1, buchungen: 4, kategorien: 2, vertraege: 1 })
  sauber(html, 'ErsteSchritteKarte Zwischenzustand')
  assert.match(html, /Grundlagen erledigt/)
  assert.match(html, /Weiter mit den Anbindungen/)
  assert.match(html, /Als Nächstes \(optional\)/)
  assert.match(html, /aria-valuenow="50"/)
  assert.match(html, /aria-label="Checkliste ausblenden"/)
  assert.match(html, /aria-expanded="false"/)
})

test('ErsteSchritteKarte: schmale Variante ohne Beschreibung, mit Aktion', async () => {
  const { ErsteSchritteKarte } = (await laden('ErsteSchritteKarte.tsx')) as { ErsteSchritteKarte: (p: object) => unknown }
  const logik = (await laden('../../lib/leer/erste-schritte.ts')) as Logik
  const ansicht = logik.checklisteStatus({ ...logik.LEERE_ZAEHLER }, null)
  const breit = renderToStaticMarkup(h(ErsteSchritteKarte, { ansicht }))
  const schmal = renderToStaticMarkup(h(ErsteSchritteKarte, { ansicht, schmal: true }))
  sauber(schmal, 'ErsteSchritteKarte schmal')
  assert.match(schmal, /href="\/finance\/accounts"/)
  assert.ok(schmal.length < breit.length)
  assert.doesNotMatch(schmal, /Ein Konto ist die Basis/)
  assert.match(breit, /Ein Konto ist die Basis/)
})
