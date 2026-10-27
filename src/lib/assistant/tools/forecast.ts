import { tool } from 'ai'
import { z } from 'zod'
import { ladePrognose } from '@/lib/forecast/laden'
import { ymd } from '@/lib/period'
import type { DB } from '@/lib/assistant/tools/shared'
import type { ScopeContext } from '@/lib/haushalt/scope'

export function buildForecastTools(supabase: DB, ctx: ScopeContext) {
  return {
    // ── Prognose (nur lesend) ────────────────────────────────────────────────────
    getForecast: tool({
      description:
        'Die Prognose für die nächsten Monate: Liquidität (Girokonten, Sparkonten, Bargeld) und Nettovermögen ' +
        'Monat für Monat, der tiefste Stand samt Datum, bekannte Abbuchungstermine und die Steuerprognose für ' +
        'das laufende und das nächste Jahr (Gewinn, Gesamtsteuer, Mehrsteuer durch die Annahmen, ' +
        'Rücklage pro Monat, Kleinunternehmer-Status). Benutze es für Fragen wie "reicht mein Geld bis ' +
        'Dezember", "was bleibt mir im Februar", "was kostet mich das höhere Gehalt an Steuer", "wann wird es eng". ' +
        'Es ist eine FORTSCHREIBUNG der gesamten Historie (Zyklusmodell: Monats- und Wochenrhythmus) plus die Annahmen, ' +
        'die Eric auf der Prognose-Seite eingetragen hat — keine Vorhersage. Sag das, nenne den tiefsten Stand ' +
        '(erwartet und in 1 von 10 Verläufen) statt eines einzelnen Endwerts, ' +
        'und nenne die Annahmen (`annahmen`), auf denen die Zahl beruht. Die Steuerzahlen sind Schätzungen.',
      inputSchema: z.object({
        monate: z.number().int().min(1).max(24).default(12).describe('Wie viele Monate vorausgeschaut wird, inklusive des laufenden.'),
      }),
      execute: async ({ monate }) => {
        try {
          const d = await ladePrognose(supabase, ctx.userId, ymd(new Date()), { monate })
          const sz = d.szenario
          return {
            stand: d.stand,
            tiefpunkt: sz.tiefpunkt,
            tiefpunkt_in_1_von_10_verlaeufen: sz.risikoTiefpunkt,
            vom_lernen_ausgenommene_buchungen: d.ausgeschlossen,
            modell: {
              gelernt_aus_tagen: sz.modell.daten.tage,
              halbwertszeit_tage: sz.modell.halbwertszeit,
              rueckblick_test: sz.modell.backtest
                ? { fehler_modell: sz.modell.backtest.fehlerModell, fehler_flach: sz.modell.backtest.fehlerFlach, verbesserung_prozent: sz.modell.backtest.verbesserungPct }
                : null,
              muster: sz.modell.muster,
              zyklen_tage: sz.modell.zyklen,
            },
            monate: sz.monate.map(m => ({
              monat: m.month,
              einnahmen: m.einnahmen,
              ausgaben: m.ausgaben,
              liquiditaet_ende: m.liquiditaetEnde,
              tiefster_stand: m.tiefpunkt,
              vermoegen_ende: m.vermoegenEnde,
              nur_resttage: m.teilmonat,
            })),
            ohne_annahmen_liquiditaet_ende: d.basis.monate.map(m => ({ monat: m.month, liquiditaet_ende: m.liquiditaetEnde })),
            basis_pro_monat: sz.basis,
            bekannte_termine: sz.termine.slice(0, 12),
            annahmen: d.annahmen.map(a => ({
              bezeichnung: a.label, art: a.art, von: a.von, bis: a.bis, betrag_pro_monat: a.betrag, brutto_pro_monat: a.brutto,
            })),
            steuer: d.steuer.map(s => ({
              jahr: s.jahr,
              gewinn: s.szenario.hochrechnung.gewinn,
              lohn_netto: s.szenario.hochrechnung.lohnNetto,
              lohn_brutto: s.szenario.hochrechnung.lohnBrutto,
              einkommensteuer_gesamt: s.szenario.position.steuer.gesamt,
              mehrsteuer_durch_annahmen: s.mehrsteuer,
              steuer_auf_den_gewinn: s.szenario.position.gewinn_kostet.steuer,
              ruecklage: s.ruecklage,
              kleinunternehmer: s.szenario.position.kleinunternehmer,
              warnungen: s.szenario.position.warnungen,
            })),
            warnungen: [...d.hinweise, ...sz.warnungen],
            hinweis_zur_deutung:
              'Fortschreibung des Medians der letzten Monate, keine Vorhersage. Liquidität zählt auch Einzahlungen ' +
              'in Anlagen als Abfluss; das Nettovermögen nicht. Steuerzahlen sind Schätzungen, kein Steuerbescheid.',
          }
        } catch (fehler) {
          return { error: fehler instanceof Error ? fehler.message : 'Die Prognose konnte nicht berechnet werden.' }
        }
      },
    }),
  }
}
