import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EINSTELLUNGEN_HAUSHALT, EINSTELLUNGEN_INTEGRATIONEN,
  ATHENA_KENNENLERNEN_HREF, LEERE_ZAEHLER, checklisteFlag, checklisteStatus, ersteSchritte, fortschritt, naechsterSchritt, sollFertigVermerken,
  type ErsteSchritteZaehler,
} from './erste-schritte.ts'
import { scopeHinweis } from './hinweis.ts'

const z = (teil: Partial<ErsteSchritteZaehler>): ErsteSchritteZaehler => ({ ...LEERE_ZAEHLER, ...teil })

test('Erste Schritte: ohne Daten ist nichts erledigt, 0 von 8, naechster ist das Konto', () => {
  const s = ersteSchritte(LEERE_ZAEHLER)
  // 4 Grundlagen + Bank, Krypto, Depot, Athena (der Partner-Schritt fehlt ohne Haushalt)
  assert.deepEqual(s.map(x => x.id), ['konto', 'buchungen', 'kategorien', 'planung', 'bank', 'krypto', 'depot', 'athena'])
  assert.ok(s.every(x => !x.erledigt))
  assert.deepEqual(fortschritt(s), { erledigt: 0, gesamt: 8, prozent: 0 })
  assert.equal(naechsterSchritt(s)?.id, 'konto')
})

test('Erste Schritte: haken sich aus den Zaehlwerten ab', () => {
  const s = ersteSchritte(z({ konten: 1, buchungen: 12, kategorien: 5, sparziele: 1 }))
  assert.deepEqual(s.filter(x => x.erledigt).map(x => x.id), ['konto', 'buchungen', 'kategorien', 'planung'])
  assert.deepEqual(fortschritt(s), { erledigt: 4, gesamt: 8, prozent: 50 })
  // sind die Grundlagen fertig, ist der erste offene optionale Schritt der naechste: die Bank
  assert.equal(naechsterSchritt(s)?.id, 'bank')
})

test('Erste Schritte: Vertrag ODER Sparziel erledigt den Planungsschritt; Athena zaehlt zum Fortschritt', () => {
  assert.ok(ersteSchritte(z({ vertraege: 1 })).find(x => x.id === 'planung')?.erledigt)
  assert.ok(ersteSchritte(z({ sparziele: 2 })).find(x => x.id === 'planung')?.erledigt)
  const s = ersteSchritte(z({ athenaChats: 3 }))
  assert.ok(s.find(x => x.id === 'athena')?.erledigt)
  assert.equal(fortschritt(s).erledigt, 1)
})

test('Erste Schritte: Athena kennenlernen mit Direktlink in den Chat', () => {
  const a = ersteSchritte(LEERE_ZAEHLER).find(x => x.id === 'athena')
  assert.equal(a?.titel, 'Athena kennenlernen')
  assert.equal(a?.aktion, 'Athena kennenlernen')
  assert.equal(a?.href, '/assistant?start=kennenlernen')
  assert.equal(a?.href, ATHENA_KENNENLERNEN_HREF)
  assert.match(a?.text ?? '', /Eingabefeld/)
})

test('Erste Schritte: ganz fertig -> kein naechster Schritt', () => {
  const s = ersteSchritte(z({
    konten: 1, buchungen: 1, kategorien: 1, vertraege: 1, athenaChats: 1,
    bankVerbindungen: 1, kryptoKonten: 1, depots: 1,
  }))
  assert.equal(naechsterSchritt(s), null)
})

test('Erste Schritte: Anbindungen sind optional, zaehlen aber zum Fortschritt', () => {
  const s = ersteSchritte(z({ bankVerbindungen: 1, kryptoKonten: 1, depots: 1, inventar: 2 }))
  assert.equal(fortschritt(s).erledigt, 3)
  for (const id of ['bank', 'krypto', 'depot', 'athena'] as const) {
    const x = s.find(y => y.id === id)
    assert.equal(x?.optional, true, id)
    assert.equal(x?.gruppe, 'anbindungen', id)
  }
  for (const id of ['konto', 'buchungen', 'kategorien', 'planung'] as const) {
    assert.equal(s.find(y => y.id === id)?.gruppe, 'grundlagen', id)
    assert.equal(s.find(y => y.id === id)?.optional, false, id)
  }
})

test('Erste Schritte: Bank gilt mit eigener Verbindung ODER einem Konto mit IBAN als erledigt, Link fuehrt in die Integrationen', () => {
  assert.ok(ersteSchritte(z({ bankVerbindungen: 1 })).find(x => x.id === 'bank')?.erledigt)
  assert.ok(ersteSchritte(z({ bankVerbunden: true })).find(x => x.id === 'bank')?.erledigt)
  const offen = ersteSchritte(LEERE_ZAEHLER).find(x => x.id === 'bank')
  assert.equal(offen?.erledigt, false)
  assert.equal(offen?.href, EINSTELLUNGEN_INTEGRATIONEN)
  assert.equal(offen?.href, '/settings?tab=integrationen')
})

