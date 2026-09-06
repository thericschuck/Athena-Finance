import { eur } from './tarif.ts'

/**
 * Fuellt die Zeilen der Anlage EUER aus den Buchungen eines Jahres.
 *
 * Reine Funktion, keine Datenbank -- damit sie testbar bleibt und damit es nur
 * EINE Stelle gibt, die entscheidet, in welche Formularzeile eine Buchung
 * gehoert. Die Zeilendefinitionen kommen aus `euer_zeilen`, die Zuordnung je
 * Kategorie aus `categories.euer_zeile` (vererbt, siehe rollen.ts).
 *
 * Der Gewinn, der hier in der Ergebniszeile steht, MUSS derselbe sein wie der
 * aus `berechneSteuerposition`. Beides rechnet aus denselben Buchungen; laufen
 * die Zahlen auseinander, ist eine von beiden falsch und niemand weiss welche.
 * Ein Test haelt das fest.
 */

export type EuerArt = 'einnahme' | 'ausgabe' | 'summe' | 'ergebnis'

export type EuerZeileDef = {
  jahr: number
  zeile: number
  bezeichnung: string
  art: EuerArt
  sammelzeile: boolean
  quelle: string
  geprueft_am: string
}

export type EuerBuchung = {
  datum: string
  /** Vorzeichenbehaftet, wie in unified_transactions. */
  betrag: number
  kategorie_id: string | null
  kategorie: string
  beschreibung: string | null
}

export type EuerEingaben = {
  /** Das angefragte Jahr. */
  jahr: number
  /** Die Zeilendefinitionen -- nicht zwingend die des angefragten Jahres. */
  zeilen: EuerZeileDef[]
  buchungen: EuerBuchung[]
  /** Kategorie-ID -> steuerliche Rolle, vererbt. */
  rollen: Map<string, string | null>
  /** Kategorie-ID -> EUER-Zeile, vererbt. */
  euerZeilen: Map<string, number | null>
}

export type EuerZeileErgebnis = {
  zeile: number
  bezeichnung: string
  art: EuerArt
  /** Immer positiv -- so wird es ins Formular eingetragen. */
  betrag: number
  buchungen: EuerBuchung[]
}

export type EuerErgebnis = {
  jahr: number
  zeilen_jahr: number
  einnahmen: EuerZeileErgebnis[]
  ausgaben: EuerZeileErgebnis[]
  summe_einnahmen: { zeile: number; bezeichnung: string; betrag: number } | null
  summe_ausgaben: { zeile: number; bezeichnung: string; betrag: number } | null
  ergebnis: { zeile: number; bezeichnung: string; betrag: number } | null
  /** Was in einer Sammelzeile gelandet ist, weil die Kategorie keine eigene hat. */
  in_sammelzeile: { kategorie: string; betrag: number; zeile: number }[]
  warnungen: string[]
}

