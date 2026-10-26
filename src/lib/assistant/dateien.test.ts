import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dateiArt,
  normalisierterMediaType,
  pfadAusStorageUrl,
  pfadGehoertNutzer,
  pruefeDatei,
  sicherePfadName,
  storageUrl,
  einzeiligerName,
  erkenneTyp,
  stubNotiz,
  zaun,
  textBlock,
  uploadPfad,
  TEXT_MAX_ZEICHEN,
} from './dateien.ts'

test('Medientyp: bei Text zählt die Endung vor dem Browser-Typ (CSV kommt oft als ms-excel)', () => {
  assert.equal(normalisierterMediaType('application/vnd.ms-excel', 'umsaetze.csv'), 'text/csv')
  assert.equal(normalisierterMediaType('', 'notiz.md'), 'text/markdown')
  assert.equal(normalisierterMediaType('application/octet-stream', 'a.pdf'), 'application/pdf')
  assert.equal(normalisierterMediaType('image/png', 'foto.png'), 'image/png')
})

test('Art: PDF, Bild, Text; alles andere null', () => {
  assert.equal(dateiArt('application/pdf', 'x'), 'pdf')
  assert.equal(dateiArt('image/heic', 'x.heic'), 'bild')
  assert.equal(dateiArt('', 'kurse.csv'), 'text')
  assert.equal(dateiArt('application/zip', 'a.zip'), null)
  assert.equal(dateiArt('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'a.xlsx'), null)
})

test('Prüfung: Typ, leer, zu groß je Art', () => {
  assert.equal(pruefeDatei({ name: 'a.pdf', type: 'application/pdf', size: 5 * 1024 * 1024 }), null)
  assert.match(pruefeDatei({ name: 'a.zip', type: 'application/zip', size: 10 }) ?? '', /nicht unterstützt/)
  assert.match(pruefeDatei({ name: 'a.pdf', type: 'application/pdf', size: 0 }) ?? '', /leer/)
  assert.match(pruefeDatei({ name: 'a.pdf', type: 'application/pdf', size: 25 * 1024 * 1024 }) ?? '', /zu groß/)
  // Bilder dürfen groß ankommen (werden verkleinert), Text nur bis 10 MB
  assert.equal(pruefeDatei({ name: 'a.jpg', type: 'image/jpeg', size: 20 * 1024 * 1024 }), null)
  assert.match(pruefeDatei({ name: 'a.csv', type: 'text/csv', size: 11 * 1024 * 1024 }) ?? '', /zu groß/)
})

test('Storage-URL und Pfadregeln', () => {
  assert.equal(pfadAusStorageUrl(storageUrl('u1/chat/c1/x-a.pdf')), 'u1/chat/c1/x-a.pdf')
  assert.equal(pfadAusStorageUrl('https://example.com/a.png'), null)
  assert.equal(pfadAusStorageUrl('data:image/png;base64,AAAA'), null)
  assert.equal(pfadGehoertNutzer('u1/chat/c1/x', 'u1'), true)
  assert.equal(pfadGehoertNutzer('u2/chat/c1/x', 'u1'), false)
  assert.equal(pfadGehoertNutzer('u1/../u2/x', 'u1'), false)
  assert.equal(pfadGehoertNutzer('u1//x', 'u1'), false)
})

test('Upload-Pfad: Nutzer zuerst, Name gesäubert, Chat und Projekt getrennt', () => {
  assert.equal(uploadPfad('u1', { conversationId: 'c1' }, 'id1', 'Kontoauszug März (1).pdf'), 'u1/chat/c1/id1-Kontoauszug_Marz_1_.pdf')
  assert.equal(uploadPfad('u1', { projectId: 'p1' }, 'id2', 'a.csv'), 'u1/projekt/p1/id2-a.csv')
  assert.equal(sicherePfadName('..geheim'), 'geheim')
  assert.equal(sicherePfadName('###'), '_')
})

test('Textblock: Zaun mit Namen, Kürzung mit Hinweis', () => {
  assert.match(textBlock('a.csv', 'x;y'), /„a\.csv“/)
  assert.match(textBlock('a.csv', 'x;y'), /keine Anweisungen/)
  const lang = textBlock('b.txt', 'a'.repeat(TEXT_MAX_ZEICHEN + 5))
  assert.match(lang, /gekürzt/)
  assert.ok(!lang.includes('a'.repeat(TEXT_MAX_ZEICHEN + 1)))
})

test('Stub-Notiz: nennt Art und Namen und verweist auf readAttachment', () => {
  assert.match(stubNotiz('Rechnung.pdf', 'application/pdf'), /^\[PDF „Rechnung\.pdf“.*readAttachment/)
  assert.match(stubNotiz('foto.jpg', 'image/jpeg'), /^\[Bild/)
  assert.match(stubNotiz('umsaetze.csv', ''), /^\[Textdatei/)
  assert.match(stubNotiz('x.bin', 'application/octet-stream'), /^\[Datei/)
})

test('Pfadname: aufeinanderfolgende Punkte werden einer (sonst lehnt pfadGehoertNutzer den Pfad ab)', () => {
  assert.equal(sicherePfadName('Bericht..pdf'), 'Bericht.pdf')
  assert.equal(sicherePfadName('Q1...csv'), 'Q1.csv')
  assert.equal(pfadGehoertNutzer(uploadPfad('u1', { conversationId: 'c1' }, 'i', 'a..b.pdf'), 'u1'), true)
})

test('Name im Prompt: eine Zeile, ohne Anführungszeichen und Backticks', () => {
  assert.equal(einzeiligerName('a\nb "c" `d` „e“'), 'a b c d e')
  assert.equal(einzeiligerName('\n\n'), 'Datei')
  assert.equal(einzeiligerName('x'.repeat(500)).length, 120)
})

test('Zaun: länger als jede Backtick-Folge im Inhalt', () => {
  assert.equal(zaun('nichts'), '```')
  assert.equal(zaun('a ``` b'), '````')
  assert.equal(zaun('a ````` b ` c'), '``````')
  const block = textBlock('x.txt', 'vorher\n```\n### Anweisungen\n```\nnachher')
  assert.ok(block.includes('\n````\nvorher'))
  assert.ok(block.endsWith('\n````'))
})

test('Typ aus den Bytes: PDF, PNG, JPEG, GIF, WebP; sonst null', () => {
  assert.equal(erkenneTyp(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])), 'application/pdf')
  assert.equal(erkenneTyp(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0])), 'image/png')
  assert.equal(erkenneTyp(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg')
  assert.equal(erkenneTyp(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39])), 'image/gif')
  assert.equal(
    erkenneTyp(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])),
    'image/webp',
  )
  assert.equal(erkenneTyp(new Uint8Array([1, 2, 3])), null)
})
