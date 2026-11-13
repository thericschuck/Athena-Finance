import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bestaetigeVorschlag, BEREITS_IN_ARBEIT } from './bestaetigung.ts'

// Statuslogik der Bestaetigung (AUDIT.md A2), ohne Datenbank und ohne Kraken. Die Fake-Datenbank bildet das Wesentliche nach:
// ein bedingtes UPDATE ist ATOMAR (Filter und Aenderung in einem Schritt), jede Abfrage gibt den Event-Loop vorher frei
// (setImmediate), sodass sich zwei gleichzeitige Aufrufe wie in Postgres verschraenken: beide lesen `pending`, erst danach
// beanspruchen sie.

type Zeile = {
  id: string; user_id: string; action: string; input: unknown; summary: string
  status: string; conversation_id: string | null; result?: unknown; error?: string | null; resolved_at?: string | null
}
type Fehler = { message: string } | null
type Steuerung = {
  /** Gibt einen Fehler zurueck, wenn dieses UPDATE scheitern soll (Netz, RLS, Constraint). */
  updateFehler?: (patch: Record<string, unknown>) => Fehler
  log: { op: string; patch?: Record<string, unknown>; trafen: number }[]
}

const tick = () => new Promise<void>(r => setImmediate(r))

function fakeDb(zeilen: Zeile[], steuerung: Steuerung) {
  class Abfrage {
    private op: 'select' | 'update' = 'select'
    private patch: Record<string, unknown> = {}
    private filter: [string, unknown][] = []
    private mitRueckgabe = false
    select() { if (this.op === 'update') this.mitRueckgabe = true; return this }
    update(patch: Record<string, unknown>) { this.op = 'update'; this.patch = patch; return this }
    eq(spalte: string, wert: unknown) { this.filter.push([spalte, wert]); return this }
    private async ausfuehren() {
      await tick()
      const fehler = this.op === 'update' ? steuerung.updateFehler?.(this.patch) ?? null : null
      if (fehler) { steuerung.log.push({ op: 'update', patch: this.patch, trafen: 0 }); return { data: null, error: fehler } }
      const treffer = zeilen.filter(z => this.filter.every(([k, v]) => (z as Record<string, unknown>)[k] === v))
      if (this.op === 'update') {
        for (const z of treffer) Object.assign(z, this.patch) // atomar: kein await zwischen Filter und Aenderung
        steuerung.log.push({ op: 'update', patch: this.patch, trafen: treffer.length })
        return { data: this.mitRueckgabe ? treffer.map(z => ({ id: z.id })) : null, error: null }
      }
      return { data: treffer.map(z => ({ ...z })), error: null }
    }
    async maybeSingle() {
      const r = await this.ausfuehren()
      return { data: r.data?.[0] ?? null, error: r.error }
    }
    then<T>(ok: (v: { data: unknown[] | null; error: Fehler }) => T, fehl?: (e: unknown) => T) {
      return this.ausfuehren().then(ok, fehl)
    }
  }
  return { from: () => new Abfrage() } as unknown as Parameters<typeof bestaetigeVorschlag>[0]['supabase']
}

const NUTZER = 'user-1'
const neueZeile = (extra: Partial<Zeile> = {}): Zeile => ({
  id: 'a1', user_id: NUTZER, action: 'executeRebalancing', input: {}, summary: 'Rebalancing ausführen: 2 Trades',
  status: 'pending', conversation_id: 'c1', ...extra,
})

