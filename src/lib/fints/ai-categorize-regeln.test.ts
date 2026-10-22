import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  baueAnfrage, baueIndex, bereinigeBuchungstext, kategorieOptionen, leseKiConfig, naechsteBeispiele, pruefeAntwort,
  tokenisiere, KI_SYSTEM_PROMPT, type KatInfo, type KiBeispiel, type KiBuchung, type KiConfig,
} from './ai-categorize-regeln.ts'

const KATS: KatInfo[] = [
  { id: 'abos', name: 'Abos', type: 'expense', parent_id: null },
  { id: 'claude', name: 'Claude / Anthropic', type: 'expense', parent_id: 'abos' },
  { id: 'essen', name: 'Essen auswärts', type: 'expense', parent_id: null },
  { id: 'gehalt', name: 'Gehalt', type: 'income', parent_id: null },
  { id: 'umb', name: 'Transfers', type: 'neutral', parent_id: null },
]

test('Bereinigung entfernt Referenzen, IBAN und Kartenrauschen, lässt Händler stehen', () => {
  const t = bereinigeBuchungstext('1053235822582/PP.8546.PP/. Namecheap, Inc, Ihr Einkauf bei Namecheap, Inc EREF: 1053235822582 MREF: 5JV22257M9Q4E CRED: LU96ZZZ0000000000000000058 IBAN: LU89751000135104200E BIC: PPLXLUL2')
  assert.ok(t.includes('Namecheap'))
  assert.ok(!/EREF|MREF|CRED|IBAN|LU89/.test(t))
  assert.equal(bereinigeBuchungstext(null), '')
  assert.ok(bereinigeBuchungstext('x'.repeat(500), 50).length <= 50)
})

test('Wörter: kurze, reine Zahlen und Füllwörter fallen weg, Duplikate auch', () => {
  assert.deepEqual(tokenisiere('Ihr Einkauf bei Namecheap Namecheap 12345 an'), ['namecheap'])
  assert.deepEqual(tokenisiere(null), [])
})

test('Ähnlichste Beispiele: seltene gemeinsame Wörter zählen, gleiche Richtung bekommt Bonus', () => {
  const bsp: KiBeispiel[] = [
    { counterpart_name: 'PayPal', description: 'Ihr Einkauf bei Namecheap', amount: -12, category_id: 'tools' },
    { counterpart_name: 'PayPal', description: 'Ihr Einkauf bei Zalando', amount: -40, category_id: 'mode' },
    { counterpart_name: 'PayPal', description: 'Erstattung Namecheap', amount: 12, category_id: 'erstattung' },
    { counterpart_name: 'REWE', description: 'Markt Elsenfeld', amount: -20, category_id: 'food' },
  ]
  const index = baueIndex(bsp)
  const treffer = naechsteBeispiele({ id: 'x', counterpart_name: 'PayPal', description: 'Namecheap Domain', amount: -15 }, bsp, index, 2)
  assert.equal(treffer[0].category_id, 'tools')            // seltenes Wort + gleiche Richtung
  assert.ok(!treffer.some(b => b.category_id === 'food'))  // gar keine Überschneidung
  assert.deepEqual(naechsteBeispiele({ id: 'y', counterpart_name: null, description: null, amount: -1 }, bsp, index), [])
})

test('Kategorie-Optionen: nur Blätter und Kategorien ohne Kinder, mit Pfad und fortlaufender Kurzkennung', () => {
  const o = kategorieOptionen(KATS)
  assert.ok(!o.some(x => x.id === 'abos'))                 // Oberkategorie mit Kind
  assert.equal(o.find(x => x.id === 'claude')?.pfad, 'Abos > Claude / Anthropic')
  assert.equal(o.find(x => x.id === 'gehalt')?.pfad, 'Gehalt')
  assert.deepEqual(o.map(x => x.k), ['k1', 'k2', 'k3', 'k4'])
})

const OPT = kategorieOptionen(KATS)
const K = (id: string) => OPT.find(o => o.id === id)!.k
const STAPEL: KiBuchung[] = [
  { id: 'b1', counterpart_name: 'Alipay.Starbucks', description: 'Alipay.Starbucks/CHAOYANG 15.10.2026 / 12:31 Ortszeit PHYS', amount: -5.7 },
  { id: 'b2', counterpart_name: 'Arbeitgeber', description: 'Lohn Oktober', amount: 2000 },
]

