// Reproduzierbarer Vergleich der Prognose in den Ansichten ich / partner / gemeinsam, vorher (alt) und nachher (neu).
// Aufruf: node --experimental-strip-types scripts/prognose-scopes.mjs
// Eingaben: src/lib/forecast/scope-fixture.ts (aggregierte Monatswerte, nur Zahlen).
import { laufFuer, verlaufsZeile, HEUTE } from '../src/lib/forecast/scope-fixture.ts'

const f = n => String(Math.round(n)).padStart(7)
console.log(`Prognose je Ansicht, Stand ${HEUTE} (Liquiditaet am Monatsende +1/+3/+6/+12 | Vermoegen +1/+3/+6/+12)`)
console.log('Scope      Lauf  Lernbeginn  Tage  Start-Liq Start-Verm |   +1 Mon.  +3 Mon.  +6 Mon. +12 Mon. | Vermoegen +1 / +3 / +6 / +12')
for (const scope of ['ich', 'partner', 'gemeinsam']) {
  for (const neu of [false, true]) {
    const { prognose, historie } = laufFuer(scope, neu)
    const z = verlaufsZeile(prognose)
    console.log(
      `${scope.padEnd(10)} ${(neu ? 'neu' : 'alt').padEnd(5)} ${(historie.start ?? 'komplett').padEnd(11)} ${String(prognose.modell.daten.tage).padStart(4)} ` +
      `${f(z.start)}  ${f(z.startVermoegen)} | ${z.liq.map(f).join(' ')} | ${z.nw.map(f).join(' ')}` +
      (historie.zuWenigHistorie ? '  [zu wenig Historie]' : ''),
    )
  }
}
for (const neu of [false, true]) {
  const p = laufFuer('partner', neu).prognose
  console.log(`\nPartner (${neu ? 'neu' : 'alt'}), Basis pro Monat: Einnahmen ohne Lohn ${p.basis.einnahmenOhneLohn}, Ausgaben ${p.basis.ausgaben}, Saldo ${p.basis.saldo}`)
}
