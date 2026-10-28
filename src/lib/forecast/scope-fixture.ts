import { berechnePrognose, lerneModelle, type Prognose, type PrognoseEingaben, type PrognoseVertrag } from './cashflow.ts'
import { baueScopeHistorie, type ScopeBuchung, type ScopeHistorie } from './scope-historie.ts'
import type { ScopeKurz } from './scope-regeln.ts'

/**
 * Fixture aus AGGREGIERTEN Monatswerten (nur Zahlen, keine IBANs, Namen oder Beschreibungen) und die Pipeline, mit der
 * Test und Skript (scripts/prognose-scopes.mjs) die drei Ansichten vergleichen. Die Werte stammen aus den Monatssummen
 * der echten Daten (Stand 2026-10-28, gerundet): ein Girokonto seit April (Ausschnitt), ein geteiltes Konto seit 2026-07-15.
 */

export const HEUTE = '2026-10-28'
export const GIRO = 'konto-giro'
export const GETEILT = 'konto-geteilt'

type Monat = { m: string; aus: number; ein: number }

const GIRO_MONATE: Monat[] = [
  { m: '2026-04', aus: 319, ein: 444 }, { m: '2026-05', aus: 527, ein: 1574 }, { m: '2026-06', aus: 2622, ein: 2464 },
  { m: '2026-07', aus: 2006, ein: 1188 }, { m: '2026-08', aus: 3273, ein: 1578 }, { m: '2026-09', aus: 3826, ein: 1451 },
  { m: '2026-10', aus: 1508, ein: 80 },
]
const GETEILT_MONATE: Monat[] = [
  { m: '2026-07', aus: 1217, ein: 2338 }, { m: '2026-08', aus: 126, ein: 2310 }, { m: '2026-09', aus: 1639, ein: 2918 },
  { m: '2026-10', aus: 808, ein: 0 },
]
/** Herabgestufte Einlagen/Entnahmen auf dem geteilten Konto (Gegenkonto = Girokonto, im Scope Partner außerhalb): unregelmäßig. */
const EINLAGEN: { datum: string; type: 'income' | 'expense'; betrag: number }[] = [
  { datum: '2026-07-15', type: 'income', betrag: 100 },
  { datum: '2026-08-18', type: 'income', betrag: 1130 }, { datum: '2026-08-21', type: 'income', betrag: 1130 }, { datum: '2026-08-27', type: 'income', betrag: 1130 },
  { datum: '2026-08-19', type: 'expense', betrag: 1035 }, { datum: '2026-08-22', type: 'expense', betrag: 1035 },
  { datum: '2026-08-25', type: 'expense', betrag: 1035 }, { datum: '2026-08-28', type: 'expense', betrag: 1035 },
  { datum: '2026-09-03', type: 'expense', betrag: 900 }, { datum: '2026-09-12', type: 'expense', betrag: 750 }, { datum: '2026-09-26', type: 'expense', betrag: 600 },
  { datum: '2026-10-05', type: 'income', betrag: 150 },
]

const EIN_TAGE = [3, 17, 26]
const AUS_TAGE = [2, 6, 10, 14, 18, 22, 26]

function ausMonaten(konto: string, monate: Monat[], ab: string | null): ScopeBuchung[] {
  const out: ScopeBuchung[] = []
  const lump = (m: string, type: 'income' | 'expense', summe: number, tage: number[]) => {
    if (summe <= 0) return
    tage.forEach((tag, i) => {
      const datum = `${m}-${String(tag).padStart(2, '0')}`
      if ((ab && datum < ab) || datum > HEUTE) return
      out.push({
        id: `${konto}-${m}-${type}-${i}`, date: datum, type, amount: Math.round((summe / tage.length) * 100) / 100,
        flow_kind: 'echt', tax_role: null, gegenpartei: null, kategorie: null, account_id: konto,
      })
    })
  }
  for (const x of monate) { lump(x.m, 'income', x.ein, EIN_TAGE); lump(x.m, 'expense', x.aus, AUS_TAGE) }
  return out
}

