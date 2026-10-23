import { fmtCurrency, fmtDate } from '@/lib/format'
import { berechneKennzahlen, parteiName, veraenderungProzent } from '@/lib/bank/auswertung'
import type { BankAbschnittProps } from '@/lib/bank/typen'
import type { BankTransaction } from '@/types/bank'

/**
 * Kachelleiste fuer den gewaehlten Zeitraum / das Konto / den Monat.
 *
 * Server-Komponente ohne Zustand: alles kommt aus `berechneKennzahlen` (lib/bank/auswertung.ts).
 * Einnahmen, Ausgaben, Saldo und Sparquote kommen aus den Flows (View `monthly_flows`, damit sie
 * mit Dashboard und Analyse uebereinstimmen und der Schalter Anlage/Forderung wirkt); groesste
 * Einzelbuchungen und die Anzahl kommen aus den Rohbuchungen ohne Umbuchungen.
 */

type Ton = 'gut' | 'schlecht'

function Delta({ aktuell, vorher, steigtIstGut, laufend }: {
  aktuell: number; vorher: number; steigtIstGut: boolean; laufend: boolean
}) {
  const p = veraenderungProzent(aktuell, vorher)
  if (p === null) return null
  const rund = Math.round(p)
  const ton: Ton | null = rund === 0 ? null : (rund > 0) === steigtIstGut ? 'gut' : 'schlecht'
  return (
    <span
      className={`text-[11px] font-medium tabular-nums ${
        ton === 'gut' ? 'text-success' : ton === 'schlecht' ? 'text-danger' : 'text-muted-foreground'
      }`}
      // Im laufenden Monat vergleicht ein unvollstaendiger Zeitraum mit einem vollstaendigen.
      title={laufend ? 'Der laufende Monat ist noch nicht abgeschlossen — der Vergleich ist daher zu niedrig.' : undefined}
    >
      {rund > 0 ? '+' : rund < 0 ? '−' : ''}{Math.abs(rund)} % ggü. Vorperiode{laufend ? '*' : ''}
    </span>
  )
}

function Kachel({ titel, wert, unter, ton }: {
  titel: string
  wert: string
  unter?: React.ReactNode
  ton?: 'success' | 'danger'
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{titel}</p>
      <p className={`mt-1 truncate text-xl font-semibold tabular-nums tracking-tight ${
        ton === 'success' ? 'text-success' : ton === 'danger' ? 'text-danger' : ''
      }`}>
        {wert}
      </p>
      {unter && <div className="mt-0.5 min-h-4 truncate text-[11px] text-muted-foreground">{unter}</div>}
    </div>
  )
}

export function BankKennzahlen({ daten, scope }: BankAbschnittProps) {
  const k = berechneKennzahlen(daten, scope)
  const euro = (n: number, nachkomma = 0) =>
    fmtCurrency(n, 'EUR', daten.locale, { fractionDigits: nachkomma })
  const vor = k.vorperiode

  const einzel = (t: BankTransaction | null) =>
    t ? (
      <span title={`${parteiName(t)} · ${fmtDate(t.value_date, daten.dateFormat)}`}>
        {parteiName(t)} · {fmtDate(t.value_date, daten.dateFormat)}
      </span>
    ) : null

  const hatFlows = scope.flows.length > 0

  return (
    <section aria-label="Kennzahlen" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      <Kachel
        titel={daten.konto ? 'Saldo Konto' : 'Gesamtsaldo'}
        wert={k.saldo === null ? '—' : euro(k.saldo)}
        unter={daten.konto ? 'gewähltes Konto' : `${daten.balances.length} Konten`}
      />
      <Kachel
        titel="Einnahmen"
        wert={hatFlows ? euro(k.einnahmen) : '—'}
        unter={vor && <Delta aktuell={k.einnahmen} vorher={vor.einnahmen} steigtIstGut laufend={vor.laufenderMonat} />}
      />
      <Kachel
        titel="Ausgaben"
        wert={hatFlows ? euro(k.ausgaben) : '—'}
        unter={vor && <Delta aktuell={k.ausgaben} vorher={vor.ausgaben} steigtIstGut={false} laufend={vor.laufenderMonat} />}
      />
      <Kachel
        titel="Saldo Zeitraum"
        wert={hatFlows ? `${k.netto > 0 ? '+' : k.netto < 0 ? '−' : ''}${euro(Math.abs(k.netto))}` : '—'}
        ton={!hatFlows || k.netto === 0 ? undefined : k.netto > 0 ? 'success' : 'danger'}
        unter="Einnahmen − Ausgaben"
      />
      <Kachel
        titel="Sparquote"
        wert={k.sparquote === null ? '—' : `${k.sparquote} %`}
        ton={k.sparquote === null ? undefined : k.sparquote >= 0 ? 'success' : 'danger'}
        // Rechnet nur auf Konsum: Geld, das in Anlagen fliesst, ist Sparen (siehe flow-calc).
        unter={k.sparquote === null ? 'keine Einnahmen' : 'nur Konsum'}
      />
      <Kachel
        titel="Ø Ausgaben / Tag"
        wert={k.ausgabenProTag === null || !hatFlows ? '—' : euro(k.ausgabenProTag)}
        unter={k.tage > 0 ? `über ${k.tage} ${k.tage === 1 ? 'Tag' : 'Tage'}` : undefined}
      />
      <Kachel
        titel="Größte Ausgabe"
        wert={k.groessteAusgabe ? euro(-k.groessteAusgabe.amount) : '—'}
        unter={einzel(k.groessteAusgabe)}
      />
      <Kachel
        titel="Größte Einnahme"
        wert={k.groessteEinnahme ? euro(k.groessteEinnahme.amount) : '—'}
        unter={einzel(k.groessteEinnahme)}
      />
      <Kachel
        titel="Buchungen"
        wert={String(k.anzahl)}
        unter="ohne Umbuchungen"
      />
    </section>
  )
}
