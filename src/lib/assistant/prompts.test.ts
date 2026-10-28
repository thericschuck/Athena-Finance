import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

/**
 * Regression des System-Prompts nach der Umstellung auf den Anzeigenamen.
 *
 * `__fixtures__/prompt-eric-vorher.json` ist der Prompt des Codes VOR der Umstellung (aus prompts.ts@HEAD erzeugt,
 * 60 Fälle: 4 Haltungen x 3 Kontexte x 5 Einstellungsvarianten). Für den Namen „Eric“ muss der neue Prompt
 * zeichengleich sein, mit genau EINER Ausnahme: dem neuen Abschnitt „Kennenlern-Gespräch“ im Kern.
 * jiti übersetzt TS und den Alias `@/` ohne Build.
 */
const hier = path.dirname(fileURLToPath(import.meta.url))
const jiti = createJiti(import.meta.url, { alias: { '@': path.resolve(hier, '../..') }, moduleCache: false, interopDefault: true })
type Bloecke = { core: string; user: string; volatile: string }
const prompts = (await jiti.import(path.join(hier, 'prompts.ts'))) as {
  buildAthenaSystemPrompt: (c: unknown, s: unknown, n: Date, r: string, e: object) => Bloecke
  personaTemplates: (n: string | null) => Record<string, string>
}
const { renderKennenlernen } = (await jiti.import(path.join(hier, 'kennenlernen.ts'))) as { renderKennenlernen: (n: string | null) => string }
const { buildScopeContext } = (await jiti.import(path.join(hier, '../haushalt/scope.ts'))) as { buildScopeContext: (i: object) => unknown }

const vorher = JSON.parse(fs.readFileSync(path.join(hier, '__fixtures__/prompt-eric-vorher.json'), 'utf8')) as {
  core: string
  templates: Record<string, string>
  faelle: Record<string, { user: string; volatile: string }>
}

const SEP = '\n\n---\n\n'
const E = '11111111-1111-4111-8111-111111111111'
const M = '22222222-2222-4222-8222-222222222222'
const H = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const solo = buildScopeContext({ userId: E, householdId: H, members: [{ id: E, role: 'owner', joinedAt: '2026-01-01' }], accounts: [] })
const zweit = buildScopeContext({
  userId: E, requested: 'gemeinsam', householdId: H, accounts: [],
  members: [{ id: E, role: 'owner', joinedAt: '2026-01-01', name: 'Eric' }, { id: M, role: 'member', joinedAt: '2026-02-01', name: 'Malik' }],
})
const voll = {
  memories: [
    { key: 'sparziel-umzug', content: 'Umzug 2028', category: 'goal', source: 'agent' },
    { key: 'ton', content: 'knapp', category: 'preference', source: 'user' },
  ],
  knowledge: [{ id: 'k1', title: 'Anlageregeln', tags: ['regeln', 'etf'] }, { id: 'k2', title: 'Notiz', tags: [] }],
  accounts: [{ id: 'a1', name: 'Giro', type: 'checking', currency: 'EUR' }],
  categories: [{ id: 'c1', name: 'Wohnen', type: 'expense', parent_id: null }, { id: 'c2', name: 'Miete', type: 'expense', parent_id: 'c1' }],
}
const leer = { memories: [], knowledge: [], accounts: [], categories: [] }
const kontexte: Record<string, object> = { soloVoll: { scope: solo, ...voll }, soloLeer: { scope: solo, ...leer }, zweitVoll: { scope: zweit, ...voll } }
const basis = {
  model: 'm', effort: 'high', webResearch: true, memoryEnabled: true, autoMemory: true, dailyMessageCap: 1, maxSteps: 1,
  persona: 'offensiv', personaText: null, customInstructions: null,
}
const varianten: Record<string, object> = {
  std: {}, ohneGedaechtnis: { memoryEnabled: false }, ohneWeb: { webResearch: false },
  anweisung: { customInstructions: 'Antworte kurz.' }, eigeneHaltung: { personaText: 'Sei nett zu Eric.' },
}
const JETZT = new Date('2026-10-28T10:00:00Z')
const bauen = (persona: string, kontext: string, variante: string, name: string | null) =>
  prompts.buildAthenaSystemPrompt(
    { ...kontexte[kontext], nutzerName: name }, { ...basis, persona, ...varianten[variante] }, JETZT, '/dashboard',
    { projekt: '## Projekt\n\nx', bezuege: '## Bezüge\n\ny' },
  )

test('Regression: für „Eric“ ist der Prompt in allen 60 Fällen zeichengleich zum alten, nur der Kennenlern-Abschnitt kommt dazu', () => {
  let n = 0
  for (const key of Object.keys(vorher.faelle)) {
    const [persona, kontext, variante] = key.split('|')
    const neu = bauen(persona, kontext, variante, 'Eric')
    const alt = vorher.faelle[key]
    assert.equal(neu.user, alt.user, `${key}: user-Block`)
    assert.equal(neu.volatile, alt.volatile, `${key}: volatile-Block`)
    const abschnitt = SEP + renderKennenlernen('Eric')
    assert.equal(neu.core.split(abschnitt).length, 2, `${key}: Abschnitt genau einmal im Kern`)
    assert.equal(neu.core.replace(abschnitt, ''), vorher.core, `${key}: alter Kern + Abschnitt == neuer Kern`)
    n++
  }
  assert.equal(n, 60)
})