test('Erste Schritte: Krypto erledigt mit Boersen-Schluessel ODER Krypto-Assets; offen fuehrt in die Integrationen', () => {
  assert.ok(ersteSchritte(z({ kryptoKonten: 1 })).find(x => x.id === 'krypto')?.erledigt)
  assert.ok(ersteSchritte(z({ kryptoAssets: 3 })).find(x => x.id === 'krypto')?.erledigt)
  assert.equal(ersteSchritte(LEERE_ZAEHLER).find(x => x.id === 'krypto')?.href, EINSTELLUNGEN_INTEGRATIONEN)
  // verbunden: der Link geht zur Krypto-Seite statt noch einmal zu den Einstellungen
  assert.equal(ersteSchritte(z({ kryptoKonten: 1 })).find(x => x.id === 'krypto')?.href, '/crypto')
})

test('Erste Schritte: Depot ODER Wertgegenstaende erledigen den Schritt', () => {
  assert.ok(ersteSchritte(z({ depots: 1 })).find(x => x.id === 'depot')?.erledigt)
  assert.ok(ersteSchritte(z({ inventar: 1 })).find(x => x.id === 'depot')?.erledigt)
  assert.equal(ersteSchritte(z({ depots: 1 })).find(x => x.id === 'depot')?.href, '/inventar')
  assert.equal(ersteSchritte(LEERE_ZAEHLER).find(x => x.id === 'depot')?.href, '/depot')
})

test('Erste Schritte: Partner-Schritt nur fuer den Haushalts-Eigentuemer ohne Partner oder wenn schon einer da ist', () => {
  // kein Haushalt oder Mitglied: kein Schritt
  assert.equal(ersteSchritte(LEERE_ZAEHLER).some(x => x.id === 'haushalt'), false)
  // Eigentuemer allein: offen, Link in den Haushalt-Reiter
  const offen = ersteSchritte(z({ partnerEinladbar: true })).find(x => x.id === 'haushalt')
  assert.equal(offen?.erledigt, false)
  assert.equal(offen?.href, EINSTELLUNGEN_HAUSHALT)
  assert.equal(offen?.href, '/settings?tab=haushalt')
  // Partner vorhanden: abgehakt
  assert.equal(ersteSchritte(z({ partnerVorhanden: true })).find(x => x.id === 'haushalt')?.erledigt, true)
})

test('Erste Schritte: Partner-Schritt steht zwischen Depot und Athena', () => {
  const ids = ersteSchritte(z({ partnerEinladbar: true })).map(x => x.id)
  assert.ok(ids.indexOf('haushalt') > ids.indexOf('depot') && ids.indexOf('haushalt') < ids.indexOf('athena'))
})

const ALLES = {
  konten: 1, buchungen: 1, kategorien: 1, vertraege: 1, athenaChats: 1, bankVerbindungen: 1, kryptoKonten: 1, depots: 1,
}

test('Checkliste: Vermerk wird streng gelesen', () => {
  assert.equal(checklisteFlag('ausgeblendet'), 'ausgeblendet')
  assert.equal(checklisteFlag('fertig'), 'fertig')
  for (const x of [null, undefined, '', 'offen', 1, true, {}, ['fertig']]) assert.equal(checklisteFlag(x), null)
})

test('Checkliste: Vermerk gewinnt, ohne Zaehler (keine Abfragen noetig)', () => {
  assert.equal(checklisteStatus(null, 'ausgeblendet'), 'ausgeblendet')
  assert.equal(checklisteStatus(null, 'fertig'), 'fertig')
  assert.equal(checklisteStatus(LEERE_ZAEHLER, 'ausgeblendet'), 'ausgeblendet')
})

test('Checkliste: nichts da -> Willkommen, naechster ist das Konto, 0 von 8', () => {
  const st = checklisteStatus(LEERE_ZAEHLER, null)
  assert.ok(typeof st === 'object')
  if (typeof st !== 'object') return
  assert.equal(st.willkommen, true)
  assert.equal(st.naechster.id, 'konto')
  assert.deepEqual(st.fortschritt, { erledigt: 0, gesamt: 8, prozent: 0 })
})

test('Checkliste: teilweise erledigt -> Karte mit naechstem Schritt, kein Willkommen', () => {
  const st = checklisteStatus(z({ konten: 1, buchungen: 5, kategorien: 3 }), null)
  assert.ok(typeof st === 'object')
  if (typeof st !== 'object') return
  assert.equal(st.willkommen, false)
  assert.equal(st.naechster.id, 'planung')
  assert.equal(st.fortschritt.erledigt, 3)
})

test('Checkliste: Grundlagen fertig, optionale offen -> Karte bleibt (Fortschritt 4 von 8)', () => {
  const st = checklisteStatus(z({ konten: 1, buchungen: 1, kategorien: 1, vertraege: 1 }), null)
  assert.ok(typeof st === 'object')
  if (typeof st !== 'object') return
  assert.equal(st.naechster.id, 'bank')
  assert.equal(st.fortschritt.prozent, 50)
})

