import { requireAuthUser } from '@/lib/supabase/server'
import { fmtCurrency } from '@/lib/format'
import { normIban } from '@/lib/bank/scope'
import { berechneFesteKosten } from '@/lib/bank/feste-kosten'
import type { BankAbschnittProps } from '@/lib/bank/typen'
import { BankFesteKostenListe } from '@/components/bank/BankFesteKostenListe'

/**
 * Feste Kosten & Abos: die wiederkehrenden Ausgaben aus ALLEN Bankbuchungen (nicht nur dem
 * gewaehlten Zeitraum — eine Serie erkennt man erst an der Wiederholung), ohne Umbuchungen
 * zwischen eigenen Konten. Die Erkennung ist dieselbe wie bei den Vertragsvorschlaegen
 * (lib/finance/wiederkehrend.ts); hier kommt dazu, was auf der Bankseite interessiert: Monatsaequivalent,
 * Preisaenderung und ausgebliebene Abbuchung.
 *
 * Async Server-Komponente, die die Vertraege selbst laedt: die Seite reicht nur `{ daten, scope }`
 * und keinen Supabase-Client weiter, und Zeitraum/Konto/Monat sollen diesen Abschnitt bewusst NICHT
 * beschraenken (eine feste Kostenzeile ist unabhaengig davon, welchen Monat man gerade betrachtet).
 * `requireAuthUser` ist pro Request zwischengespeichert, kostet also keinen zweiten Auth-Aufruf.
 */
export async function BankFesteKosten({ daten }: BankAbschnittProps) {
  const { supabase, user } = await requireAuthUser()
  const { data: vertraegeRoh, error } = await supabase
    .from('contracts')
    .select('name, amount, is_active')
    .eq('user_id', user.id)
  // Ohne Vertragsliste wuerde jede Zeile als „ohne Vertrag" erscheinen und zum Doppelanlegen einladen:
  // dann lieber nichts behaupten.
  if (error) {
    return (
      <section className="rounded-lg border border-border bg-card p-4" aria-labelledby="feste-kosten-titel">
        <h2 id="feste-kosten-titel" className="text-sm font-semibold">Feste Kosten &amp; Abos</h2>
        <p className="mt-2 text-sm text-muted-foreground">Die Verträge konnten nicht geladen werden, daher fehlt der Abgleich.</p>
      </section>
    )
  }

  const kontoIds = new Map<string, string>()
  for (const b of daten.balances) if (b.account_id) kontoIds.set(normIban(b.account_iban), b.account_id)

  const ergebnis = berechneFesteKosten(
    { transactions: daten.transactions, categories: daten.categories, kontoIds, eigeneIbans: daten.eigeneIbans, heute: daten.heute },
    (vertraegeRoh ?? []).map(v => ({ name: v.name, betrag: Number(v.amount), aktiv: v.is_active !== false })),
  )

  const eur = (n: number, stellen = 0) => fmtCurrency(n, 'EUR', daten.locale, { fractionDigits: stellen })

  return (
    <section className="rounded-lg border border-border bg-card" aria-labelledby="feste-kosten-titel">
      <div className="border-b border-border px-4 py-3">
        <h2 id="feste-kosten-titel" className="text-sm font-semibold">Feste Kosten &amp; Abos</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Aus der gesamten Bankhistorie erkannt, ohne Umbuchungen zwischen eigenen Konten.
        </p>
        {ergebnis.anzahl > 0 && (
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="text-xl font-semibold tabular-nums">{eur(ergebnis.summeProMonat)}</span>
            <span className="text-muted-foreground">
              pro Monat · {ergebnis.anzahl} Posten
              {ergebnis.ohneVertrag > 0 && <> · {ergebnis.ohneVertrag} ohne Vertrag</>}
            </span>
          </p>
        )}
      </div>

      {ergebnis.anzahl === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          Keine wiederkehrenden Ausgaben erkannt (mindestens drei Buchungen im festen Rhythmus nötig).
        </p>
      ) : (
        <BankFesteKostenListe posten={ergebnis.posten} locale={daten.locale} dateFormat={daten.dateFormat} />
      )}
    </section>
  )
}