function aufbau(zeile: Zeile | Zeile[], opts: { fuehreAus?: (a: string, i: unknown) => Promise<Record<string, unknown>>; updateFehler?: Steuerung['updateFehler']; bekannt?: (n: string) => boolean } = {}) {
  const zeilen = Array.isArray(zeile) ? zeile : [zeile]
  const steuerung: Steuerung = { updateFehler: opts.updateFehler, log: [] }
  const ausgefuehrt: { action: string; statusWaehrend: string | undefined }[] = []
  const protokoll: { level?: string; event: string; message: string }[] = []
  const deps = {
    supabase: fakeDb(zeilen, steuerung),
    userId: NUTZER,
    actionId: 'a1',
    istSchreibaktion: opts.bekannt ?? ((n: string) => n === 'executeRebalancing' || n === 'categorizeTransactions'),
    fuehreAus: async (action: string, input: unknown) => {
      ausgefuehrt.push({ action, statusWaehrend: zeilen.find(z => z.id === 'a1')?.status })
      if (opts.fuehreAus) return opts.fuehreAus(action, input)
      await tick(); await tick() // Ausfuehrung dauert: hier ueberlappen sich gleichzeitige Aufrufe
      return { legGroup: 'g1' }
    },
    protokoll: async (e: { level?: 'error'; event: 'action.executed' | 'action.failed'; message: string }) => { protokoll.push(e) },
  }
  return { zeilen, steuerung, ausgefuehrt, protokoll, deps: { ...deps, conversationId: undefined } as unknown as Parameters<typeof bestaetigeVorschlag>[0] }
}

test('Erfolg: genau eine Ausfuehrung, Status pending -> executing -> executed, Ergebnis gespeichert', async () => {
  const t = aufbau(neueZeile())
  const r = await bestaetigeVorschlag(t.deps)
  assert.deepEqual(r, { success: true, result: { legGroup: 'g1' } })
  assert.equal(t.ausgefuehrt.length, 1)
  assert.equal(t.ausgefuehrt[0].statusWaehrend, 'executing', 'waehrend der Ausfuehrung steht die Zeile auf executing, nicht pending')
  assert.equal(t.zeilen[0].status, 'executed')
  assert.deepEqual(t.zeilen[0].result, { legGroup: 'g1' })
  assert.ok(t.zeilen[0].resolved_at)
  assert.equal(t.protokoll.length, 1)
  assert.equal(t.protokoll[0].event, 'action.executed')
  assert.equal(t.protokoll[0].level, undefined)
})

test('zwei gleichzeitige Bestaetigungen: die Aktion laeuft genau EINMAL', async () => {
  const t = aufbau(neueZeile())
  const [a, b] = await Promise.all([bestaetigeVorschlag(t.deps), bestaetigeVorschlag(t.deps)])
  assert.equal(t.ausgefuehrt.length, 1, 'eine doppelte Kraken-Order waere hier eine doppelte Ausfuehrung')
  const erfolge = [a, b].filter(r => 'success' in r)
  const fehler = [a, b].filter((r): r is { error: string } => 'error' in r)
  assert.equal(erfolge.length, 1)
  assert.equal(fehler.length, 1)
  assert.match(fehler[0].error, new RegExp(`${BEREITS_IN_ARBEIT}|bereits (executing|executed)`))
  assert.equal(t.zeilen[0].status, 'executed')
})

test('zehn gleichzeitige Bestaetigungen: weiterhin genau eine Ausfuehrung', async () => {
  const t = aufbau(neueZeile())
  const alle = await Promise.all(Array.from({ length: 10 }, () => bestaetigeVorschlag(t.deps)))
  assert.equal(t.ausgefuehrt.length, 1)
  assert.equal(alle.filter(r => 'success' in r).length, 1)
  assert.equal(alle.filter(r => 'error' in r).length, 9)
})

test('Beanspruchen scheitert (Datenbankfehler): NICHT ausfuehren', async () => {
  const t = aufbau(neueZeile(), { updateFehler: p => (p.status === 'executing' ? { message: 'boom' } : null) })
  const r = await bestaetigeVorschlag(t.deps)
  assert.deepEqual(r, { error: 'boom' })
  assert.equal(t.ausgefuehrt.length, 0)
  assert.equal(t.zeilen[0].status, 'pending', 'nichts geaendert, der Vorschlag bleibt bestaetigbar')
})

test('Ausfuehrung wirft: Status failed mit Fehlertext, kein zweiter Versuch moeglich', async () => {
  const t = aufbau(neueZeile(), { fuehreAus: async () => { throw new Error('Kein Kraken-Konto verbunden.') } })
  const r = await bestaetigeVorschlag(t.deps)
  assert.deepEqual(r, { error: 'Kein Kraken-Konto verbunden.' })
  assert.equal(t.zeilen[0].status, 'failed')
  assert.equal(t.zeilen[0].error, 'Kein Kraken-Konto verbunden.')
  assert.ok(t.zeilen[0].resolved_at)
  assert.equal(t.protokoll[0].event, 'action.failed')
  assert.equal(t.protokoll[0].level, 'error')
  const nochmal = await bestaetigeVorschlag(t.deps)
  assert.deepEqual(nochmal, { error: 'Vorschlag ist bereits failed' })
  assert.equal(t.ausgefuehrt.length, 1, 'eine fehlgeschlagene Aktion wird nicht automatisch wiederholt')
})

