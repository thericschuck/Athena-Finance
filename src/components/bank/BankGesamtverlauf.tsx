import type { BankAbschnittProps } from '@/lib/bank/typen'
import { normIban } from '@/lib/bank/scope'
import { ausduennen, gesamtVerlauf, verlaufKennzahlen } from '@/lib/bank/verlauf'
import { BankGesamtverlaufLazy } from './BankGesamtverlaufLazy'
import type { VerlaufDaten } from './BankGesamtverlaufChart'

/** Mehr Punkte zeichnet ein Flaechenchart nicht lesbarer, nur langsamer. */
const MAX_PUNKTE = 200

/**
 * Kontostandverlauf aller Konten zusammen als gestapelte Flaeche, eine Schicht je Konto.
 *
 * Gewaehltes Konto (`daten.konto`): es wird NUR dieses Konto gezeigt, nicht der Gesamtstapel mit
 * Hervorhebung. Begruendung: die Seite sagt ueber der Kontoauswahl „alles darunter gilt fuer
 * dieses Konto"; ein Chart, das weiter die Summe zeigt, widerspraeche dem. Die Kontext-Frage
 * „wie viel vom Ganzen ist das?" beantworten die Kontokarten mit der Summenkarte direkt darueber.
 * Dann stimmen auch Kopfzeile (Tief, Hoch, Tage im Minus) mit dem gewaehlten Konto ueberein.
 *
 * Server-Komponente: die Rekonstruktion braucht alle Buchungen, der Browser bekommt nur die
 * auf <= 200 Punkte ausgeduennte Reihe. Kennzahlen laufen vorher ueber die VOLLEN Tageswerte,
 * damit das Sampling keinen Tiefststand verschluckt.
 *
 * Datengrundlage: Buchungen rueckwaerts vom aktuellen gebuchten Saldo (siehe verlauf.ts).
 */
export function BankGesamtverlauf({ daten }: BankAbschnittProps) {
  const gewaehlt = daten.konto ? normIban(daten.konto) : null
  const balances = daten.balances.filter(b => !gewaehlt || normIban(b.account_iban) === gewaehlt)
  if (balances.length === 0) return null

  const jeIban = new Map<string, typeof daten.transactions>()
  for (const t of daten.transactions) {
    const k = normIban(t.account_iban)
    const liste = jeIban.get(k)
    if (liste) liste.push(t)
    else jeIban.set(k, [t])
  }

  // Groesste Konten zuerst = unterste Schicht. Ein Konto im Minus kommt so nicht unter die
  // Schichten, die darauf aufbauen.
  const konten = [...balances]
    .sort((a, b) => b.booked_balance - a.booked_balance)
    .map(b => ({
      key: b.account_iban,
      name: b.account_name ?? b.account_iban,
      saldo: b.booked_balance,
      buchungen: jeIban.get(normIban(b.account_iban)) ?? [],
    }))

  const tage = gesamtVerlauf(konten, daten.cutoff, daten.heute)
  const kennzahlen = verlaufKennzahlen(tage)
  if (!kennzahlen || tage.length < 2) return null

  const verlauf: VerlaufDaten = {
    schichten: konten.map(k => ({ name: k.name })),
    punkte: ausduennen(tage, MAX_PUNKTE),
    kennzahlen,
    titel: konten.length === 1 ? `Kontostand · ${konten[0].name}` : 'Kontostand aller Konten',
    locale: daten.locale,
  }

  return <BankGesamtverlaufLazy verlauf={verlauf} />
}