test('Checkliste: alle Schritte erledigt -> fertig; mit Partner-Schritt muss auch der erledigt sein', () => {
  assert.equal(checklisteStatus(z(ALLES), null), 'fertig')
  const mitPartnerOffen = checklisteStatus(z({ ...ALLES, partnerEinladbar: true }), null)
  assert.ok(typeof mitPartnerOffen === 'object')
  if (typeof mitPartnerOffen === 'object') assert.equal(mitPartnerOffen.naechster.id, 'haushalt')
  assert.equal(checklisteStatus(z({ ...ALLES, partnerVorhanden: true }), null), 'fertig')
})

test('Checkliste: ohne Zaehler und ohne Vermerk (Abfrage fehlgeschlagen) -> nichts anzeigen', () => {
  assert.equal(checklisteStatus(null, null), 'fertig')
})

test("Checkliste: 'fertig' wird nur im Scope ich und nur ohne Vermerk geschrieben", () => {
  const fertig = z(ALLES)
  assert.equal(sollFertigVermerken(fertig, 'ich', null), true)
  assert.equal(sollFertigVermerken(fertig, 'gemeinsam', null), false)
  assert.equal(sollFertigVermerken(fertig, 'partner', null), false)
  assert.equal(sollFertigVermerken(fertig, 'ich', 'ausgeblendet'), false)
  assert.equal(sollFertigVermerken(fertig, 'ich', 'fertig'), false)
  assert.equal(sollFertigVermerken(z({ konten: 1 }), 'ich', null), false)
})

const mitglieder = [
  { id: 'eric', name: 'Eric', role: 'owner' },
  { id: 'malik', name: 'Malik', role: 'member' },
]
const ctx = (scope: 'ich' | 'partner' | 'gemeinsam', available: ('ich' | 'partner' | 'gemeinsam')[], userId = 'malik') => ({
  scope, available, members: mitglieder, userId,
  partnerId: available.length <= 1 ? null : userId === 'malik' ? 'eric' : 'malik',
})

test('Scope-Hinweis: ohne Haushalt (nur ein Scope) kein Hinweis', () => {
  assert.equal(scopeHinweis(ctx('ich', ['ich']), 'Konten'), null)
})

test('Scope-Hinweis: im Scope Gemeinsam kein Hinweis', () => {
  assert.equal(scopeHinweis(ctx('gemeinsam', ['ich', 'partner', 'gemeinsam']), 'Konten'), null)
})

test('Scope-Hinweis: Ich + Haushalt -> verweist auf Gemeinsam und nennt den Partner', () => {
  const h = scopeHinweis(ctx('ich', ['ich', 'partner', 'gemeinsam']), 'Konten')
  assert.equal(h?.ziel, 'gemeinsam')
  assert.match(h?.text ?? '', /Konten von Eric/)
})

test('Scope-Hinweis: ohne Partnername faellt der Text sauber zurueck', () => {
  const h = scopeHinweis({ ...ctx('ich', ['ich', 'gemeinsam']), members: [{ id: 'malik', name: null, role: 'member' }, { id: 'eric', name: ' ', role: 'owner' }] }, 'Verträge')
  assert.match(h?.text ?? '', /Verträge von dem Partner/)
})

test('Scope-Hinweis: Scope Partner verweist ebenfalls auf Gemeinsam', () => {
  assert.equal(scopeHinweis(ctx('partner', ['ich', 'partner', 'gemeinsam']), 'Konten')?.ziel, 'gemeinsam')
})

import { karteTexte, checklisteStatus as statusFuerKarte, type ChecklisteAnsicht } from './erste-schritte.ts'

test('karteTexte: Standard, Willkommen, Zwischenzustand, ohne NaN/undefined', () => {
  const ansicht = (teil: object) => statusFuerKarte({ ...LEERE_ZAEHLER, ...teil }, null) as ChecklisteAnsicht
  const leer = karteTexte(ansicht({}))
  assert.equal(leer.titel, 'Willkommen – so legst du los')
  assert.equal(leer.prozentText, '0 %')
  assert.equal(leer.grundlagenFertig, false)
  const mitte = karteTexte(ansicht({ konten: 1, buchungen: 2 }))
  assert.equal(mitte.titel, 'Erste Schritte')
  assert.equal(mitte.untertitel, '')
  assert.equal(mitte.zaehlText, '2 von 8 erledigt')
  const grund = karteTexte(ansicht({ konten: 1, buchungen: 2, kategorien: 1, sparziele: 1 }))
  assert.equal(grund.grundlagenFertig, true)
  assert.equal(grund.titel, 'Grundlagen erledigt')
  assert.equal(grund.prozentText, '50 %')
  assert.equal(grund.naechsterLabel, 'Als Nächstes (optional)')
  const kaputt = karteTexte({ ...ansicht({}), fortschritt: { erledigt: NaN, gesamt: NaN, prozent: NaN } })
  for (const v of Object.values(kaputt)) assert.doesNotMatch(String(v), /NaN|undefined/)
  assert.equal(kaputt.prozentText, '0 %')
  assert.equal(karteTexte({ ...ansicht({}), fortschritt: { erledigt: 9, gesamt: 8, prozent: 150 } }).prozentText, '100 %')
})