export function berechneEuer(e: EuerEingaben): EuerErgebnis {
  const warnungen: string[] = []

  const zeilenJahr = e.zeilen.length > 0 ? e.zeilen[0].jahr : e.jahr
  if (e.zeilen.length === 0) {
    warnungen.push(
      'Es sind keine EUER-Zeilen hinterlegt. Ohne die Zeilendefinitionen laesst sich das ' +
      'Formular nicht fuellen.',
    )
  } else if (zeilenJahr !== e.jahr) {
    warnungen.push(
      `Fuer ${e.jahr} sind keine EUER-Zeilen hinterlegt. Verwendet wurden die von ${zeilenJahr}. ` +
      'Die Nummern verschieben sich jaehrlich -- vor dem Abtippen gegen das amtliche Formular pruefen.',
    )
  }

  const einnahmeDefs = e.zeilen.filter(z => z.art === 'einnahme').sort((a, b) => a.zeile - b.zeile)
  const ausgabeDefs  = e.zeilen.filter(z => z.art === 'ausgabe').sort((a, b) => a.zeile - b.zeile)
  const summeDefs    = e.zeilen.filter(z => z.art === 'summe').sort((a, b) => a.zeile - b.zeile)
  const ergebnisDef  = e.zeilen.find(z => z.art === 'ergebnis') ?? null

  const sammelEinnahme = einnahmeDefs.find(z => z.sammelzeile) ?? null
  const sammelAusgabe  = ausgabeDefs.find(z => z.sammelzeile) ?? null

  // Eimer je Zeilennummer.
  const eimer = new Map<number, EuerZeileErgebnis>()
  for (const def of [...einnahmeDefs, ...ausgabeDefs]) {
    eimer.set(def.zeile, {
      zeile: def.zeile,
      bezeichnung: def.bezeichnung,
      art: def.art,
      betrag: 0,
      buchungen: [],
    })
  }

  const sammelSummen = new Map<string, { kategorie: string; betrag: number; zeile: number }>()

  for (const b of e.buchungen) {
    const rolle = b.kategorie_id ? e.rollen.get(b.kategorie_id) ?? null : null
    if (rolle !== 'betriebseinnahme' && rolle !== 'betriebsausgabe') continue

    const art: EuerArt = rolle === 'betriebseinnahme' ? 'einnahme' : 'ausgabe'
    const defs = art === 'einnahme' ? einnahmeDefs : ausgabeDefs
    const sammel = art === 'einnahme' ? sammelEinnahme : sammelAusgabe

    // Gewuenschte Zeile -- aber nur, wenn sie fuer diese Art ueberhaupt
    // existiert. Eine Ausgabenkategorie, die auf eine Einnahmenzeile zeigt,
    // ist ein Konfigurationsfehler und darf nicht dorthin fliessen.
    const gewuenscht = b.kategorie_id ? e.euerZeilen.get(b.kategorie_id) ?? null : null
    const treffer = gewuenscht !== null ? defs.find(z => z.zeile === gewuenscht) ?? null : null

    const ziel = treffer ?? sammel
    if (!ziel) {
      warnungen.push(
        `Fuer ${b.kategorie} gibt es keine passende EUER-Zeile und keine Sammelzeile der Art ` +
        `"${art}". Der Betrag faellt aus dem Formular heraus.`,
      )
      continue
    }

    if (!treffer) {
      const schluessel = `${b.kategorie}|${ziel.zeile}`
      const vorhanden = sammelSummen.get(schluessel)
      // Ausgaben werden positiv gefuehrt, wie im Formular.
      const betragPositiv = art === 'einnahme' ? b.betrag : -b.betrag
      if (vorhanden) {
        vorhanden.betrag = eur(vorhanden.betrag + betragPositiv)
      } else {
        sammelSummen.set(schluessel, {
          kategorie: b.kategorie,
          betrag: eur(betragPositiv),
          zeile: ziel.zeile,
        })
      }
    }

    const topf = eimer.get(ziel.zeile)
    if (!topf) continue
    topf.betrag = eur(topf.betrag + (art === 'einnahme' ? b.betrag : -b.betrag))
    topf.buchungen.push(b)
  }

  // Nur Zeilen mit Inhalt ausgeben -- ein Formular mit 40 Nullzeilen ist
  // unlesbar, und abgetippt wird ohnehin nur, wo etwas steht.
  const mitInhalt = (z: EuerZeileErgebnis) => z.buchungen.length > 0
  const einnahmen = einnahmeDefs.map(d => eimer.get(d.zeile)!).filter(mitInhalt)
  const ausgaben  = ausgabeDefs.map(d => eimer.get(d.zeile)!).filter(mitInhalt)

  const summeEinnahmen = eur(einnahmen.reduce((s, z) => s + z.betrag, 0))
  const summeAusgaben  = eur(ausgaben.reduce((s, z) => s + z.betrag, 0))

  // Welche der beiden Summenzeilen wozu gehoert, wird NICHT nach Reihenfolge
  // geraten, sondern geprueft: die Einnahmensumme muss hinter allen
  // Einnahmenzeilen und vor allen Ausgabenzeilen stehen. Passt das nicht,
  // bleiben die Summen leer und es gibt eine Warnung -- lieber keine Zahl als
  // eine in der falschen Zeile.
  let summeEinnahmenDef: EuerZeileDef | null = null
  let summeAusgabenDef: EuerZeileDef | null = null

  if (summeDefs.length === 2 && einnahmeDefs.length > 0 && ausgabeDefs.length > 0) {
    const letzteEinnahme = einnahmeDefs[einnahmeDefs.length - 1].zeile
    const ersteAusgabe   = ausgabeDefs[0].zeile
    const letzteAusgabe  = ausgabeDefs[ausgabeDefs.length - 1].zeile
    const [a, b] = summeDefs

    if (a.zeile > letzteEinnahme && a.zeile < ersteAusgabe && b.zeile > letzteAusgabe) {
      summeEinnahmenDef = a
      summeAusgabenDef = b
    }
  }

  if (!summeEinnahmenDef || !summeAusgabenDef) {
    if (e.zeilen.length > 0) {
      warnungen.push(
        'Die Summenzeilen liessen sich nicht eindeutig zuordnen. Erwartet werden genau zwei ' +
        'Zeilen der Art "summe": eine hinter den Einnahmen, eine hinter den Ausgaben.',
      )
    }
  }

  const ergebnisBetrag = eur(summeEinnahmen - summeAusgaben)

  const inSammelzeile = Array.from(sammelSummen.values()).sort((a, b) => b.betrag - a.betrag)
  if (inSammelzeile.length > 0) {
    const summe = eur(inSammelzeile.reduce((s, x) => s + x.betrag, 0))
    warnungen.push(
      `${summe} EUR aus ${inSammelzeile.length} Kategorie(n) sind in einer Sammelzeile gelandet, ` +
      'weil keine eigene EUER-Zeile gesetzt ist. Rechnerisch richtig, aber im Formular grob -- ' +
      'wer es genau haben will, setzt die Zeile je Kategorie.',
    )
  }

  return {
    jahr: e.jahr,
    zeilen_jahr: zeilenJahr,
    einnahmen,
    ausgaben,
    summe_einnahmen: summeEinnahmenDef
      ? { zeile: summeEinnahmenDef.zeile, bezeichnung: summeEinnahmenDef.bezeichnung, betrag: summeEinnahmen }
      : null,
    summe_ausgaben: summeAusgabenDef
      ? { zeile: summeAusgabenDef.zeile, bezeichnung: summeAusgabenDef.bezeichnung, betrag: summeAusgaben }
      : null,
    ergebnis: ergebnisDef
      ? { zeile: ergebnisDef.zeile, bezeichnung: ergebnisDef.bezeichnung, betrag: ergebnisBetrag }
      : null,
    in_sammelzeile: inSammelzeile,
    warnungen,
  }
}
