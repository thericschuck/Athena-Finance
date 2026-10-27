import { tool } from 'ai'
import { z } from 'zod'
import { ladeSteuerdaten } from '@/lib/tax/laden'
import { berechneSteuerposition } from '@/lib/tax/position'
import { berechneEuer } from '@/lib/tax/euer'
import { untrust, type DB } from '@/lib/assistant/tools/shared'
import type { ScopeContext } from '@/lib/haushalt/scope'

export function buildTaxTools(supabase: DB, ctx: ScopeContext) {
  return {
    // ── Steuerposition ───────────────────────────────────────────────────────
    getTaxPosition: tool({
      description:
        'Die Steuerposition eines Jahres: Betriebseinnahmen und -ausgaben aus Schuck Webdesign, Gewinn, ' +
        'geschätztes zu versteuerndes Einkommen, Einkommensteuer nach § 32a EStG, der GRENZSTEUERSATZ auf ' +
        'den nächsten Euro, was von einem 1.000-€-Auftrag netto bleibt, der Abstand zu den ' +
        'Kleinunternehmergrenzen und das Soll der Steuerrücklage. ' +
        'Benutze das für jede Frage nach Steuer, Rücklage, "was bleibt mir von", "lohnt sich der Auftrag" ' +
        'und für jede Empfehlung auf der Einnahmenseite — NICHT den pauschalen tax_pct aus getBudget. ' +
        'Wichtig: die absolute Steuerlast ist eine Schätzung (siehe `quelle` je Zahl und `warnungen`), ' +
        'der Grenzsteuersatz ist die belastbare Zahl.',
      inputSchema: z.object({
        jahr: z.number().int().min(2020).max(2100).default(new Date().getFullYear())
          .describe('Veranlagungsjahr. Ohne Angabe das laufende Jahr.'),
      }),
      execute: async ({ jahr }) => {
        try {
          const { eingaben, rollen, ruecklageZiel, krypto, kryptoFehler } = await ladeSteuerdaten(supabase, ctx.userId, jahr)
          const position = berechneSteuerposition(eingaben)
          return {
            ...position,
            kategorie_zuordnung: rollen,
            ruecklage_sparziel: ruecklageZiel,
            // Krypto (§ 23 EStG, nur Kraken): Saldo, was zu versteuern ist und was NICHT berechnet werden konnte.
            krypto_veraeusserungen: krypto
              ? {
                  saldo_steuerpflichtig: krypto.ergebnis.saldoSteuerpflichtigEur,
                  zu_versteuern: krypto.ergebnis.zuVersteuernEur,
                  steuerfreier_gewinn: krypto.ergebnis.steuerfreierGewinnEur,
                  freigrenze: krypto.freigrenzeEur,
                  warnungen: krypto.warnungen,
                }
              : { fehler: kryptoFehler ?? 'nicht geladen' },
            hinweis_zur_deutung:
              'Alles unter `steuer` und `zve` ist geschätzt — die Vorsorgeaufwendungen kennt die App ' +
              'nicht genau. Der Grenzsteuersatz ist robust, weil ihn Abzüge nur verschieben, wenn sie ' +
              'eine Zonengrenze überschreiten. Sag beides so, statt eine geschätzte Jahressteuer als ' +
              'Fakt zu nennen. Fehlt ein Rücklage-Sparziel, schlag es mit createSavingsGoal vor ' +
              '("Steuerrücklage <Jahr>", Zielbetrag = ruecklage.soll) — Eric bestätigt das mit einem Klick.',
          }
        } catch (fehler) {
          // Der Lader wirft bei fehlendem Tarif oder Datenbankfehlern. Lieber
          // eine klare Meldung als eine Steuerzahl aus halben Daten.
          return { error: fehler instanceof Error ? fehler.message : 'Steuerposition nicht berechenbar.' }
        }
      },
    }),

    // ── Anlage EÜR ───────────────────────────────────────────────────────────
    getEuerPosition: tool({
      description:
        'Die Anlage EÜR eines Jahres, fertig auf Formularzeilen verteilt: je Zeile die Nummer, die ' +
        'amtliche Bezeichnung, der Betrag und die Anzahl der Buchungen dahinter, dazu die Summen und ' +
        'der Gewinn in der Ergebniszeile. Benutze das für Fragen nach der Steuererklärung, der EÜR, ' +
        '"was muss ich in Elster eintragen" und "welche Ausgaben sind wo gelandet". ' +
        'Für den Grenzsteuersatz und die Rücklage bleibt getTaxPosition zuständig — der Gewinn ist in ' +
        'beiden derselbe. Die Zeilennummern verschieben sich jährlich; `zeilen_jahr` sagt, welcher ' +
        'Jahrgang benutzt wurde.',
      inputSchema: z.object({
        jahr: z.number().int().min(2020).max(2100).default(new Date().getFullYear())
          .describe('Veranlagungsjahr. Ohne Angabe das laufende Jahr.'),
      }),
      execute: async ({ jahr }) => {
        try {
          const daten = await ladeSteuerdaten(supabase, ctx.userId, jahr)
          const e = berechneEuer({ jahr, ...daten.euer })

          // Die Einzelbuchungen tragen Freitext von der Bank. Für Athena
          // zählt ohnehin die Zeile, nicht die einzelne Zeile Verwendungszweck
          // — deshalb nur Anzahl und Summe, und der Text als untrusted.
          const zeileFuerModell = (z: (typeof e.einnahmen)[number]) => ({
            zeile: z.zeile,
            bezeichnung: z.bezeichnung,
            betrag: z.betrag,
            anzahl_buchungen: z.buchungen.length,
            beispiele: z.buchungen.slice(0, 3).map(b =>
              untrust(
                { datum: b.datum, betrag: Math.abs(b.betrag), kategorie: b.kategorie, beschreibung: b.beschreibung },
                ['beschreibung'],
              ),
            ),
          })

          return {
            jahr: e.jahr,
            zeilen_jahr: e.zeilen_jahr,
            einnahmen: e.einnahmen.map(zeileFuerModell),
            ausgaben: e.ausgaben.map(zeileFuerModell),
            summe_einnahmen: e.summe_einnahmen,
            summe_ausgaben: e.summe_ausgaben,
            ergebnis: e.ergebnis,
            in_sammelzeile: e.in_sammelzeile,
            warnungen: e.warnungen,
            hinweis_zur_deutung:
              'Die Beträge sind aus den Buchungen gerechnet, nicht geschätzt — anders als die ' +
              'Steuerlast in getTaxPosition. Unsicher sind nur die ZEILENNUMMERN, wenn ' +
              'zeilen_jahr vom angefragten Jahr abweicht. Was in `in_sammelzeile` steht, ist ' +
              'rechnerisch richtig, im Formular aber grob zusammengefasst; dort hilft eine ' +
              'eigene EÜR-Zeile je Kategorie. Sag nie, die Erklärung sei damit abgegeben — ' +
              'die Zahlen müssen in Mein ELSTER übertragen werden.',
          }
        } catch (fehler) {
          return { error: fehler instanceof Error ? fehler.message : 'EÜR nicht berechenbar.' }
        }
      },
    }),

  }
}