test('failed laesst sich nicht setzen: Fehler der Aktion kommt trotzdem zurueck, Vorfall steht im Log', async () => {
  const t = aufbau(neueZeile(), {
    fuehreAus: async () => { throw new Error('Order abgelehnt') },
    updateFehler: p => (p.status === 'failed' ? { message: 'rls' } : null),
  })
  const r = await bestaetigeVorschlag(t.deps)
  assert.deepEqual(r, { error: 'Order abgelehnt' })
  assert.equal(t.zeilen[0].status, 'executing', 'bleibt sichtbar auf executing, wird nie still als executed gezeigt')
  assert.match(t.protokoll[0].message, /Status konnte nicht auf failed gesetzt werden: rls/)
})

test('Aktion lief, aber executed laesst sich nicht schreiben: Erfolg melden, Zeile bleibt executing, Log mit level error', async () => {
  const t = aufbau(neueZeile(), { updateFehler: p => (p.status === 'executed' ? { message: 'timeout' } : null) })
  const r = await bestaetigeVorschlag(t.deps)
  assert.deepEqual(r, { success: true, result: { legGroup: 'g1' } }, 'die Aktion ist gelaufen: kein Fehler melden, sonst wird sie erneut angestossen')
  assert.equal(t.zeilen[0].status, 'executing')
  assert.equal(t.protokoll[0].level, 'error')
  assert.match(t.protokoll[0].message, /Aktion ausgeführt, Status konnte nicht auf executed gesetzt werden: timeout/)
})

test('Zeile steht schon auf executing/executed/failed/rejected: keine Ausfuehrung', async () => {
  for (const status of ['executing', 'executed', 'failed', 'rejected', 'expired']) {
    const t = aufbau(neueZeile({ status }))
    const r = await bestaetigeVorschlag(t.deps)
    assert.deepEqual(r, { error: `Vorschlag ist bereits ${status}` }, status)
    assert.equal(t.ausgefuehrt.length, 0, status)
    assert.equal(t.zeilen[0].status, status, `${status}: unveraendert`)
  }
})

test('unbekannte Aktion: abgelehnt, ohne den Status anzufassen', async () => {
  const t = aufbau(neueZeile({ action: 'gibtEsNicht' }))
  const r = await bestaetigeVorschlag(t.deps)
  assert.deepEqual(r, { error: 'Unbekannte Aktion gibtEsNicht' })
  assert.equal(t.zeilen[0].status, 'pending')
  assert.equal(t.steuerung.log.filter(l => l.op === 'update').length, 0)
})

test('Vorschlag eines anderen Nutzers oder unbekannte ID: nicht gefunden, nichts passiert', async () => {
  const t = aufbau(neueZeile({ user_id: 'jemand-anders' }))
  assert.deepEqual(await bestaetigeVorschlag(t.deps), { error: 'Vorschlag nicht gefunden' })
  assert.equal(t.ausgefuehrt.length, 0)
  assert.equal(t.zeilen[0].status, 'pending')
})

test('Beanspruchen und Abschluss filtern auf Nutzer UND erwarteten Status (kein Ueberschreiben fremder Zeilen/Stati)', async () => {
  const t = aufbau([neueZeile(), neueZeile({ id: 'a2', user_id: 'jemand-anders' })])
  await bestaetigeVorschlag(t.deps)
  assert.equal(t.zeilen[1].status, 'pending', 'fremde Zeile mit anderer ID/Nutzer bleibt unberuehrt')
  const updates = t.steuerung.log.filter(l => l.op === 'update')
  assert.deepEqual(updates.map(u => [u.patch?.status, u.trafen]), [['executing', 1], ['executed', 1]])
})
