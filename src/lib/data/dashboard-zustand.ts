import { cache } from 'react'
import { getAuthUser } from '@/lib/supabase/server'
import { getBankScaStatus } from '@/lib/fints/state'
import { getBankBalances } from '@/lib/data/finance-accounts'
import { applyAccountScope, type ScopeContext } from '@/lib/haushalt/scope'
import { artFragment, herabstufungsIds } from '@/lib/haushalt/umbuchung'
import { ladeSteuerdaten } from '@/lib/tax/laden'
import { berechneSteuerposition } from '@/lib/tax/position'
import type { ErinnerungsEingabe } from '@/lib/reminders/regeln'
import { aeltesterSyncStunden, bewerteBank, bewerteDaten, bewerteSteuer, bewerteZustand, type Zustandszeile } from '@/lib/dashboard/zustand'

/**
 * Daten der Dashboard-Zustandszeile: Bank-Sync und Freigabe, Steuerlage, offene Buchungen.
 * Alles serverseitig direkt aus der Datenbank (kein Umweg ueber /api/bank/sca-status).
 *
 * Scope: Bank-Sync-Alter und offene Buchungen folgen dem Scope (Konten/IBANs im Scope). OWNER-ONLY bleiben die SCA-Freigabe
 * (fints_client_state) und die Steuerlage (Steuer/Kraken sind pro Person): beide mit ctx.userId.
 *
 * Die Steuerlage ist der teure Teil (Jahresbuchungen von Jahr und Vorjahr, Kraken-Historie). Es wird
 * genau das geladen und gerechnet, was auch der Erinnerungslauf fuer seine Steuerregeln nimmt
 * (lib/reminders/lauf.ts: ladeSteuerdaten + berechneSteuerposition), nicht mehr. Sie hat ein
 * Zeitlimit: dauert sie zu lange oder wirft sie, fehlt nur der Steuerchip; Bank und Daten kommen
 * trotzdem. Geloggt wird nichts (Steuerzahlen gehoeren nicht ins Log).
 */

const STEUER_LIMIT_MS = 8000

const nachZeit = <T>(p: Promise<T>, ms: number): Promise<T | null> =>
  new Promise(resolve => {
    const t = setTimeout(() => resolve(null), ms)
    p.then(v => { clearTimeout(t); resolve(v) }, () => { clearTimeout(t); resolve(null) })
  })

async function ladeSteuer(userId: string, jahr: number): Promise<ErinnerungsEingabe['steuer']> {
  try {
    const { supabase } = await getAuthUser()
    const daten = await ladeSteuerdaten(supabase, userId, jahr)
    const p = berechneSteuerposition(daten.eingaben)
    return {
      jahr,
      ruecklage: p.ruecklage,
      kleinunternehmer: {
        status: p.kleinunternehmer.status,
        umsatzLaufend: p.kleinunternehmer.umsatz_laufend,
        grenzeLaufend: p.kleinunternehmer.grenze_laufend,
      },
      krypto: daten.krypto
        ? {
            saldoSteuerpflichtig: daten.krypto.ergebnis.saldoSteuerpflichtigEur,
            zuVersteuern: daten.krypto.ergebnis.zuVersteuernEur,
            freigrenze: daten.krypto.freigrenzeEur,
            offeneLose: daten.krypto.fifo.offeneLose,
          }
        : null,
    }
  } catch {
    return null
  }
}

async function ladeBank(ctx: ScopeContext, jetzt: number) {
  try {
    const { supabase } = await getAuthUser()
    const [salden, sca] = await Promise.all([
      getBankBalances(supabase, ctx).then(data => ({ data, error: null }), () => ({ data: null, error: true })),
      // Service-Role-Tabelle (OWNER-ONLY); ohne Schluessel oder bei Fehler bleibt die Freigabe-Pruefung einfach weg.
      getBankScaStatus(ctx.userId).catch(() => []),
    ])
    return {
      aeltesterSyncStunden: salden.error ? null : aeltesterSyncStunden((salden.data ?? []).map(r => r.fetched_at), jetzt),
      sca,
    }
  } catch {
    return { aeltesterSyncStunden: null, sca: [] }
  }
}

async function zaehleOffene(ctx: ScopeContext): Promise<number> {
  try {
    const { supabase } = await getAuthUser()
    // Haushalt: auch herabgestufte Umbuchungen (Gegenkonto nicht im Scope, flow_kind_extern zaehlend) ohne Kategorie (lib/haushalt/umbuchung.ts).
    const arten = ['echt', 'anlage', 'forderung']
    const herab = herabstufungsIds(ctx)
    const basis = applyAccountScope(supabase.from('unified_transactions').select('id', { count: 'exact', head: true }), ctx).is('category_id', null)
    const { count, error } = await (herab ? basis.or(artFragment(herab, arten)) : basis.in('flow_kind', arten))
    return error ? 0 : count ?? 0
  } catch {
    return 0
  }
}

/** Die fertig bewertete Zustandszeile; pro Anfrage einmal gerechnet. */
export const ladeDashZustand = cache(async (ctx: ScopeContext, heute: string): Promise<Zustandszeile> => {
  const jetzt = Date.now()
  const [bank, steuer, offene] = await Promise.all([
    ladeBank(ctx, jetzt),
    nachZeit(ladeSteuer(ctx.userId, Number(heute.slice(0, 4))), STEUER_LIMIT_MS),
    zaehleOffene(ctx),
  ])
  return bewerteZustand([bewerteBank(bank, jetzt), bewerteSteuer(steuer, heute), bewerteDaten(offene)])
})
