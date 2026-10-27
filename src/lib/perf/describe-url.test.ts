import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeUrl } from './describe-url.ts'

test('PostgREST-Aufruf: Tabelle, Filter nur als Spalte=Operator, keine Werte', () => {
  const d = describeUrl('https://x.supabase.co/rest/v1/accounts?select=id%2Cname&user_id=eq.1234-secret&is_active=eq.true&order=name.asc')
  assert.equal(d.target, 'rest/accounts')
  assert.equal(d.select, 'id,name')
  assert.equal(d.key, 'rest/accounts?is_active=eq&order=name.asc&user_id=eq')
  assert.ok(!d.key.includes('secret'))
})

test('Gleiche Abfrage mit anderen Werten ergibt denselben Schluessel (Duplikat-Erkennung)', () => {
  const a = describeUrl('https://x/rest/v1/contracts?select=*&user_id=eq.aaa')
  const b = describeUrl('https://x/rest/v1/contracts?select=*&user_id=eq.bbb')
  assert.equal(a.key, b.key)
})

test('RPC und Auth-Pfade bleiben erkennbar, ungueltige URL faellt nicht um', () => {
  assert.equal(describeUrl('https://x/rest/v1/rpc/net_worth_series').target, 'rest/rpc/net_worth_series')
  assert.equal(describeUrl('https://x/auth/v1/token?grant_type=refresh_token').target, 'auth/token')
  assert.equal(describeUrl('kaputt').target, 'unbekannt')
})
