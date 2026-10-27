import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ibanSet, istUmbuchungIban } from './umbuchung.ts'
import { buildScopeContext, isOwnUmbuchung } from './scope.ts'

test('istUmbuchungIban: normalisiert und erkennt eigene Gegen-IBAN', () => {
  const s = ibanSet(['de01 1234', 'DE02'])
  assert.equal(istUmbuchungIban('DE01 1234', s), true)
  assert.equal(istUmbuchungIban('de02', s), true)
  assert.equal(istUmbuchungIban('DE99', s), false)
  assert.equal(istUmbuchungIban(null, s), false)
  assert.equal(istUmbuchungIban('', s), false)
})

test('istUmbuchungIban stimmt mit isOwnUmbuchung (ctx.ibans) ueberein', () => {
  const U = '11111111-1111-4111-8111-111111111111'
  const ctx = buildScopeContext({
    userId: U, members: [{ id: U, role: 'owner' }],
    accounts: [{ id: 'a1', user_id: U, shared: false, bank_iban: 'DE01 1234' }],
  })
  const s = ibanSet(ctx.ibans)
  for (const i of ['DE011234', 'de01 1234', 'DE77', null, undefined, '']) {
    assert.equal(istUmbuchungIban(i, s), isOwnUmbuchung(i, ctx))
  }
})

import { wirdHerabgestuft, effektiverFlowKind } from './umbuchung.ts'

test('Herabstufung: Umbuchung mit Gegenkonto ausserhalb des Scopes wird echte Buchung', () => {
  const z = { flow_kind: 'umbuchung', account_id: 'a', counterpart_account_id: 'b', flow_kind_extern: 'echt' }
  assert.equal(wirdHerabgestuft(z, ['a']), true)
  assert.equal(effektiverFlowKind(z, ['a']), 'echt')
  assert.equal(wirdHerabgestuft(z, ['a', 'b']), false)
  assert.equal(effektiverFlowKind(z, ['a', 'b']), 'umbuchung')
  // Konto selbst nicht im Scope: Zeile gehoert nicht in die Summe
  assert.equal(wirdHerabgestuft(z, ['b']), false)
  // ohne Gegenkonto (extern/Kategorie-Override): herabgestuft
  assert.equal(wirdHerabgestuft({ ...z, counterpart_account_id: null, flow_kind_extern: 'anlage' }, ['a']), true)
  // normale Zeile bleibt
  assert.equal(effektiverFlowKind({ ...z, flow_kind: 'anlage' }, ['a']), 'anlage')
})
