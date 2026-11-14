#!/usr/bin/env node
/**
 * Test-Account fuer die Entwicklung (siehe docs/test-account.md).
 *
 *   node scripts/test-account.mjs create   Nutzer anlegen (falls es ihn nicht gibt), Passwort in .claude/test-account.local
 *   node scripts/test-account.mjs rotate   neues Passwort setzen
 *   node scripts/test-account.mjs seed     synthetische Daten neu anlegen (setzt vorher zurueck)
 *   node scripts/test-account.mjs reset    alle Daten des Test-Nutzers loeschen (Nutzer bleibt)
 *   node scripts/test-account.mjs status   Zustand anzeigen (ohne Passwort)
 *   node scripts/test-account.mjs delete   Daten UND Nutzer loeschen
 *
 * Sicherheit: arbeitet NUR mit dem Nutzer TEST_EMAIL (Domain .local, nicht zustellbar). Vor jedem Schreiben wird geprueft, dass der
 * Nutzer in keinem Haushalt ist, nicht der Bank-Sync-Nutzer ist und diese E-Mail traegt. Das Passwort steht nur in der lokalen,
 * nicht versionierten Datei und wird nie ausgegeben. Kein Bankzugang, keine Kraken-Schluessel, nur synthetische Zahlen.
 */
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

export const TEST_EMAIL = 'test-claude@athena-finance.local'
export const TEST_NAME = 'TEST Claude (synthetisch, kein echter Nutzer)'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const ZUGANG_DATEI = resolve(ROOT, '.claude/test-account.local')

function umgebung() {
  const env = resolve(ROOT, '.env.local')
  if (existsSync(env)) process.loadEnvFile(env)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in .env.local')
  return { url, key }
}

