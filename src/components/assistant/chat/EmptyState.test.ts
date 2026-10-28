import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

/** Server-Rendering des Leerzustands: Chip „Athena kennenlernen“, Startprompt mit/ohne Namen. Kein Browser. */
const hier = path.dirname(fileURLToPath(import.meta.url))
const jiti = createJiti(import.meta.url, {
  alias: { '@': path.resolve(hier, '../../..') },
  jsx: { runtime: 'automatic' },
  moduleCache: false,
  interopDefault: true,
})
const { renderToStaticMarkup } = (await jiti.import('react-dom/server')) as { renderToStaticMarkup: (n: unknown) => string }
const { createElement: h } = (await jiti.import('react')) as { createElement: (...a: unknown[]) => unknown }
const { EmptyState } = (await jiti.import(path.join(hier, 'EmptyState.tsx'))) as { EmptyState: (p: object) => unknown }
const { NutzerProvider } = (await jiti.import(path.resolve(hier, '../../providers/nutzer-context.tsx'))) as { NutzerProvider: (p: object) => unknown }
const { kennenlernPrompt } = (await jiti.import(path.resolve(hier, '../../../lib/assistant/starter.ts'))) as { kennenlernPrompt: (n?: string | null) => string }

const SCHLECHT = /NaN|undefined|Invalid Date|\[object|null</
const rendern = (name: string | null | undefined, pathname = '/assistant') => {
  const el = h(EmptyState, { pathname, onPick: () => {} })
  return renderToStaticMarkup(name === undefined ? el : h(NutzerProvider, { name }, el))
}

test('EmptyState: Chip „Athena kennenlernen“ steht vor den vier Startfragen, volle Breite am Handy', () => {
  const html = rendern('Eric')
  assert.doesNotMatch(html, SCHLECHT)
  assert.match(html, /Athena kennenlernen/)
  const chip = html.indexOf('Athena kennenlernen')
  assert.ok(chip > 0 && chip < html.indexOf('Wie hat sich mein Vermögen'))
  assert.match(html, /<button[^>]*w-full[^>]*border-primary[^>]*>/)
  assert.equal((html.match(/<button /g) ?? []).length, 5)
})

test('EmptyState: Chip auch auf Seiten mit eigenen Startfragen und ohne Provider/Namen ohne Abstürze', () => {
  for (const [name, pfad] of [[undefined, '/assistant'], [null, '/dashboard'], ['Malik', '/depot']] as const) {
    const html = rendern(name, pfad)
    assert.doesNotMatch(html, SCHLECHT, `${name}/${pfad}`)
    assert.match(html, /Athena kennenlernen/)
    assert.equal((html.match(/<button /g) ?? []).length, 5)
  }
})

test('Startprompt: Name steckt im Prompt, ohne Namen sauberer Prompt, keine Reste', () => {
  const mit = kennenlernPrompt('Malik')
  assert.match(mit, /ich bin Malik\./)
  const ohne = kennenlernPrompt(null)
  assert.doesNotMatch(ohne, /ich bin/)
  for (const p of [mit, ohne]) assert.doesNotMatch(p, /NaN|undefined|null|\{\{/)
})

test('EmptyState: mit onFill bleibt der Chip ein Button (kein Link, kein Submit), Startfragen bleiben Buttons', () => {
  const el = h(EmptyState, { pathname: '/assistant', onPick: () => {}, onFill: () => {} })
  const html = renderToStaticMarkup(h(NutzerProvider, { name: 'Eric', hatAusgangslage: true }, el))
  assert.doesNotMatch(html, SCHLECHT)
  assert.match(html, /Athena kennenlernen/, 'Chip bleibt auch mit vorhandener Ausgangslage sichtbar')
  assert.equal((html.match(/<button type="button"/g) ?? []).length, 5)
  assert.doesNotMatch(html, /<a /)
})
