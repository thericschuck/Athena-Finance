import { getNetWorthZeilen } from '@/lib/data/verlauf-networth'
import { ladePrognoseBasis } from '@/lib/forecast/laden'
import { prognoseLinie } from '@/lib/verlauf/prognose-linie'
import { getSammlungsRohdaten } from '@/lib/data/inventar'
import { sammlungsverlauf } from '@/lib/inventar/sammlungsverlauf'
import {
  aggregiere, auffaelligkeiten, kennzahlen, luecken, meilensteine, mitDelta,
  type Aggregation,
} from '@/lib/verlauf/networth'
import type { LinienPunkt, ProjektionPunkt } from '@/lib/verlauf/types'
import { PAGE_SIZE, heuteBerlin, type TabCtx } from './shared'
import { NetWorthChartLazy } from './NetWorthChartLazy'
import { NetworthKpis } from './NetworthKpis'
import { NetworthTable } from './NetworthTable'
import { DatenqualitaetHinweis } from './DatenqualitaetHinweis'
import { BewegungsAnalyse } from './BewegungsAnalyse'

function leseAggregation(wert: string | undefined): Aggregation {
  return wert === 'woche' || wert === 'monat' ? wert : 'tag'
}

// ─── Tab: Net Worth ───────────────────────────────────────────────────────────
// Alle Snapshots werden einmal geladen (eine Zeile pro Tag, einige hundert): Chart,
// Kennzahlen, Datenqualität und Aggregation brauchen die vollständige Reihe. Die Seiten-
// aufteilung der Tabelle passiert danach in JS über die aggregierten Zeilen.
export async function NetworthTab({ supabase, uid, locale, dateFormat, page, params }: TabCtx) {
  const heute = heuteBerlin()
  const agg = leseAggregation(params.agg)

  // Prognose und Sammlung sind Zusatzlinien: scheitert eine, bleibt der Rest der Seite
  // brauchbar (die Linie fehlt dann).
  const [zeilen, proj, sammlung] = await Promise.all([
    getNetWorthZeilen(supabase, uid),
    ladeProjektion(supabase, uid, heute),
    ladeSammlung(supabase, uid, heute),
  ])

  const kz = kennzahlen(zeilen, heute)
  const aktuell = kz.aktuell?.net_worth ?? 0
  // Meilensteine nur zeigen, wenn die Projektion sie überhaupt in Sicht rückt — sonst
  // streckt eine ferne Linie die y-Achse und drückt die Kurve platt.
  const hoechsterProjektionswert = proj.length ? Math.max(...proj.map(p => p.wert)) : aktuell
  const ziele = meilensteine(aktuell).filter(m => m <= Math.max(hoechsterProjektionswert, aktuell) * 1.25)

  const luecke = luecken(zeilen)
  const auffaellig = auffaelligkeiten(zeilen)

  // Tabelle: neueste zuerst, Δ zur Vorperiode der gewählten Aggregation.
  const tabelle = mitDelta(aggregiere(zeilen, agg)).reverse()

  return (
    <div>
      <NetworthKpis kz={kz} locale={locale} dateFormat={dateFormat} />
      {zeilen.length > 0 && (
        <div className="px-4 pb-4">
          <NetWorthChartLazy
            punkte={zeilen}
            locale={locale}
            sammlung={sammlung}
            projektion={proj}
            meilensteine={ziele}
          />
        </div>
      )}
      <DatenqualitaetHinweis
        luecken={luecke}
        auffaellig={auffaellig}
        zeilen={zeilen}
        locale={locale}
        dateFormat={dateFormat}
      />
      <NetworthTable
        zeilen={tabelle}
        agg={agg}
        auffaellig={new Set(auffaellig.map(a => a.datum))}
        page={page}
        pageSize={PAGE_SIZE}
        params={params}
        locale={locale}
        dateFormat={dateFormat}
      />
      <BewegungsAnalyse supabase={supabase} uid={uid} locale={locale} snapshots={zeilen.map(z => ({ datum: z.datum, net_worth: z.net_worth, total_depot: z.total_depot, total_crypto: z.total_crypto }))} />
    </div>
  )
}

/**
 * Vermögensprognose aus demselben System wie die Prognose-Seite (Zyklusmodell auf der ganzen
 * Historie, Verträge, bekannte Termine, 80-%-Bereich) — genauer als eine Gerade aus der
 * Sparrate. 12 Monate reichen für den Verlauf; die Prognose-Seite selbst rechnet 18.
 * Schlägt sie fehl, fehlt die Linie, die Seite bleibt benutzbar.
 */
async function ladeProjektion(supabase: TabCtx['supabase'], uid: string, heute: string): Promise<ProjektionPunkt[]> {
  try {
    const b = await ladePrognoseBasis(supabase, uid, heute, { monate: 12 })
    return prognoseLinie(b.szenario.tage)
  } catch {
    return []
  }
}

/** Sammlungswert (Inventar) als Zusatzlinie; leer, wenn nichts bewertet ist. */
async function ladeSammlung(supabase: TabCtx['supabase'], uid: string, heute: string): Promise<LinienPunkt[]> {
  try {
    const roh = await getSammlungsRohdaten(supabase, uid)
    return sammlungsverlauf(roh.stuecke, roh.bewertungen, heute).map(p => ({ datum: p.datum, wert: p.wert }))
  } catch {
    return []
  }
}
