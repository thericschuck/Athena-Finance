import type { BankTransaction, FinanceCategory } from '@/types/bank'
import {
  erkenneWiederkehrend, naechsterTermin, normalisiere,
  type BestehenderVertrag, type Frequenz, type Kandidat, type WiederkehrBuchung,
} from '../finance/wiederkehrend.ts'
import { vertragsEntwurf, vertragsName, proMonat, type Vertragsentwurf } from '../finance/vertragsvorschlag.ts'
import { extrahiereHaendler } from '../fints/merchant-key.ts'
import { normIban } from './scope.ts'
import { ibanSet, istUmbuchungIban } from '../haushalt/umbuchung.ts'

/**
 * Abschnitt „Feste Kosten & Abos" der Bankdaten-Seite: aus ALLEN Bankbuchungen (Wiederholung braucht
 * Historie, der Seitenzeitraum waere zu kurz) die wiederkehrenden Ausgaben, ihr Monatsaequivalent,
 * Preisaenderungen und ausgebliebene Abbuchungen. Rein und ohne Datenbank, damit es testbar ist.
 *
 * Die Erkennung selbst (Rhythmus, Mindestzahl Buchungen, Betragsstreuung) ist NICHT neu: sie kommt
 * unveraendert aus finance/wiederkehrend.ts, derselben Funktion, die auf der Vertragsseite die
 * Vorschlaege liefert. So zeigen beide Seiten dieselben Serien und keine zweite Wahrheit entsteht.
 */

/** Typen, die keine Kosten sind (Umbuchung, Sparplan, Bausparer) — wie bei den Vertragsvorschlaegen. */
const KEINE_KOSTEN = new Set(['transfer', 'savings_plan', 'building_savings'])

/** Ab welcher Abweichung des letzten Betrags vom Median der vorherigen ein Hinweis erscheint. */
export const PREIS_SCHWELLE = 0.03
/** Wie viele Tage ein erwarteter Termin zurueckliegen muss, bevor „noch nicht abgebucht?" erscheint. */
export const AUSBLEIB_TAGE = 7

export type Preisaenderung = {
  /** Median der vorherigen Betraege. */
  vorher: number
  /** Letzter gebuchter Betrag. */
  letzter: number
  /** Vorzeichenbehaftet, in Euro (letzter - vorher). */
  differenz: number
  teurer: boolean
}

export type FesterPosten = {
  schluessel: string
  /** Name wie auf der Vertragsseite (Kategorie-Name bei Abos, sonst Haendler/Gegenpartei). */
  name: string
  betrag: number
  betragVariabel: boolean
  betragMin: number
  betragMax: number
  frequenz: Frequenz
  tagImMonat: number | null
  anzahl: number
  letzteBuchung: string
  /** Naechster erwarteter Termin; null, wenn ausgeblieben (dann steht `erwartetSeit` da). */
  naechsteErwartet: string | null
  monatsaequivalent: number
  jahreskosten: number
  kategorieName: string | null
  ueberAbwickler: boolean
  hatVertrag: boolean
  preisaenderung: Preisaenderung | null
  /** Der erste erwartete Termin nach der letzten Buchung liegt mehr als 7 Tage zurueck. */
  ausgeblieben: { erwartetSeit: string; tage: number } | null
  begruendung: string
  /** Vorbelegung fuer „Als Vertrag anlegen" (dieselbe Form wie auf der Vertragsseite). */
  entwurf: Vertragsentwurf
}

export type FesteKosten = {
  posten: FesterPosten[]
  /** Summe der Monatsaequivalente ALLER erkannten Posten. */
  summeProMonat: number
  anzahl: number
  /** Davon ohne Vertrag. */
  ohneVertrag: number
}

export type FesteKostenEingabe = {
  transactions: BankTransaction[]
  categories: FinanceCategory[]
  /** IBAN -> account_id (aus den Salden), fuer die Kontoverknuepfung des Vertragsentwurfs. */
  kontoIds: Map<string, string>
  eigeneIbans: string[]
  heute: string
}

function median(werte: number[]): number {
  if (werte.length === 0) return 0
  const s = [...werte].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}

