import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cronAuthAntwort, pruefeCronAuth } from '../../../supabase/functions/daily-snapshot/cron-auth.ts'
import { BACKFILL_MAX_TAGE, pruefeBackfillDatum } from '../../../supabase/functions/daily-snapshot/datum.ts'

const FUNKTIONEN = ['daily-snapshot', 'execute-savings-plans', 'fetch-fund-price'] as const

function lies(pfad: string): string {
  return readFileSync(new URL(`../../../${pfad}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
}

// ── Auth-Kern ────────────────────────────────────────────────────────────────

test('korrekter Header -> ok', () => {
  assert.equal(pruefeCronAuth('Bearer geheim', 'geheim'), 'ok')
})

test('fehlendes oder leeres Secret -> unconfigured (fail-closed), auch mit passendem Header', () => {
  assert.equal(pruefeCronAuth('Bearer ', ''), 'unconfigured')
  assert.equal(pruefeCronAuth('Bearer ', null), 'unconfigured')
  assert.equal(pruefeCronAuth('Bearer undefined', undefined), 'unconfigured')
  assert.equal(pruefeCronAuth(null, undefined), 'unconfigured')
})

test('falscher, fehlender oder abweichend geschriebener Header -> unauthorized', () => {
  for (const h of ['Bearer falsch', '', null, undefined, 'geheim', 'bearer geheim', 'Bearer geheim ', ' Bearer geheim', 'Bearer geheiém']) {
    assert.equal(pruefeCronAuth(h, 'geheim'), 'unauthorized', JSON.stringify(h))
  }
})

test('der öffentliche anon-Key (irgendein JWT) ist kein Zugang mehr', () => {
  const anon = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.signatur'
  assert.equal(pruefeCronAuth(anon, 'ein-langes-zufaelliges-secret'), 'unauthorized')
})

// ── Antwort ──────────────────────────────────────────────────────────────────

test('cronAuthAntwort: berechtigt -> null', () => {
  const req = new Request('https://x.test/f', { headers: { Authorization: 'Bearer geheim' } })
  assert.equal(cronAuthAntwort(req, 'geheim'), null)
})

test('cronAuthAntwort: falsch oder fehlend -> 401 ohne Hinweis auf das Secret', async () => {
  for (const headers of [{ Authorization: 'Bearer falsch' }, {}] as Record<string, string>[]) {
    const res = cronAuthAntwort(new Request('https://x.test/f', { headers }), 'geheim')
    assert.equal(res?.status, 401)
    const text = await res!.text()
    assert.deepEqual(JSON.parse(text), { error: 'Unauthorized' })
    assert.equal(text.includes('geheim'), false)
  }
})

test('cronAuthAntwort: Secret auf dem Server nicht gesetzt -> 500, nie durchlassen', async () => {
  for (const secret of [undefined, null, '']) {
    const res = cronAuthAntwort(new Request('https://x.test/f', { headers: { Authorization: 'Bearer ' } }), secret)
    assert.equal(res?.status, 500)
    assert.deepEqual(await res!.json(), { error: 'CRON_SECRET nicht konfiguriert' })
  }
})

// ── Struktur: die drei Functions halten sich daran ──────────────────────────

test('cron-auth.ts ist in allen drei Functions identisch (keine geteilte Datei, darum geprüft)', () => {
  const kopien = FUNKTIONEN.map(f => lies(`supabase/functions/${f}/cron-auth.ts`))
  assert.equal(kopien[1], kopien[0], 'execute-savings-plans weicht von daily-snapshot ab')
  assert.equal(kopien[2], kopien[0], 'fetch-fund-price weicht von daily-snapshot ab')
})

test('jeder Handler prüft zuerst das Secret, vor dem Datenbank-Client', () => {
  for (const f of FUNKTIONEN) {
    const quelle = lies(`supabase/functions/${f}/index.ts`)
    const auth = quelle.indexOf("cronAuthAntwort(req, Deno.env.get('CRON_SECRET'))")
    const client = quelle.indexOf('createClient(')
    assert.ok(auth > 0, `${f}: Secret-Prüfung fehlt`)
    assert.ok(client > 0, `${f}: createClient fehlt (Test veraltet?)`)
    assert.ok(auth < client, `${f}: Secret-Prüfung muss vor createClient( stehen`)
    assert.match(quelle, /Deno\.serve\(async \(req\)/, `${f}: Handler muss die Anfrage (req) bekommen`)
  }
})

test('daily-snapshot: keine JWT-Ausnahme mehr', () => {
  // Nur Code prüfen: der Kommentar im Handler erklärt die frühere Ausnahme und nennt sie dabei beim Namen.
  const code = lies('supabase/functions/daily-snapshot/index.ts')
    .split('\n')
    .filter(zeile => !zeile.trim().startsWith('//'))
    .join('\n')
  assert.equal(/isJwt|Bearer eyJ|startsWith\('Bearer/.test(code), false)
})

test('config.toml: verify_jwt = false für genau diese drei Functions (sonst weist die Plattform das Secret ab)', () => {
  const toml = lies('supabase/config.toml')
  for (const f of FUNKTIONEN) {
    const abschnitt = new RegExp(`\\[functions\\.${f}\\]\\s*\\nverify_jwt\\s*=\\s*false`)
    assert.match(toml, abschnitt, `${f}: [functions.${f}] verify_jwt = false fehlt`)
  }
})

// ── ?date= von daily-snapshot ────────────────────────────────────────────────

const HEUTE = '2026-11-13'

test('date: heute und die sieben Tage davor sind erlaubt', () => {
  assert.equal(BACKFILL_MAX_TAGE, 7)
  for (const d of ['2026-11-13', '2026-11-12', '2026-11-06']) {
    assert.deepEqual(pruefeBackfillDatum(d, HEUTE), { ok: true, datum: d })
  }
})

test('date: acht Tage zurück und älter -> abgelehnt', () => {
  for (const d of ['2026-11-05', '2026-01-15', '2020-01-01', '1999-12-31']) {
    const r = pruefeBackfillDatum(d, HEUTE)
    assert.equal(r.ok, false, d)
    if (!r.ok) assert.match(r.fehler, /höchstens 7 Tage/)
  }
})

test('date: Zukunft -> abgelehnt', () => {
  for (const d of ['2026-11-14', '2027-01-01']) {
    const r = pruefeBackfillDatum(d, HEUTE)
    assert.equal(r.ok, false, d)
    if (!r.ok) assert.match(r.fehler, /Zukunft/)
  }
})

test('date: Format- und Kalenderfehler -> abgelehnt', () => {
  for (const d of ['', ' ', '2026-11-13 ', ' 2026-11-13', '2026/11/13', '13.11.2026', '2026-1-3', '20261113', 'heute', '2026-11-13T00:00:00Z', '2026-13-01', '2026-00-10', '2026-02-31', '2026-11-31', '2027-02-29']) {
    assert.equal(pruefeBackfillDatum(d, HEUTE).ok, false, JSON.stringify(d))
  }
})

test('date: die Sieben-Tage-Grenze stimmt über Monats- und Schaltjahrgrenzen', () => {
  assert.equal(pruefeBackfillDatum('2026-02-24', '2026-03-03').ok, true)
  assert.equal(pruefeBackfillDatum('2026-02-23', '2026-03-03').ok, false)
  assert.equal(pruefeBackfillDatum('2028-02-24', '2028-03-02').ok, true) // 2028 hat einen 29. Februar
  assert.equal(pruefeBackfillDatum('2028-02-23', '2028-03-02').ok, false)
  assert.equal(pruefeBackfillDatum('2028-02-29', '2028-03-02').ok, true)
  assert.equal(pruefeBackfillDatum('2025-12-25', '2026-01-01').ok, true) // Jahreswechsel, 7 Tage
  assert.equal(pruefeBackfillDatum('2025-12-24', '2026-01-01').ok, false)
})