/** Die Buchungen, die die Ansicht lädt (so wie getFlowTransactionsScope sie liefert). */
export function buchungenFuer(scope: ScopeKurz): ScopeBuchung[] {
  const giro = ausMonaten(GIRO, GIRO_MONATE, null)
  const geteilt = ausMonaten(GETEILT, GETEILT_MONATE, '2026-07-15')
  const einlagen: ScopeBuchung[] = EINLAGEN.map((e, i) => ({
    id: `einlage-${i}`, date: e.datum, type: e.type, amount: e.betrag, flow_kind: 'echt', tax_role: null,
    gegenpartei: null, kategorie: null, account_id: GETEILT, herabgestuft: true,
  }))
  if (scope === 'ich' || scope === 'gemeinsam') return [...giro, ...geteilt] // Giro <-> geteilt bleibt neutral (beide im Scope)
  return [...geteilt, ...einlagen]                                          // partner: nur das geteilte Konto, Einlagen herabgestuft
}

/** Stand je Ansicht (Konten und Vermögensreihe, Zahlen aus der Datenbank, Stand 2026-10-28). */
export const STAND = {
  ich: { liquide: [GIRO, GETEILT], liquiditaet: 200.05, vermoegenSnapshot: 10897.01, vermoegenReihe: 10897.01 },
  partner: { liquide: [GETEILT], liquiditaet: 87.29, vermoegenSnapshot: 10897.01, vermoegenReihe: 87.29 },
  gemeinsam: { liquide: [GIRO, GETEILT], liquiditaet: 200.05, vermoegenSnapshot: 10897.01, vermoegenReihe: 2811.06 },
} as const

function vertraegeFuer(scope: ScopeKurz): PrognoseVertrag[] {
  if (scope === 'partner') return []
  return [1, 5, 9, 14, 20, 25].map(tag => ({
    id: `v${tag}`, name: `Vertrag ${tag}`, type: 'subscription', frequency: 'monthly', amount: 236, billing_day: tag,
    start_date: '2026-01-01', end_date: null, auto_renews: true, is_active: true, account_id: GIRO, to_account_id: null,
  }))
}

export type Lauf = { prognose: Prognose; historie: ScopeHistorie; eingaben: PrognoseEingaben }

/**
 * `neu = false`: Verhalten VOR dem Fix (Vermögen aus dem Snapshot des Nutzers, Historie komplett, Einlagen wie Buchungen,
 * also die Logik von Scope 'ich'). `neu = true`: Scope-Regeln (Vermögensreihe, Lernbeginn, Einlagen-Klassifikation).
 */
export function laufFuer(scope: ScopeKurz, neu: boolean, monate = 12): Lauf {
  const st = STAND[scope]
  const historie = baueScopeHistorie(neu ? scope : 'ich', buchungenFuer(scope), st.liquide, { aus: [], ein: [] }, HEUTE)
  const eingaben: PrognoseEingaben = {
    heute: HEUTE, monate, liquideKontoIds: [...st.liquide], liquiditaet: st.liquiditaet,
    vermoegen: neu ? st.vermoegenReihe : st.vermoegenSnapshot,
    vertraege: vertraegeFuer(scope), tage: historie.tage, lohnTag: null, annahmen: [],
    ohneLohnWarnung: neu && scope !== 'ich',
  }
  return { prognose: berechnePrognose(eingaben, lerneModelle(eingaben)), historie, eingaben }
}

/** Liquidität und Vermögen am Ende der Monate +1, +3, +6, +12 (Monatsende). */
export function verlaufsZeile(p: Prognose): { start: number; startVermoegen: number; liq: number[]; nw: number[] } {
  const idx = [1, 3, 6, 12].map(k => Math.min(k, p.monate.length) - 1)
  return {
    start: p.start.liquiditaet, startVermoegen: p.start.vermoegen,
    liq: idx.map(i => p.monate[i].liquiditaetEnde), nw: idx.map(i => p.monate[i].vermoegenEnde),
  }
}
