import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extrahiereHaendler } from './merchant-key.ts'

test('PayPal: der Händler steht hinter "Ihr Einkauf bei"', () => {
  assert.equal(
    extrahiereHaendler('1053235822582/PP.8546.PP/. Namecheap, Inc, Ihr Einkauf bei Namecheap, Inc EREF: 1053235822582 MREF: 5JV22257M9Q4E CRED: LU96ZZZ'),
    'namecheap',
  )
  assert.equal(
    extrahiereHaendler('105/PP.8546.PP/. Google Payment Ireland Ltd., Ihr Einkauf bei Google Payment Ireland Ltd. EREF: 105 MREF: X'),
    'google payment ireland',
  )
})

test('PayPal ohne erkennbaren Händler ("....") ergibt null statt eines Schlüssels', () => {
  assert.equal(extrahiereHaendler('105/PP.8546.PP/. ...................., Ihr Einkauf bei .................... EREF: 105 MREF: X'), null)
  assert.equal(extrahiereHaendler('105/PP.8546.PP/. , Ihr Einkauf bei EREF: 105 MREF: X'), null)
})

test('Kartenzahlung: Händler vor dem ersten Schrägstrich, Terminalnummer fällt weg', () => {
  assert.equal(
    extrahiereHaendler('Alipay.Starbucks/CHAOYANGQUDONGSIHUANZHONGLU56HAOLOUAZ11.10.2026 / 16:43 OrtszeitPHYS Zahlung 37,00 CNY'),
    'alipay starbucks',
  )
  assert.equal(
    extrahiereHaendler('Alipay.OtherRetail344/CHAOYANGQUDONGSIHUANZHONGLU56HAO14.10.2026 / 17:48 OrtszeitPHYS Zahlung 12,00 CNY'),
    'alipay otherretail',
  )
  assert.equal(
    extrahiereHaendler('Alipay.OtherRetail064/CHAOYANG/CN 13.10.2026 / 12:47 Ortszeit PHYS'),
    'alipay otherretail',
  )
  assert.equal(
    extrahiereHaendler('SP KERNENERGIE GMBH/Grundtalring 23/GROWALLSTADT/DE/0 09.10.2026 / 04:14 OrtszeitECTL I7ILQPTZ'),
    'sp kernenergie',
  )
})

test('Alles andere ist kein Abwickler-Muster: null', () => {
  assert.equal(extrahiereHaendler(null), null)
  assert.equal(extrahiereHaendler(''), null)
  assert.equal(extrahiereHaendler('REWE Markt GmbH Elsenfeld Kartenzahlung'), null)
  assert.equal(extrahiereHaendler('Miete Oktober 2026 / Wohnung'), null)
})
