#!/usr/bin/env node
/**
 * Automatisierter Browser-Durchlauf mit dem Test-Account (siehe docs/test-account.md).
 *
 *   node scripts/test-account-browser.mjs                 Login + Tour durch die Hauptseiten, Screenshots nach .claude/test-account-screens/
 *   node scripts/test-account-browser.mjs /analyse /depot nur diese Seiten besuchen
 *   BASE_URL=http://localhost:3000 node scripts/test-account-browser.mjs
 *
 * Nutzt das lokal installierte Chrome (playwright-core laedt keinen eigenen Browser). Das Passwort kommt aus
 * .claude/test-account.local (nicht versioniert) und wird nie ausgegeben. Die Sitzung wird in
 * .claude/test-account.state.json zwischengespeichert (ebenfalls nicht versioniert).
 *
 * Als Modul: `import { mitTestAccount } from './test-account-browser.mjs'`, dann
 * `await mitTestAccount(async ({ page }) => { ... })`.
 */
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { leseZugang } from './test-account.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const SITZUNG = resolve(ROOT, '.claude/test-account.state.json')
const BILDER = resolve(ROOT, '.claude/test-account-screens')

const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => p && existsSync(p))

export const STANDARD_SEITEN = [
  '/dashboard', '/analyse', '/finance/transactions', '/finance/accounts', '/finance/reports',
  '/depot', '/settings',
]

/** Meldet den Test-Nutzer an (oder nimmt die gespeicherte Sitzung) und gibt einen angemeldeten Kontext zurueck. */
export async function mitTestAccount(aktion, { sichtbar = false } = {}) {
  const zugang = leseZugang()
  if (!zugang) throw new Error('Keine Zugangsdatei. Zuerst: node scripts/test-account.mjs create')
  if (!CHROME) throw new Error('Kein Chrome/Edge gefunden (CHROME_PATH setzen)')
  const browser = await chromium.launch({ executablePath: CHROME, headless: !sichtbar })
  try {
    let context = await browser.newContext({
      viewport: { width: 1360, height: 900 },
      ...(existsSync(SITZUNG) ? { storageState: SITZUNG } : {}),
    })
    let page = await context.newPage()
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    if (!page.url().includes('/dashboard')) {
      await anmelden(page, zugang)
      await context.storageState({ path: SITZUNG })
    }
    return await aktion({ browser, context, page, base: BASE })
  } finally {
    await browser.close()
  }
}

async function anmelden(page, zugang) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 90_000 })
  await page.fill('input[type=email]', zugang.email)
  await page.fill('input[type=password]', zugang.password)
  await Promise.all([
    page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 90_000 }),
    page.click('button[type=submit]'),
  ])
  if (!page.url().includes('/dashboard')) await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 90_000 })
  if (!page.url().includes('/dashboard')) throw new Error(`Login fehlgeschlagen (gelandet auf ${new URL(page.url()).pathname})`)
}

async function tour(seiten) {
  mkdirSync(BILDER, { recursive: true })
  const csp = []
  return mitTestAccount(async ({ page }) => {
    page.on('request', r => { if (r.url().includes('/api/csp-report')) csp.push(r.url()) })
    const ergebnis = []
    for (const pfad of seiten) {
      const fehler = []
      const hoerer = e => fehler.push(e.message.slice(0, 120))
      page.on('pageerror', hoerer)
      const start = Date.now()
      let status = 'ok'
      try {
        const antwort = await page.goto(BASE + pfad, { waitUntil: 'networkidle', timeout: 90_000 })
        if (!antwort || antwort.status() >= 400) status = `HTTP ${antwort?.status()}`
        await page.waitForTimeout(800)
      } catch (e) {
        status = 'Fehler: ' + String(e.message).slice(0, 80)
      }
      page.off('pageerror', hoerer)
      const datei = resolve(BILDER, pfad.replace(/^\//, '').replace(/\//g, '_') + '.png')
      await page.screenshot({ path: datei, fullPage: false })
      ergebnis.push({ pfad, ziel: new URL(page.url()).pathname, status, ms: Date.now() - start, jsFehler: fehler.length })
    }
    return { ergebnis, cspMeldungen: csp.length }
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const seiten = process.argv.slice(2).length > 0 ? process.argv.slice(2) : STANDARD_SEITEN
  tour(seiten).then(({ ergebnis, cspMeldungen }) => {
    for (const e of ergebnis) console.log(`${e.pfad.padEnd(26)} -> ${e.ziel.padEnd(26)} ${e.status.padEnd(8)} ${String(e.ms).padStart(6)} ms  JS-Fehler: ${e.jsFehler}`)
    console.log(`CSP-Meldungen: ${cspMeldungen}`)
    console.log(`Screenshots: .claude/test-account-screens/`)
  }).catch(e => {
    console.error('Fehler:', e?.message ?? e)
    process.exit(1)
  })
}
