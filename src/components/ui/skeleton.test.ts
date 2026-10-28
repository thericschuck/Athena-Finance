import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

/**
 * Render-Tests der Ladezustaende (kein Browser): jeder Platzhalter rendert ohne Absturz, ohne NaN/undefined,
 * jede Seite meldet "Lädt…" genau einmal (role="status"), und das Shimmer-CSS ist gueltig.
 */
const hier = path.dirname(fileURLToPath(import.meta.url))
const src = path.resolve(hier, '../..')
const jiti = createJiti(import.meta.url, {
  alias: { '@': src },
  jsx: { runtime: 'automatic' },
  moduleCache: false,
  interopDefault: true,
})

const { renderToStaticMarkup } = (await jiti.import('react-dom/server')) as { renderToStaticMarkup: (n: unknown) => string }
const { createElement: h } = (await jiti.import('react')) as { createElement: (...a: unknown[]) => unknown }
type Mod = Record<string, (p: object) => unknown>
const sk = (await jiti.import(path.join(hier, 'skeleton.tsx'))) as Mod

const SCHLECHT = /NaN|undefined|Invalid Date|\[object|null</
const zaehle = (html: string, re: RegExp) => (html.match(re) ?? []).length

function sauber(html: string, name: string) {
  assert.ok(html.length > 0, `${name}: leer`)
  assert.doesNotMatch(html, SCHLECHT, `${name}: ${html.match(SCHLECHT)?.[0]}`)
}

test('Skeleton: aria-hidden und shimmer-Klasse', () => {
  const html = renderToStaticMarkup(h(sk.Skeleton, { className: 'h-4 w-10' }))
  assert.match(html, /aria-hidden="true"/)
  assert.match(html, /class="shimmer /)
})

test('SkeletonRegion: role=status, aria-busy, ein sr-only-Text', () => {
  const html = renderToStaticMarkup(h(sk.SkeletonRegion, null, h(sk.Skeleton, {})))
  assert.match(html, /role="status"/)
  assert.match(html, /aria-busy="true"/)
  assert.equal(zaehle(html, /Lädt…/g), 1)
})

test('Chart-Silhouetten, Karten, Tabellen und Listen rendern', () => {
  for (const variant of ['bars', 'area', 'hbars', 'donut']) {
    sauber(renderToStaticMarkup(h(sk.SkeletonChart, { variant, height: 200, legend: true })), `Chart ${variant}`)
  }
  sauber(renderToStaticMarkup(h(sk.SkeletonStatCards, { count: 4 })), 'StatCards')
  sauber(renderToStaticMarkup(h(sk.SkeletonTable, { rows: 3 })), 'Table')
  sauber(renderToStaticMarkup(h(sk.SkeletonPageHeader, { actions: 2 })), 'PageHeader')
  sauber(renderToStaticMarkup(h(sk.SkeletonCardList, { rows: 2 })), 'CardList')
  sauber(renderToStaticMarkup(h(sk.SkeletonToolbar, {})), 'Toolbar')
  sauber(renderToStaticMarkup(h(sk.SkeletonText, { lines: 6 })), 'Text')
})

test('Chart-Platzhalter haben die geforderte feste Hoehe', () => {
  const html = renderToStaticMarkup(h(sk.SkeletonChart, { variant: 'area', height: 320 }))
  assert.match(html, /height:320px/)
})

test('Historie: jeder Tab-Platzhalter rendert und meldet Lädt… genau einmal', async () => {
  const v = (await jiti.import(path.join(src, 'components/verlauf/VerlaufSkeletons.tsx'))) as Mod
  for (const tab of ['networth', 'accounts', 'portfolio', 'monthly']) {
    const html = renderToStaticMarkup(h(v.VerlaufTabSkeleton, { tab }))
    sauber(html, `Verlauf ${tab}`)
    assert.equal(zaehle(html, /Lädt…/g), 1, `Verlauf ${tab}: Lädt…`)
    assert.equal(zaehle(html, /role="status"/g), 1, `Verlauf ${tab}: role`)
  }
})

function alleLoading(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) alleLoading(p, out)
    else if (e.name === 'loading.tsx') out.push(p)
  }
  return out
}

test('Alle loading.tsx unter (dashboard) rendern: genau eine Statusregion, genau ein Lädt…', async () => {
  const dateien = alleLoading(path.join(src, 'app/(dashboard)'))
  assert.ok(dateien.length >= 30, `nur ${dateien.length} loading.tsx gefunden`)
  for (const f of dateien) {
    const rel = path.relative(src, f)
    const mod = (await jiti.import(f)) as { default: () => unknown }
    const html = renderToStaticMarkup(h(mod.default, {}))
    sauber(html, rel)
    assert.equal(zaehle(html, /role="status"/g), 1, `${rel}: role=status`)
    assert.equal(zaehle(html, /Lädt…/g), 1, `${rel}: Lädt…`)
    assert.doesNotMatch(html, /animate-pulse/, `${rel}: animate-pulse statt shimmer`)
  }
})

test('Shimmer-CSS: gueltige Farben (kein oklch(var(...))) und reduced-motion', () => {
  const css = fs.readFileSync(path.join(src, 'app/globals.css'), 'utf8')
  const start = css.indexOf('.shimmer {')
  const block = css.slice(start, css.indexOf('Scroll-Hinweis', start)).replace(/\/\*[\s\S]*?\*\//g, '')
  assert.doesNotMatch(block, /oklch\(var\(/)
  assert.match(block, /color-mix\(/)
  assert.match(block, /prefers-reduced-motion: reduce/)
})
