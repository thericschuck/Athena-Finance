#!/usr/bin/env node
/**
 * Harmlose Live-Proben zum Sicherheits-Audit (SECURITY-AUDIT.md).
 *
 * Aufruf:  node scripts/security-probe.mjs [https://athena-finance.de]
 *
 * Grundsatz: Jede Anfrage hier ist so gewählt, dass sie auch im schlechtesten Fall nichts
 * auslöst. Es wird nie ein Secret mitgeschickt, nie eine Edge Function aufgerufen und nie ein
 * Endpunkt, der bei fehlender Absicherung arbeiten würde.
 *
 *   BEWUSST NICHT GEPROBT:
 *   - /api/bank-sync (Python): Bei fehlendem CRON_SECRET würde `Bearer ` einen echten Bank-Sync
 *     starten. Stattdessen wird die Node-Cron-Route gefragt: sie unterscheidet "Secret fehlt"
 *     (500) von "Secret falsch" (401) und läuft in beiden Fällen nicht. Beide lesen dieselbe
 *     Variable.
 *   - Edge Functions (execute-savings-plans, fetch-fund-price, daily-snapshot): Sie prüfen nichts
 *     selbst. Jede Anfrage, die die Plattform durchlässt, führt sie aus (auch OPTIONS). Ob
 *     `verify_jwt` an ist, steht im Supabase-Dashboard unter Edge Functions.
 *   - Registrierung: kein Test-Signup. Gelesen wird nur der öffentliche Auth-Settings-Endpunkt.
 *
 * Gelesen werden aus .env.local nur NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY
 * (beide stehen ohnehin im Browser-Bundle). Ausgegeben wird keiner der Werte.
 */
import { readFileSync } from 'node:fs'

const site = (process.argv[2] ?? 'https://athena-finance.de').replace(/\/+$/, '')

function env(name) {
  if (process.env[name]) return process.env[name]
  try {
    const zeile = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
      .split(/\r?\n/).find(z => z.startsWith(`${name}=`))
    return zeile ? zeile.slice(name.length + 1).trim().replace(/^["']|["']$/g, '') : undefined
  } catch { return undefined }
}

const ergebnisse = []
const melde = (punkt, status, text) => { ergebnisse.push({ punkt, status, text }); console.log(`[${status}] ${punkt}: ${text}`) }

async function hole(url, init = {}) {
  const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000), ...init })
  return res
}

// ── 1. Security-Header der öffentlichen Seite und der Login-Seite ────────────
const HEADER = [
  'content-security-policy', 'strict-transport-security', 'x-frame-options',
  'x-content-type-options', 'referrer-policy', 'permissions-policy', 'cross-origin-opener-policy',
]
for (const pfad of ['/', '/login']) {
  try {
    const res = await hole(site + pfad)
    const da = HEADER.filter(h => res.headers.get(h))
    const fehlt = HEADER.filter(h => !res.headers.get(h))
    melde(`Header ${pfad}`, fehlt.length ? 'OFFEN' : 'OK',
      `HTTP ${res.status}; vorhanden: ${da.map(h => `${h}=${res.headers.get(h)}`).join(' | ') || 'keine'}; fehlt: ${fehlt.join(', ') || 'nichts'}`)
    const powered = res.headers.get('x-powered-by')
    if (powered) melde(`Header ${pfad}`, 'HINWEIS', `x-powered-by: ${powered}`)
  } catch (e) { melde(`Header ${pfad}`, 'FEHLER', String(e.message ?? e)) }
}

// ── 2. CRON_SECRET gesetzt? (S2) ─────────────────────────────────────────────
// requireCron (src/lib/api/auth.ts): 500 = Secret fehlt, 401 = Secret gesetzt, Anfrage abgewiesen.
try {
  const res = await hole(site + '/api/cron/reminders')
  const text = (await res.text()).slice(0, 120)
  if (res.status === 401) melde('CRON_SECRET', 'OK', 'Node-Cron-Route antwortet 401: Secret ist in dieser Umgebung gesetzt, api/bank-sync.py ist damit nicht offen.')
  else if (res.status === 500 && /nicht konfiguriert/.test(text)) melde('CRON_SECRET', 'KRITISCH', 'Secret fehlt: api/bank-sync.py akzeptiert dann den Header "Bearer " (S2).')
  else melde('CRON_SECRET', 'UNKLAR', `HTTP ${res.status}: ${text}`)
} catch (e) { melde('CRON_SECRET', 'FEHLER', String(e.message ?? e)) }