function admin() {
  const { url, key } = umgebung()
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** Gespeicherter Zugang (E-Mail, Passwort, Nutzer-ID) oder null. */
export function leseZugang() {
  if (!existsSync(ZUGANG_DATEI)) return null
  return JSON.parse(readFileSync(ZUGANG_DATEI, 'utf8'))
}

function schreibeZugang(z) {
  mkdirSync(dirname(ZUGANG_DATEI), { recursive: true })
  writeFileSync(ZUGANG_DATEI, JSON.stringify(z, null, 2) + '\n', { mode: 0o600 })
}

async function findeNutzer(sb) {
  for (let seite = 1; seite <= 20; seite++) {
    const { data, error } = await sb.auth.admin.listUsers({ page: seite, perPage: 200 })
    if (error) throw error
    const treffer = data.users.find(u => u.email?.toLowerCase() === TEST_EMAIL)
    if (treffer) return treffer
    if (data.users.length < 200) return null
  }
  return null
}

/** Verweigert jede Aktion, wenn der Nutzer nicht eindeutig der isolierte Test-Nutzer ist. */
async function pruefeIsolation(sb, nutzer) {
  if (!nutzer) throw new Error('Test-Nutzer existiert nicht (zuerst: create)')
  if (nutzer.email?.toLowerCase() !== TEST_EMAIL) throw new Error('Nutzer traegt nicht die Test-E-Mail, Abbruch')
  if (!TEST_EMAIL.endsWith('.local')) throw new Error('Test-E-Mail muss auf .local enden')
  if (process.env.BANK_SYNC_USER_ID && nutzer.id === process.env.BANK_SYNC_USER_ID) throw new Error('Test-Nutzer ist der Bank-Sync-Nutzer, Abbruch')
  const { data: mitglied, error } = await sb.from('household_members').select('household_id').eq('user_id', nutzer.id)
  if (error) throw error
  if ((mitglied ?? []).length > 0) throw new Error('Test-Nutzer ist Mitglied eines Haushalts, Abbruch (muss isoliert bleiben)')
}

async function anlegen() {
  const sb = admin()
  let nutzer = await findeNutzer(sb)
  if (nutzer) {
    console.log('Test-Nutzer existiert bereits:', nutzer.id)
    if (!leseZugang()) console.log('Hinweis: Zugangsdatei fehlt. Passwort neu setzen mit: node scripts/test-account.mjs rotate')
  } else {
    const passwort = randomBytes(18).toString('base64url')
    const { data, error } = await sb.auth.admin.createUser({
      email: TEST_EMAIL, password: passwort, email_confirm: true,
      user_metadata: { test_account: true, display_name: TEST_NAME },
    })
    if (error) throw error
    nutzer = data.user
    schreibeZugang({ email: TEST_EMAIL, password: passwort, userId: nutzer.id, angelegt: new Date().toISOString() })
    console.log('Test-Nutzer angelegt:', nutzer.id, '(Passwort in .claude/test-account.local)')
  }
  await pruefeIsolation(sb, nutzer)
  const { error: pe } = await sb.from('user_profiles').upsert({ id: nutzer.id, display_name: TEST_NAME, currency: 'EUR' })
  if (pe) throw pe
}

async function neuesPasswort() {
  const sb = admin()
  const nutzer = await findeNutzer(sb)
  await pruefeIsolation(sb, nutzer)
  const passwort = randomBytes(18).toString('base64url')
  const { error } = await sb.auth.admin.updateUserById(nutzer.id, { password: passwort })
  if (error) throw error
  schreibeZugang({ email: TEST_EMAIL, password: passwort, userId: nutzer.id, angelegt: new Date().toISOString() })
  console.log('Passwort neu gesetzt (in .claude/test-account.local)')
}

// Reihenfolge: abhaengige Tabellen zuerst.
const DATEN_TABELLEN = ['transactions', 'contracts', 'savings_goals', 'net_worth_snapshots', 'insights', 'accounts', 'categories']

async function zuruecksetzen(sb, nutzer) {
  await pruefeIsolation(sb, nutzer)
  for (const t of DATEN_TABELLEN) {
    const { error } = await sb.from(t).delete().eq('user_id', nutzer.id)
    if (error) throw new Error(`${t}: ${error.message}`)
  }
  // Trigger protokollieren jedes Einfuegen und Loeschen in audit_log (auch das obige Loeschen): zuletzt abraeumen.
  const { error } = await sb.from('audit_log').delete().eq('user_id', nutzer.id)
  if (error) throw new Error(`audit_log: ${error.message}`)
}

function tag(vorTagen) {
  const d = new Date()
  d.setDate(d.getDate() - vorTagen)
  return d.toISOString().slice(0, 10)
}

async function befuellen() {
  const sb = admin()
  const nutzer = await findeNutzer(sb)
  await zuruecksetzen(sb, nutzer)
  const uid = nutzer.id

  const ins = async (tabelle, zeilen) => {
    const { data, error } = await sb.from(tabelle).insert(zeilen).select()
    if (error) throw new Error(`${tabelle}: ${error.message}`)
    return data
  }

  const kat = Object.fromEntries((await ins('categories', [
    { user_id: uid, name: 'Gehalt', type: 'income', color: '#16a34a', icon: '💼', sort_order: 1 },
    { user_id: uid, name: 'Nebeneinkommen', type: 'income', color: '#65a30d', icon: '🧾', sort_order: 2 },
    { user_id: uid, name: 'Wohnen', type: 'expense', color: '#2563eb', icon: '🏠', sort_order: 3 },
    { user_id: uid, name: 'Lebensmittel', type: 'expense', color: '#ea580c', icon: '🛒', sort_order: 4 },
    { user_id: uid, name: 'Mobilität', type: 'expense', color: '#7c3aed', icon: '🚆', sort_order: 5 },
    { user_id: uid, name: 'Freizeit', type: 'expense', color: '#db2777', icon: '🎬', sort_order: 6 },
    { user_id: uid, name: 'Abos', type: 'expense', color: '#0891b2', icon: '📺', sort_order: 7 },
  ])).map(k => [k.name, k.id]))

  const konto = Object.fromEntries((await ins('accounts', [
    { user_id: uid, name: 'Test-Girokonto', type: 'checking', currency: 'EUR', institution: 'Testbank (synthetisch)', color: '#2563eb', sort_order: 1 },
    { user_id: uid, name: 'Test-Tagesgeld', type: 'savings', currency: 'EUR', institution: 'Testbank (synthetisch)', color: '#16a34a', sort_order: 2 },
    { user_id: uid, name: 'Test-Bargeld', type: 'cash', currency: 'EUR', color: '#a16207', sort_order: 3 },
  ])).map(a => [a.name, a.id]))
  const giro = konto['Test-Girokonto']

  // Fester Zufall: gleiche Beträge bei jedem Lauf (nur das Datum wandert mit dem Heute).
  let z = 42
  const zufall = () => (z = (z * 1664525 + 1013904223) % 4294967296) / 4294967296
  const betrag = (min, max) => Math.round((min + zufall() * (max - min)) * 100) / 100

  const buchungen = []
  const b = (vorTagen, typ, kategorie, kontoId, summe, haendler, text) =>
    buchungen.push({
      user_id: uid, account_id: kontoId, category_id: kat[kategorie], type: typ, amount: summe, currency: 'EUR',
      date: tag(vorTagen), merchant: haendler, description: text,
    })
  for (let m = 0; m < 4; m++) {
    const basis = m * 30
    b(basis + 2, 'income', 'Gehalt', giro, 2850, 'Testfirma GmbH', 'Gehalt (synthetisch)')
    b(basis + 3, 'expense', 'Wohnen', giro, 920, 'Test-Vermieter', 'Miete (synthetisch)')
    b(basis + 5, 'expense', 'Abos', giro, 12.99, 'Teststream', 'Streaming (synthetisch)')
    b(basis + 8, 'expense', 'Lebensmittel', giro, betrag(35, 95), 'Testmarkt', 'Einkauf (synthetisch)')
    b(basis + 15, 'expense', 'Lebensmittel', giro, betrag(30, 90), 'Testmarkt', 'Einkauf (synthetisch)')
    b(basis + 19, 'expense', 'Mobilität', giro, betrag(20, 60), 'Testbahn', 'Fahrkarte (synthetisch)')
    if (m % 2 === 0) b(basis + 22, 'expense', 'Freizeit', konto['Test-Bargeld'], betrag(15, 70), 'Testkino', 'Freizeit (synthetisch)')
  }
  b(40, 'income', 'Nebeneinkommen', giro, 320, 'Test-Auftrag', 'Nebenjob (synthetisch)')
  b(95, 'income', 'Nebeneinkommen', giro, 180, 'Test-Auftrag', 'Nebenjob (synthetisch)')
  await ins('transactions', buchungen)

  await ins('savings_goals', [{ user_id: uid, description: 'Test-Urlaub (synthetisch)', target_amount: 1500, current_amount: 400, monthly_savings_rate: 100, status: 'offen' }])
  await ins('contracts', [{
    user_id: uid, name: 'Teststream', type: 'subscription', frequency: 'monthly', amount: 12.99, currency: 'EUR',
    billing_day: 5, start_date: tag(400), is_active: true, account_id: giro, category_id: kat['Abos'],
  }])
  console.log(`Testdaten angelegt: ${Object.keys(konto).length} Konten, ${buchungen.length} Buchungen, 7 Kategorien, 1 Sparziel, 1 Vertrag`)
}

async function status() {
  const sb = admin()
  const nutzer = await findeNutzer(sb)
  if (!nutzer) return console.log('Kein Test-Nutzer vorhanden.')
  const { data: mitglied } = await sb.from('household_members').select('household_id').eq('user_id', nutzer.id)
  const zahlen = {}
  for (const t of [...DATEN_TABELLEN].reverse()) {
    const { count } = await sb.from(t).select('id', { count: 'exact', head: true }).eq('user_id', nutzer.id)
    zahlen[t] = count
  }
  console.log(JSON.stringify({
    userId: nutzer.id, email: nutzer.email, haushaltsmitgliedschaften: (mitglied ?? []).length,
    zugangsdatei: existsSync(ZUGANG_DATEI), ...zahlen,
  }, null, 2))
}

async function loeschen() {
  const sb = admin()
  const nutzer = await findeNutzer(sb)
  await zuruecksetzen(sb, nutzer)
  await sb.from('user_profiles').delete().eq('id', nutzer.id)
  const { error } = await sb.auth.admin.deleteUser(nutzer.id)
  if (error) throw error
  console.log('Test-Nutzer und Daten geloescht (Zugangsdatei bleibt lokal liegen, bei Bedarf entfernen).')
}

const BEFEHLE = {
  create: anlegen,
  rotate: neuesPasswort,
  seed: befuellen,
  status,
  reset: async () => {
    const sb = admin()
    await zuruecksetzen(sb, await findeNutzer(sb))
    console.log('Daten zurueckgesetzt')
  },
  delete: loeschen,
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const befehl = BEFEHLE[process.argv[2]]
  if (!befehl) {
    console.error('Befehle: ' + Object.keys(BEFEHLE).join(', '))
    process.exit(1)
  }
  befehl().catch(e => {
    console.error('Fehler:', e?.message ?? e)
    process.exit(1)
  })
}
