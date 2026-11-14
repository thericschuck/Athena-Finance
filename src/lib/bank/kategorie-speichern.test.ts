import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BULK_MAX, speichereKategorie, type FetchFunktion } from './kategorie-speichern.ts'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`)
const antwort = (ok: boolean, body: unknown, status = ok ? 200 : 500) => ({ ok, status, json: async () => body })

/** Antwortet auf jeden Aufruf mit der Zahl der geschickten IDs als `updated`. */
function ehrlich(): { fn: FetchFunktion; aufrufe: { ids: string[]; category_id: string | null }[] } {
  const aufrufe: { ids: string[]; category_id: string | null }[] = []
  return {
    aufrufe,
    fn: async (_url, init) => {
      const b = JSON.parse(init.body) as { ids: string[]; category_id: string | null }
      aufrufe.push(b)
      return antwort(true, { updated: b.ids.length })
    },
  }
}

test('kategorie-speichern: ein Aufruf des Sammel-Endpunkts statt einem PATCH je Buchung', async () => {
  const f = ehrlich()
  assert.equal(await speichereKategorie(ids(5), 'kat-1', f.fn), 5)
  assert.equal(f.aufrufe.length, 1)
  assert.deepEqual(f.aufrufe[0], { ids: ids(5), category_id: 'kat-1' })
})

test('kategorie-speichern: doppelte IDs werden einmal geschickt, mehr als 200 in Teilen', async () => {
  const f = ehrlich()
  assert.equal(await speichereKategorie([...ids(3), ...ids(3)], null, f.fn), 3)
  assert.deepEqual(f.aufrufe[0].ids, ids(3))
  const g = ehrlich()
  assert.equal(await speichereKategorie(ids(BULK_MAX * 2 + 1), 'k', g.fn), BULK_MAX * 2 + 1)
  assert.deepEqual(g.aufrufe.map(a => a.ids.length), [BULK_MAX, BULK_MAX, 1])
})

test('kategorie-speichern: eine fehlgeschlagene Antwort wirft (frueher galt sie als Erfolg)', async () => {
  await assert.rejects(
    speichereKategorie(ids(2), 'k', async () => antwort(false, { error: 'Kategorie nicht gefunden' }, 404)),
    /Kategorie konnte nicht gespeichert werden: Kategorie nicht gefunden/,
  )
  await assert.rejects(speichereKategorie(ids(2), 'k', async () => antwort(false, null, 502)), /Fehler 502/)
})

test('kategorie-speichern: Netzfehler und nicht erreichbare Antwort werfen', async () => {
  await assert.rejects(speichereKategorie(ids(1), 'k', async () => { throw new Error('Failed to fetch') }), /Failed to fetch/)
})

test('kategorie-speichern: weniger gespeichert als verlangt ist ein Fehler', async () => {
  await assert.rejects(
    speichereKategorie(ids(4), 'k', async () => antwort(true, { updated: 3 })),
    /nur 3 von 4 Buchungen gefunden/,
  )
  await assert.rejects(speichereKategorie(ids(1), 'k', async () => antwort(true, {})), /nur 0 von 1/)
})

test('kategorie-speichern: scheitert ein spaeterer Teil, nennt die Meldung den schon gespeicherten Teil', async () => {
  let n = 0
  await assert.rejects(
    speichereKategorie(ids(BULK_MAX + 5), 'k', async (_u, init) => {
      n++
      const b = JSON.parse(init.body) as { ids: string[] }
      return n === 1 ? antwort(true, { updated: b.ids.length }) : antwort(false, { error: 'kaputt' })
    }),
    /kaputt \(200 von 205 waren schon gespeichert\)/,
  )
})

test('kategorie-speichern: ohne IDs kein Aufruf', async () => {
  const f = ehrlich()
  assert.equal(await speichereKategorie([], 'k', f.fn), 0)
  assert.equal(f.aufrufe.length, 0)
})
