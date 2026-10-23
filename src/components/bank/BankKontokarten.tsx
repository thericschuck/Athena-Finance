import type { BankAbschnittProps } from '@/lib/bank/typen'
import { normIban } from '@/lib/bank/scope'
import { addTage, saldoReihe, tageZwischen, tagesWerte, saldoAm } from '@/lib/bank/verlauf'
import { fmtDate } from '@/lib/format'
import { BankKontokartenListe, type Kontokarte } from './BankKontokartenListe'

const SPARK_TAGE = 90
const DELTA_TAGE = 30

/**
 * Kontokarten mit Sparkline (90 Tage) und 30-Tage-Veraenderung.
 *
 * Server-Komponente mit Absicht: die Rekonstruktion braucht ALLE Buchungen (bis 5.000), die
 * Karten brauchen aber nur ~90 Zahlen je Konto. Rechnete die Client-Komponente selbst, muesste
 * die ganze Buchungsliste ueber die Server/Client-Grenze serialisiert werden. So gehen nur die
 * fertigen Reihen in den Browser; die Klick-Logik (URL-Filter) steckt in `BankKontokartenListe`.
 *
 * Die Karten zeigen immer ALLE Konten — auch bei gewaehltem Konto, sonst gaebe es keinen Weg zu
 * einem anderen Konto — und ignorieren deshalb `scope`.
 */
export function BankKontokarten({ daten }: BankAbschnittProps) {
  if (daten.balances.length === 0) return null

  const tage = tageZwischen(addTage(daten.heute, -(SPARK_TAGE - 1)), daten.heute)
  const deltaTag = addTage(daten.heute, -DELTA_TAGE)

  // Buchungen einmal je IBAN gruppieren statt je Konto die ganze Liste zu filtern.
  const jeIban = new Map<string, typeof daten.transactions>()
  for (const t of daten.transactions) {
    const k = normIban(t.account_iban)
    const liste = jeIban.get(k)
    if (liste) liste.push(t)
    else jeIban.set(k, [t])
  }

  const karten: Kontokarte[] = daten.balances.map(b => {
    const reihe = saldoReihe(jeIban.get(normIban(b.account_iban)) ?? [], b.booked_balance, daten.heute)
    return {
      iban: b.account_iban,
      name: b.account_name ?? b.account_iban,
      accountId: b.account_id ?? null,
      gebucht: b.booked_balance,
      verfuegbar: b.available_balance,
      stand: fmtDate(b.fetched_at, daten.dateFormat),
      verlauf: tagesWerte(reihe, tage),
      delta30: b.booked_balance - saldoAm(reihe, deltaTag),
    }
  })

  // „Alle Konten": die Summe der Einzelreihen, Tag fuer Tag.
  const summeVerlauf = tage.map((_, i) => karten.reduce((s, k) => s + k.verlauf[i], 0))
  const summe: Kontokarte = {
    iban: '',
    name: 'Alle Konten',
    accountId: null,
    gebucht: karten.reduce((s, k) => s + k.gebucht, 0),
    verfuegbar: null,
    stand: null,
    verlauf: summeVerlauf,
    delta30: karten.reduce((s, k) => s + k.delta30, 0),
  }

  return <BankKontokartenListe karten={karten} summe={summe} locale={daten.locale} />
}
