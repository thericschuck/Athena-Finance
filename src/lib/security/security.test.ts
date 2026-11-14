import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { baueCsp, erzeugeNonce, formatiereBericht, CSP_REPORT_PFAD } from './csp.ts'
import { PERMISSIONS_POLICY, SICHERHEITS_HEADER } from './headers.ts'

const SB = 'https://abcdefgh.supabase.co'
const direktive = (csp: string) => Object.fromEntries(csp.split('; ').map(d => { const [n, ...w] = d.split(' '); return [n, w] }))

test('erzeugeNonce: Base64, 128 Bit, bei jedem Aufruf neu', () => {
  const a = erzeugeNonce(), b = erzeugeNonce()
  assert.match(a, /^[A-Za-z0-9+/]{22}==$/)
  assert.notEqual(a, b)
  assert.equal(new Set(Array.from({ length: 200 }, erzeugeNonce)).size, 200)
})

test('CSP: Skripte nur mit Nonce und eigener Herkunft, nie unsafe-inline/unsafe-eval in Produktion', () => {
  const d = direktive(baueCsp({ nonce: 'NONCE123', supabaseUrl: SB, dev: false }))
  assert.deepEqual(d['script-src'], ["'self'", "'nonce-NONCE123'", "'strict-dynamic'"])
  assert.ok(!baueCsp({ nonce: 'N', supabaseUrl: SB, dev: false }).includes('unsafe-eval'))
  assert.ok(!d['script-src'].includes("'unsafe-inline'"))
})

test('CSP: style-src-elem erlaubt inline ohne Nonce (sonner, srcdoc-Bericht), Skripte bleiben streng', () => {
  const d = direktive(baueCsp({ nonce: 'N', supabaseUrl: SB, dev: false }))
  assert.deepEqual(d['style-src-elem'], ["'self'", "'unsafe-inline'"])
  // Eine Nonce neben 'unsafe-inline' wuerde es unwirksam machen.
  assert.ok(!d['style-src-elem'].some(w => w.startsWith("'nonce-")))
  assert.ok(!d['script-src'].includes("'unsafe-inline'"))
})

test('CSP: Entwicklung erlaubt zusaetzlich unsafe-eval und Hot-Reload-WebSocket, Produktion nicht', () => {
  const dev = direktive(baueCsp({ nonce: 'N', supabaseUrl: SB, dev: true }))
  assert.ok(dev['script-src'].includes("'unsafe-eval'"))
  assert.ok(dev['connect-src'].includes('ws://localhost:*'))
  const prod = direktive(baueCsp({ nonce: 'N', supabaseUrl: SB, dev: false }))
  assert.ok(!prod['script-src'].includes("'unsafe-eval'"))
  assert.ok(!prod['connect-src'].includes('ws://localhost:*'))
})

test('CSP: connect-src, img-src und media-src enthalten die Supabase-Herkunft (ohne Pfad)', () => {
  const d = direktive(baueCsp({ nonce: 'N', supabaseUrl: SB + '/rest/v1/', dev: false }))
  for (const k of ['connect-src', 'img-src', 'media-src']) assert.ok(d[k].includes(SB), `${k} ohne Supabase`)
  assert.ok(d['img-src'].includes('data:') && d['img-src'].includes('blob:'))
})

test('CSP: ohne oder mit ungueltiger Supabase-URL werden keine fremden Quellen freigegeben', () => {
  for (const url of [undefined, '', 'kein-url', 'javascript:alert(1)']) {
    const csp = baueCsp({ nonce: 'N', supabaseUrl: url, dev: false })
    assert.ok(!/supabase|javascript/.test(csp), String(url))
    assert.deepEqual(direktive(csp)['connect-src'], ["'self'"])
  }
})

test('CSP: object-src none, base-uri/form-action self, frame-ancestors none', () => {
  const csp = baueCsp({ nonce: 'N', supabaseUrl: SB, dev: false })
  const d = direktive(csp)
  assert.deepEqual(d['object-src'], ["'none'"])
  assert.deepEqual(d['base-uri'], ["'self'"])
  assert.deepEqual(d['form-action'], ["'self'"])
  assert.deepEqual(d['frame-ancestors'], ["'none'"])
  assert.ok(!csp.includes('upgrade-insecure-requests'))
  assert.deepEqual(d['default-src'], ["'self'"])
})