// ── 3. API-Routen ohne Sitzung ───────────────────────────────────────────────
// /api/bank/debug nimmt nur POST an (SECURITY-AUDIT.md 3.1), die anderen sind GET-Routen.
for (const [pfad, methode] of [['/api/bank/debug', 'POST'], ['/api/bank/transactions', 'GET'], ['/api/export/transactions', 'GET'], ['/api/kraken/status', 'GET'], ['/api/finance/flows', 'GET']]) {
  try {
    const res = await hole(site + pfad, { method: methode })
    melde(`Ohne Login ${pfad}`, res.status === 401 ? 'OK' : 'PRUEFEN', `HTTP ${res.status}`)
  } catch (e) { melde(`Ohne Login ${pfad}`, 'FEHLER', String(e.message ?? e)) }
}

// ── 4. Supabase: Registrierung offen? (S3) ───────────────────────────────────
const sbUrl = env('NEXT_PUBLIC_SUPABASE_URL')
const anon = env('NEXT_PUBLIC_SUPABASE_ANON_KEY')
if (!sbUrl || !anon) {
  melde('Supabase', 'UEBERSPRUNGEN', 'NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY nicht gefunden.')
} else {
  try {
    const res = await hole(`${sbUrl}/auth/v1/settings`, { headers: { apikey: anon } })
    const j = await res.json()
    melde('Registrierung', j.disable_signup === true ? 'OK' : 'KRITISCH',
      `disable_signup=${j.disable_signup}; E-Mail-Login=${j.external?.email}; mailer_autoconfirm=${j.mailer_autoconfirm}; anonyme Nutzer=${j.external?.anonymous_users}`)
    const andere = Object.entries(j.external ?? {}).filter(([k, v]) => v === true && k !== 'email').map(([k]) => k)
    if (andere.length) melde('Registrierung', 'HINWEIS', `weitere aktive Anmeldewege: ${andere.join(', ')}`)
  } catch (e) { melde('Registrierung', 'FEHLER', String(e.message ?? e)) }

  // ── 5. Was sieht die Rolle anon über PostgREST? (nur lesend, je höchstens 1 Zeile) ──
  // Erwartung: leere Liste (RLS) oder 401/403 (kein Tabellenrecht). Eine Zeile wäre ein Leck.
  const tabellen = ['bank_connections', 'exchange_keys', 'fints_client_state', 'accounts', 'bank_transactions',
    'household_invites', 'user_settings', 'waitlist_signups', 'ai_messages', 'kraken_trades', 'fund_prices']
  for (const t of tabellen) {
    try {
      const res = await hole(`${sbUrl}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: anon, Authorization: `Bearer ${anon}` } })
      const body = await res.json().catch(() => null)
      const zeilen = Array.isArray(body) ? body.length : null
      const oeffentlichGewollt = t === 'fund_prices'
      const status = zeilen === 0 || res.status === 401 || res.status === 403 || res.status === 404 ? 'OK'
        : zeilen && oeffentlichGewollt ? 'HINWEIS' : zeilen ? 'KRITISCH' : 'PRUEFEN'
      melde(`anon liest ${t}`, status, `HTTP ${res.status}, Zeilen: ${zeilen ?? '-'}${zeilen && oeffentlichGewollt ? ' (Stammdaten, lesbar gewollt)' : ''}`)
    } catch (e) { melde(`anon liest ${t}`, 'FEHLER', String(e.message ?? e)) }
  }

  // ── 6. Öffentlicher Bucket: lässt sich der Inhalt auflisten? ──
  try {
    const res = await hole(`${sbUrl}/storage/v1/object/list/avatars`, {
      method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: '', limit: 1 }),
    })
    const body = await res.json().catch(() => null)
    melde('Bucket avatars auflisten', Array.isArray(body) && body.length ? 'PRUEFEN' : 'OK', `HTTP ${res.status}, Einträge: ${Array.isArray(body) ? body.length : '-'}`)
  } catch (e) { melde('Bucket avatars auflisten', 'FEHLER', String(e.message ?? e)) }
}

const schlecht = ergebnisse.filter(e => e.status === 'KRITISCH').length
console.log(`\n${ergebnisse.length} Proben, ${schlecht} kritisch, ${ergebnisse.filter(e => e.status === 'OFFEN' || e.status === 'PRUEFEN').length} offen/zu prüfen.`)
process.exit(schlecht ? 1 : 0)
