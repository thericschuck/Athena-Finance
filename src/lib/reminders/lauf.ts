import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'
import { ladeSteuerdaten } from '@/lib/tax/laden'
import { berechneSteuerposition } from '@/lib/tax/position'
import { ladeVertragsAbgleich } from '@/lib/data/vertrag-abgleich'
import {
  ERINNERUNG_TYP, erzeugeErinnerungen, planeAbgleich,
  type ErinnerungsEingabe, type VorhandeneErinnerung,
} from './regeln'

type DB = SupabaseClient<Database>

/** Heutiges Kalenderdatum in deutscher Ortszeit. */
const heuteBerlin = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })

const schluesselVon = (payload: Json | null): string | null =>
  payload && typeof payload === 'object' && !Array.isArray(payload) && typeof payload.key === 'string' ? payload.key : null

async function ladeEingabe(supabase: DB, userId: string, heute: string): Promise<ErinnerungsEingabe> {
  const jahr = Number(heute.slice(0, 4))

  const [vertraegeRes, unkatRes, krakenKeyRes, krakenSyncRes] = await Promise.all([
    supabase.from('contracts').select('id, name, end_date, notice_days, auto_renews').eq('user_id', userId).eq('is_active', true),
    supabase.from('unified_transactions').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).is('category_id', null).in('flow_kind', ['echt', 'anlage', 'forderung']),
    supabase.from('exchange_keys').select('id').eq('user_id', userId).eq('exchange', 'kraken').maybeSingle(),
    supabase.from('user_settings').select('value').eq('user_id', userId).eq('key', 'kraken_last_sync').maybeSingle(),
  ])
  if (vertraegeRes.error) throw new Error(vertraegeRes.error.message)
  if (unkatRes.error) throw new Error(unkatRes.error.message)

  // Die Steuerregeln sind optional: fehlt der Tarif oder bricht eine Abfrage, laufen die übrigen Regeln weiter.
  let steuer: ErinnerungsEingabe['steuer'] = null
  try {
    const daten = await ladeSteuerdaten(supabase, userId, jahr)
    const p = berechneSteuerposition(daten.eingaben)
    steuer = {
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
    steuer = null
  }

  // Kein Fallback auf eine leere Liste: sonst würden bei einem Lesefehler alle offenen Vertragshinweise
  // archiviert und kämen wegen des stabilen Schlüssels nie wieder. Der Fehler soll den Lauf sichtbar scheitern lassen.
  const offeneVertragsbuchungen = (await ladeVertragsAbgleich(supabase, userId, heute))
    .filter(x => x.abgleich.status === 'offen')
    .map(x => ({ id: x.vertrag.id, name: x.vertrag.name, termin: x.abgleich.termin, betrag: x.vertrag.amount }))

  const letzter = krakenSyncRes.data?.value
  return {
    heute,
    vertraege: vertraegeRes.data ?? [],
    offeneVertragsbuchungen,
    steuer,
    unkategorisiert: unkatRes.count ?? 0,
    kraken: { hatKraken: krakenKeyRes.data !== null, letzterSync: typeof letzter === 'string' ? letzter : null },
  }
}

export type ErinnerungsLauf = { aktiv: number; eingefuegt: number; archiviert: number }

/**
 * Gleicht die Erinnerungen eines Nutzers mit der Lage ab: neue anlegen, erledigte archivieren.
 * Schreibt ausschließlich in `insights` (Typ `reminder`), nichts sonst.
 */
export async function aktualisiereErinnerungen(supabase: DB, userId: string, heute = heuteBerlin()): Promise<ErinnerungsLauf> {
  const aktiv = erzeugeErinnerungen(await ladeEingabe(supabase, userId, heute))

  const { data, error } = await supabase.from('insights').select('id, payload, dismissed_at')
    .eq('user_id', userId).eq('type', ERINNERUNG_TYP)
  if (error) throw new Error(error.message)
  const vorhanden: VorhandeneErinnerung[] = (data ?? []).flatMap(r => {
    const key = schluesselVon(r.payload)
    return key ? [{ id: r.id, key, dismissed_at: r.dismissed_at }] : []
  })

  const plan = planeAbgleich(aktiv, vorhanden)

  if (plan.einfuegen.length > 0) {
    const { error: insertError } = await supabase.from('insights').insert(plan.einfuegen.map(e => ({
      user_id: userId, type: ERINNERUNG_TYP, severity: e.severity, title: e.title, body: e.body, payload: { key: e.key },
    })))
    if (insertError) throw new Error(insertError.message)
  }
  if (plan.archivieren.length > 0) {
    const { error: updateError } = await supabase.from('insights')
      .update({ dismissed_at: new Date().toISOString() }).eq('user_id', userId).in('id', plan.archivieren)
    if (updateError) throw new Error(updateError.message)
  }

  return { aktiv: aktiv.length, eingefuegt: plan.einfuegen.length, archiviert: plan.archivieren.length }
}
