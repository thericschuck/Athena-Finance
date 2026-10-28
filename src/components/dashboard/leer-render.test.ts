import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

/**
 * Server-Rendering der Dashboard-Karten mit dem Kern eines Nutzers OHNE Daten: kein Absturz,
 * kein NaN/undefined/Invalid Date. Prueft Markup, nicht Optik.
 */
const hier = path.dirname(fileURLToPath(import.meta.url))
const jiti = createJiti(import.meta.url, {
  alias: { '@': path.resolve(hier, '../..') },
  jsx: { runtime: 'automatic' },
  moduleCache: false,
  interopDefault: true,
})
const { renderToStaticMarkup } = (await jiti.import('react-dom/server')) as { renderToStaticMarkup: (n: unknown) => string }
const { createElement: h } = (await jiti.import('react')) as { createElement: (...a: unknown[]) => unknown }

const SCHLECHT = /NaN|undefined|Invalid Date|\[object|Infinity/

const leererKern = {
  scopeCtx: { userId: 'u', scope: 'ich', available: ['ich'], householdId: null, members: [], partnerId: null, ownerIds: ['u'], includeShared: true, accountIds: [], sharedAccountIds: [], sharedFremdBesitz: false, ibans: [], householdIbans: [] },
  heute: '2026-10-26', locale: 'de-DE', dateFormat: 'dd.MM.yyyy',
  netWorth: 0,
  buckets: { konten: 0, geschaeftsanteile: 0, depot: 0, krypto: 0 },
  nichtImNetWorth: { sparziele: 0, ichSchulde: 0, mirGeschuldet: 0 },
  snapshots: [],
  monat: {
    label: 'Oktober 2026', start: '2026-10-01', einnahmen: 0, ausgaben: 0, netto: 0, konsum: 0,
    echt: { income: 0, expense: 0 }, anlage: { income: 0, expense: 0 }, forderung: { income: 0, expense: 0 },
    sparquote: null, leer: true,
  },
  monatsBudget: null,
  konten: [], depots: [],
  krypto: { gesamt: 0, kosten: null, rebalancingVolumen: 0, lastRebalancing: null, topAssets: [] },
  inventar: { wert: 0, stueck: 0 },
  sparziele: [],
  fixkosten: { total: 0, vertraege: [], konten: [] },
  kuendbar: [], insights: [],
  analytik: { summaries: [], categorySeries: [] },
}

for (const name of ['DashKonten', 'DashSparziele', 'DashMonat', 'DashAnlagen']) {
  test(`${name} rendert ohne Daten ohne NaN/undefined`, async () => {
    const mod = (await jiti.import(path.join(hier, `${name}.tsx`))) as Record<string, (p: object) => unknown>
    const html = renderToStaticMarkup(h(mod[name], { kern: leererKern }))
    assert.doesNotMatch(html, SCHLECHT, `${name}: ${html.match(SCHLECHT)?.[0]}`)
    if (name === 'DashKonten') assert.match(html, /Noch keine Konten/)
    if (name === 'DashSparziele') assert.match(html, /Noch keine Sparziele/)
    if (name === 'DashAnlagen') assert.match(html, /Noch keine Anlagen/)
    if (name === 'DashKonten') assert.match(html, /Konto anlegen/)
  })
}

test('PortfolioDonut ohne Posten rendert nichts (kein leerer Ring)', async () => {
  const mod = (await jiti.import(path.join(hier, 'portfolio-donut.tsx'))) as Record<string, (p: object) => unknown>
  assert.equal(renderToStaticMarkup(h(mod.PortfolioDonut, { posten: [], total: 0, minus: 0, locale: 'de-DE' })), '')
})

// ---- Platzhalter und Leerlogik (Nutzer ohne Daten) ----

const mitDaten = {
  ...leererKern,
  netWorth: 5000,
  konten: [{ id: 'k1', name: 'Giro', type: 'checking', color: null, currency: 'EUR', saldo: 5000, hatBuchungen: true }],
  snapshots: [{}, {}],
}

async function ladeAsync(name: string): Promise<(p: object) => Promise<unknown>> {
  const mod = (await jiti.import(path.join(hier, `${name}.tsx`))) as Record<string, (p: object) => Promise<unknown>>
  return mod[name]
}

test('DashVerlauf ohne Verlauf: Platzhalter mit Text und Button, ohne NaN', async () => {
  const el = await (await ladeAsync('DashVerlauf'))({ kern: leererKern })
  const html = renderToStaticMarkup(el)
  assert.doesNotMatch(html, SCHLECHT)
  assert.match(html, /Dein Vermögensverlauf erscheint hier/)
  assert.match(html, /Konto anlegen/)
  assert.match(html, /min-h-\[320px\]/)
  assert.match(html, /aria-hidden/)
})

test('DashVerlauf mit Konto, aber ohne zwei Snapshots: Zwischenzustand ohne Button', async () => {
  const kern = { ...leererKern, konten: [{ ...mitDaten.konten[0], hatBuchungen: false }], snapshots: [{}] }
  const html = renderToStaticMarkup(await (await ladeAsync('DashVerlauf'))({ kern }))
  assert.match(html, /entsteht gerade/)
  assert.doesNotMatch(html, /Konto anlegen|erscheint hier/)
})

test('DashAusblick ohne Buchungen: Leer-Ansicht, keine Warnung', async () => {
  const html = renderToStaticMarkup(await (await ladeAsync('DashAusblick'))({ kern: leererKern }))
  assert.doesNotMatch(html, SCHLECHT)
  assert.match(html, /startet, sobald du ein Konto mit Buchungen hast/)
  assert.doesNotMatch(html, /Wird knapp|<svg/)
})

test('DashZustand ohne Buchungen: nichts', async () => {
  assert.equal(await (await ladeAsync('DashZustand'))({ kern: leererKern }), null)
})

test('AufteilungPlatzhalter rendert Ring-Silhouette und Text', async () => {
  const mod = (await jiti.import(path.join(hier, 'DashPlatzhalter.tsx'))) as Record<string, () => unknown>
  const html = renderToStaticMarkup(h(mod.AufteilungPlatzhalter))
  assert.doesNotMatch(html, SCHLECHT)
  assert.match(html, /Hier erscheint deine Vermögensaufteilung/)
  assert.match(html, /<svg[^>]*aria-hidden/)
})

test('DashKennzahlen ohne Daten: gedaempft mit Tooltip; mit Daten nicht', async () => {
  // Die Kennzahlen laden die Prognose ueber Supabase; hier nur geprueft, dass die Regel so greift.
  const { dashboardLeer } = (await jiti.import(path.join(hier, '../../lib/dashboard/leer.ts'))) as typeof import('../../lib/dashboard/leer')
  assert.equal(dashboardLeer(leererKern as never).leer, true)
  assert.equal(dashboardLeer(mitDaten as never).leer, false)
})

test('Kern mit Daten: keine Platzhalter bei Konten und Anlagen', async () => {
  const konten = (await jiti.import(path.join(hier, 'DashKonten.tsx'))) as Record<string, (p: object) => unknown>
  const html = renderToStaticMarkup(h(konten.DashKonten, { kern: mitDaten }))
  assert.match(html, /Giro/)
  assert.doesNotMatch(html, /Noch keine Konten|Konto anlegen/)
  const anl = (await jiti.import(path.join(hier, 'DashAnlagen.tsx'))) as Record<string, (p: object) => unknown>
  assert.equal(renderToStaticMarkup(h(anl.DashAnlagen, { kern: mitDaten })), '')
})