function tageZwischen(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

/** Gruppenschluessel wie in erkenneWiederkehrend (inkl. Richtungspraefix, so steht er auch in `Kandidat.schluessel`), damit sich die Buchungen einer Serie wiederfinden lassen. */
function gruppenSchluessel(b: WiederkehrBuchung): string {
  const haendler = extrahiereHaendler(b.beschreibung)
  const s = haendler ? normalisiere(haendler) || haendler : normalisiere(b.merchant ?? b.beschreibung)
  return `${b.betrag < 0 ? 'a' : 'e'}|${s}`
}

/**
 * Preisaenderung einer Serie: der LETZTE Betrag gegen den Median der (bis zu) drei davor — nicht
 * gegen alle vorherigen: nach einem Preissprung bliebe der Hinweis sonst stehen, bis mehr als die
 * Haelfte der Historie den neuen Preis hat (bei [10,10,10,12,12,12,12] noch drei Buchungen nach
 * dem Sprung). So meldet nur die Buchung, die den Sprung selbst ausloest. Nur bei festem Betrag
 * (bei nutzungsabhaengigen Abos ist Schwanken der Normalfall) und nur, wenn die Serie als Ganzes erkannt
 * wurde — bei einem Betrags-Cluster (andere Betraege desselben Haendlers zaehlen nicht mit) waere der
 * „letzte Betrag" der eines fremden Einkaufs.
 */
export function pruefePreisaenderung(betraege: number[]): Preisaenderung | null {
  if (betraege.length < 3) return null
  const letzter = betraege[betraege.length - 1]
  const vorher = median(betraege.slice(-4, -1))
  if (vorher <= 0) return null
  const abw = (letzter - vorher) / vorher
  if (Math.abs(abw) <= PREIS_SCHWELLE) return null
  return {
    vorher: Math.round(vorher * 100) / 100,
    letzter: Math.round(letzter * 100) / 100,
    differenz: Math.round((letzter - vorher) * 100) / 100,
    teurer: letzter > vorher,
  }
}

export function berechneFesteKosten(e: FesteKostenEingabe, vertraege: BestehenderVertrag[]): FesteKosten {
  const eigene = ibanSet(e.eigeneIbans)
  const katName = new Map(e.categories.map(c => [c.id, c]))
  const wurzel = (id: string | null): FinanceCategory | null => {
    let c = id ? katName.get(id) ?? null : null
    for (let i = 0; c?.parent_id && i < 5; i++) c = katName.get(c.parent_id) ?? c
    return c
  }

  const buchungen: WiederkehrBuchung[] = e.transactions
    // Nur Abbuchungen; Umbuchungen auf eigene Konten sind keine Kosten.
    .filter(t => t.amount < 0 && !istUmbuchungIban(t.counterpart_iban, eigene))
    .map(t => {
      const kat = t.category_id ? katName.get(t.category_id) ?? null : null
      return {
        id: t.id,
        datum: t.value_date.slice(0, 10),
        betrag: t.amount,
        beschreibung: t.description,
        merchant: t.counterpart_name,
        konto_id: e.kontoIds.get(normIban(t.account_iban)) ?? null,
        kategorie_id: t.category_id,
        kategorie_name: kat?.name ?? null,
        kategorie_wurzel: wurzel(t.category_id)?.name ?? null,
      }
    })

  const nachGruppe = new Map<string, WiederkehrBuchung[]>()
  for (const b of buchungen) {
    const k = gruppenSchluessel(b)
    const l = nachGruppe.get(k)
    if (l) l.push(b)
    else nachGruppe.set(k, [b])
  }

  const kandidaten = erkenneWiederkehrend(buchungen, vertraege, e.heute)
    .filter((k: Kandidat) => k.richtung === 'ausgabe' && k.laeuft_noch)

  const posten: FesterPosten[] = []
  for (const k of kandidaten) {
    const entwurf = vertragsEntwurf(k)
    if (KEINE_KOSTEN.has(entwurf.type)) continue

    const mitglieder = (nachGruppe.get(k.schluessel) ?? []).sort((a, b) => a.datum.localeCompare(b.datum))
    const ganzeSerie = mitglieder.length === k.anzahl
    const preisaenderung = !k.betrag_variabel && ganzeSerie
      ? pruefePreisaenderung(mitglieder.map(b => Math.abs(b.betrag)))
      : null

    // Erster erwarteter Termin NACH der letzten Buchung (nicht der fortgeschriebene aus naechster_erwartet,
    // der schon uebersprungene Termine ueberspringt).
    const erster = naechsterTermin(k.letzte_buchung, k.frequenz, k.median_abstand_tage, k.tag_im_monat, k.letzte_buchung).datum
    const tageZurueck = tageZwischen(erster, e.heute)
    const ausgeblieben = tageZurueck > AUSBLEIB_TAGE ? { erwartetSeit: erster, tage: tageZurueck } : null

    posten.push({
      schluessel: k.schluessel,
      name: vertragsName(k),
      betrag: k.betrag,
      betragVariabel: k.betrag_variabel,
      betragMin: k.betrag_min,
      betragMax: k.betrag_max,
      frequenz: k.frequenz,
      tagImMonat: k.tag_im_monat,
      anzahl: k.anzahl,
      letzteBuchung: k.letzte_buchung,
      naechsteErwartet: ausgeblieben ? null : k.naechste_erwartet,
      monatsaequivalent: Math.round(proMonat(k.betrag, k.frequenz) * 100) / 100,
      jahreskosten: k.jahreskosten,
      kategorieName: k.kategorie_name,
      ueberAbwickler: k.ueber_abwickler,
      hatVertrag: k.hat_vertrag,
      preisaenderung,
      ausgeblieben,
      begruendung: k.begruendung,
      entwurf,
    })
  }

  // Teuerste zuerst (Monatsaequivalent): daran entscheidet sich, was sich zu pruefen lohnt.
  posten.sort((a, b) => b.monatsaequivalent - a.monatsaequivalent)
  return {
    posten,
    summeProMonat: Math.round(posten.reduce((s, p) => s + p.monatsaequivalent, 0) * 100) / 100,
    anzahl: posten.length,
    ohneVertrag: posten.filter(p => !p.hatVertrag).length,
  }
}