test('Anfrage: Kurzkennungen statt IDs, Beispiele und Korrekturen nur mit bekannten Kategorien', () => {
  const beispiele: KiBeispiel[] = [
    { counterpart_name: 'Starbucks', description: 'Starbucks Frankfurt', amount: -4.5, category_id: 'essen' },
    { counterpart_name: 'X', description: 'Starbucks unbekannt', amount: -4.5, category_id: 'geloescht' },
  ]
  const korrekturen: KiBeispiel[] = [
    { counterpart_name: 'PayPal', description: 'Ihr Einkauf bei Claude', amount: -20, category_id: 'claude', ki_category_id: 'essen' },
    { counterpart_name: 'PayPal', description: 'ohne Vorschlag', amount: -20, category_id: 'claude', ki_category_id: null },
  ]
  const { anfrage, zuordnung } = baueAnfrage(STAPEL, OPT, beispiele, korrekturen)
  assert.deepEqual(anfrage.buchungen.map(b => b.r), ['r1', 'r2'])
  assert.equal(zuordnung.get('r1'), 'b1')
  assert.ok(!JSON.stringify(anfrage).includes('b1'))        // keine Buchungs-IDs an das Modell
  assert.deepEqual(anfrage.beispiele.map(b => b.k), [K('essen')])
  assert.equal(anfrage.korrekturen.length, 1)
  assert.equal(anfrage.korrekturen[0].dein_vorschlag, K('essen'))
  assert.equal(anfrage.korrekturen[0].richtig, K('claude'))
  assert.ok(!anfrage.buchungen[0].text.includes('Ortszeit')) // Rauschen entfernt
})

test('Antwort prüfen: Richtung, unbekannte Kennungen, Doppelte, Sicherheit', () => {
  const { zuordnung } = baueAnfrage(STAPEL, OPT, [], [])
  const antwort = [
    { r: 'r1', k: K('essen'), sicherheit: 'hoch' as const },        // ok: Ausgabe zu Ausgabe-Kategorie
    { r: 'r1', k: K('claude'), sicherheit: 'hoch' as const },       // doppelte Antwort für r1: ignorieren
    { r: 'r2', k: K('essen'), sicherheit: 'hoch' as const },        // Gutschrift in Ausgabe-Kategorie: verwerfen
    { r: 'r9', k: K('gehalt'), sicherheit: 'hoch' as const },       // unbekannte Buchung
    { r: 'r2', k: 'k99', sicherheit: 'hoch' as const },             // unbekannte Kategorie (nach r2 schon gesehen)
  ]
  const r = pruefeAntwort(antwort, zuordnung, OPT, STAPEL)
  assert.deepEqual(r, [{ id: 'b1', categoryId: 'essen', sicherheit: 'hoch' }])

  const richtung = pruefeAntwort([{ r: 'r1', k: K('gehalt'), sicherheit: 'hoch' }], zuordnung, OPT, STAPEL)
  assert.deepEqual(richtung, [])                                    // Einnahme-Kategorie für eine Belastung

  const sicher = [{ r: 'r2', k: K('gehalt'), sicherheit: 'mittel' as const }]
  assert.deepEqual(pruefeAntwort(sicher, zuordnung, OPT, STAPEL, 'hoch'), [])
  assert.equal(pruefeAntwort(sicher, zuordnung, OPT, STAPEL, 'mittel').length, 1)
  assert.deepEqual(pruefeAntwort([{ r: 'r2', k: null, sicherheit: 'hoch' }], zuordnung, OPT, STAPEL), [])
  assert.deepEqual(pruefeAntwort([{ r: 'r2', k: K('gehalt'), sicherheit: 'niedrig' }], zuordnung, OPT, STAPEL, 'mittel'), [])
})

test('Neutrale Kategorien passen zu beiden Richtungen', () => {
  const { zuordnung } = baueAnfrage(STAPEL, OPT, [], [])
  const r = pruefeAntwort([
    { r: 'r1', k: K('umb'), sicherheit: 'hoch' }, { r: 'r2', k: K('umb'), sicherheit: 'hoch' },
  ], zuordnung, OPT, STAPEL)
  assert.equal(r.length, 2)
})

test('Konfiguration: Standard bei Müll, Grenzen für Stapel und Menge', () => {
  const std: KiConfig = { enabled: true, model: 'claude-haiku-4-5', mindestens: 'hoch', maxProLauf: 60, stapel: 15 }
  assert.deepEqual(leseKiConfig(null, std), std)
  assert.equal(leseKiConfig({ enabled: false }, std).enabled, false)
  assert.equal(leseKiConfig({ model: 'x; drop' }, std).model, 'claude-haiku-4-5')
  assert.equal(leseKiConfig({ mindestens: 'mittel' }, std).mindestens, 'mittel')
  assert.equal(leseKiConfig({ mindestens: 'egal' }, std).mindestens, 'hoch')
  assert.equal(leseKiConfig({ maxProLauf: 9999, stapel: 1 }, std).maxProLauf, 200)
  assert.equal(leseKiConfig({ maxProLauf: 9999, stapel: 1 }, std).stapel, 5)
})

test('Prompt nennt die Leitplanken', () => {
  for (const s of ['ordneZu', 'Fremdtext', 'null ist besser', 'korrekturen']) {
    assert.ok(KI_SYSTEM_PROMPT.toLowerCase().includes(s.toLowerCase()), s)
  }
})