test('Regression: die Haltungs-Vorlagen für „Eric“ sind zeichengleich zu den alten Konstanten', () => {
  assert.deepEqual(prompts.personaTemplates('Eric'), vorher.templates)
})

test('Kennenlern-Abschnitt: kompakt (unter 25 Zeilen), nennt remember, Überspringen und die Reihenfolge der Themen', () => {
  const t = renderKennenlernen('Eric')
  assert.ok(t.split('\n').filter((z) => z.trim()).length < 25)
  for (const s of ['## Kennenlern-Gespräch', '`remember`', 'Überspringen', 'Athena → Speicher', 'Rolle und Einkommensart', 'Ton und Detailgrad', 'nur wenn ein Haushalt mit Partner existiert', '5 bis 8 Stichpunkten']) {
    assert.ok(t.includes(s), s)
  }
  assert.ok(t.indexOf('Rolle und Einkommensart') < t.indexOf('Ziele und Zeithorizont'))
  assert.ok(t.indexOf('Ziele und Zeithorizont') < t.indexOf('Verpflichtungen und Schulden'))
  assert.ok(t.indexOf('Verpflichtungen und Schulden') < t.indexOf('Erfahrung und Risikobereitschaft'))
  assert.ok(t.includes('Der Anzeigename ist „Eric“.'))
  assert.ok(!renderKennenlernen(null).includes('Anzeigename'))
})

test('Anderer Name (Malik): kein „Eric“ im Prompt, korrekter Genitiv, eigene Haltung bleibt unangetastet', () => {
  for (const persona of ['offensiv', 'schonungslos', 'brutal', 'sachlich']) {
    for (const kontext of ['soloVoll', 'soloLeer', 'zweitVoll']) {
      const p = bauen(persona, kontext, 'std', 'Malik')
      const alles = [p.core, p.user, p.volatile].join(SEP)
      assert.doesNotMatch(alles, /Eric/, `${persona}/${kontext}`)
      assert.doesNotMatch(alles, /\{\{|\}\}|undefined|NaN|null/, `${persona}/${kontext}`)
    }
  }
  const offensiv = bauen('offensiv', 'soloVoll', 'std', 'Malik')
  assert.ok(offensiv.user.includes('**Maliks Einnahmen sind eine Variable, die er steuert'))
  assert.ok(offensiv.user.includes('kein Verkäufer, der Malik etwas andrehen will'))
  assert.ok(offensiv.user.includes('Maliks Konten'))
  assert.ok(offensiv.user.includes('von Malik vorgegeben'))
  assert.ok(offensiv.core.includes('persönlichen Finanz-App von Malik.'))
  // Freitext-Haltung des Nutzers: unverändert, auch wenn sie einen anderen Namen enthält.
  const eigen = bauen('offensiv', 'soloVoll', 'eigeneHaltung', 'Malik')
  assert.ok(eigen.user.includes('Sei nett zu Eric.'))
  assert.ok(eigen.user.includes('Von Malik eingestellt;'))
})

test('Ohne Namen: neutrale Formulierungen, grammatisch, keine Reste', () => {
  for (const persona of ['offensiv', 'schonungslos', 'brutal', 'sachlich']) {
    for (const kontext of ['soloVoll', 'soloLeer']) {
      for (const name of [null, undefined as unknown as null]) {
        const p = bauen(persona, kontext, 'std', name)
        const alles = [p.core, p.user, p.volatile].join(SEP)
        assert.doesNotMatch(alles, /Eric|Malik/, persona)
        assert.doesNotMatch(alles, /\{\{|\}\}|undefined|NaN|null/, persona)
      }
    }
  }
  const o = bauen('offensiv', 'soloVoll', 'std', null)
  assert.ok(o.user.includes('**Die Einnahmen des Nutzers sind eine Variable, die er steuert'))
  assert.ok(o.user.includes('kein Verkäufer, der dem Nutzer etwas andrehen will'))
  assert.ok(o.user.includes('Konten des Nutzers'))
  assert.ok(o.user.includes('Von dem Nutzer eingestellt;'))
  assert.ok(o.core.includes('Finanz-App von dem Nutzer.'))
  assert.ok(o.core.includes('Beantworte keine Frage über die Finanzen des Nutzers aus dem Gedächtnis'))
  assert.ok(o.core.includes('Niemals für die eigenen Zahlen des Nutzers'))
  assert.ok(o.core.includes('Sag dem Nutzer nicht, du könntest die Datei nicht mehr sehen'))
  const b = bauen('brutal', 'soloVoll', 'std', null)
  assert.ok(b.user.includes('nie den Nutzer selbst'))
  assert.ok(b.user.includes('Der Nutzer hat das ausdrücklich so gewählt.'))
})