test('Header: alle verlangten Sicherheits-Header sind gesetzt', () => {
  const h = Object.fromEntries(SICHERHEITS_HEADER.map(e => [e.key, e.value]))
  assert.equal(h['X-Frame-Options'], 'DENY')
  assert.equal(h['X-Content-Type-Options'], 'nosniff')
  assert.equal(h['Referrer-Policy'], 'strict-origin-when-cross-origin')
  assert.equal(h['Strict-Transport-Security'], 'max-age=63072000; includeSubDomains')
  assert.ok(h['Permissions-Policy'])
  assert.ok(!/preload/.test(h['Strict-Transport-Security']), 'kein preload ohne bewusste Entscheidung')
})

test('Permissions-Policy sperrt Kamera, Mikrofon, Standort, Zahlung; laesst die Zwischenablage in Ruhe', () => {
  for (const f of ['camera=()', 'microphone=()', 'geolocation=()', 'payment=()']) assert.ok(PERMISSIONS_POLICY.includes(f), f)
  assert.ok(!/clipboard/.test(PERMISSIONS_POLICY), 'Kopieren-Knoepfe nutzen navigator.clipboard')
})

test('Proxy: jede Antwort ohne Umleitung gibt die Anfrage-Header (Nonce) weiter, setzt die erzwingende CSP auf Anfrage und Antwort', () => {
  const q = readFileSync(new URL('../../proxy.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  assert.ok(!/NextResponse\.next\(\)/.test(q), 'NextResponse.next() ohne { request } reicht die Nonce nicht an die Seite durch')
  assert.ok(q.includes('CSP_HEADER') && q.includes('NONCE_HEADER') && q.includes('baueCsp('))
  assert.ok(!/Report-Only/.test(q.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'Report-Only darf nicht mehr gesetzt werden')
})

test('Layout: Inline-Script und ThemeProvider bekommen die Nonce aus dem Header', () => {
  const q = readFileSync(new URL('../../app/layout.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  assert.ok(q.includes("get(NONCE_HEADER)") || q.includes("get('x-nonce')"))
  assert.ok(/<script\s+nonce=\{nonce\}/.test(q), 'Inline-Theme-Script ohne nonce')
  assert.ok(/<ThemeProvider[^>]*nonce=\{nonce\}/.test(q), 'ThemeProvider ohne nonce')
})

test('CSP: font-src erlaubt data: (Balken-Schrift als Data-URI), report-uri zeigt auf die Meldestelle', () => {
  const d = direktive(baueCsp({ nonce: 'N', supabaseUrl: SB, dev: false }))
  assert.deepEqual(d['font-src'], ["'self'", 'data:'])
  assert.deepEqual(d['report-uri'], [CSP_REPORT_PFAD])
  assert.equal(CSP_REPORT_PFAD, '/api/csp-report')
})

test('formatiereBericht: macht aus einer Browser-Meldung eine Logzeile, ohne Query-Strings', () => {
  const roh = JSON.stringify({ 'csp-report': {
    'document-uri': 'https://athena-finance.de/finance/accounts?token=GEHEIM', 'effective-directive': 'style-src-elem',
    'blocked-uri': 'inline', 'source-file': 'https://athena-finance.de/_next/static/chunks/abc.js?v=1', 'line-number': 1,
    'script-sample': '.toaster{}', disposition: 'report',
  } })
  const z = formatiereBericht(roh)!
  assert.match(z, /^direktive=style-src-elem \| blockiert=inline \| seite=https:\/\/athena-finance\.de\/finance\/accounts \| quelle=https:\/\/athena-finance\.de\/_next\/static\/chunks\/abc\.js:1 \|/)
  assert.ok(!z.includes('GEHEIM') && !z.includes('v=1'))
})

test('formatiereBericht: Muell, fremde Form und fehlende Direktive ergeben null; Felder werden gekuerzt', () => {
  for (const roh of ['', 'kein json', '[]', '{}', '{"csp-report":5}', '{"csp-report":{}}', '{"anders":{"effective-directive":"x"}}']) {
    assert.equal(formatiereBericht(roh), null, roh)
  }
  const lang = 'a'.repeat(5000)
  const z = formatiereBericht(JSON.stringify({ 'csp-report': { 'effective-directive': lang, 'blocked-uri': lang, 'script-sample': lang } }))!
  assert.ok(z.length < 600, 'Zeile ' + z.length)
  assert.ok(!z.includes('\n'))
})

test('csp-report-Route: nur POST, antwortet immer 204, keine Datenbank, Textkoerper begrenzt', () => {
  const q = readFileSync(new URL('../../app/api/csp-report/route.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  assert.ok(/export async function POST/.test(q))
  assert.ok(!/export (async )?function (GET|PUT|PATCH|DELETE)/.test(q))
  assert.ok(!/supabase|createAdminClient|\.from\(/.test(q), 'oeffentliche Route darf nicht an die Datenbank')
  assert.ok(/MAX_BYTES/.test(q) && !/status: (4|5)\d\d/.test(q))
})
