/**
 * Reminder-Feed: feste Regeln, die aus Zahlen, die schon in der Datenbank liegen, kurze Hinweise machen
 * (Kündigungsfrist läuft ab, Steuerrücklage hat eine Lücke, Haltefrist endet ...). Kein LLM, kein Freitext
 * aus Bankdaten: Eingabe sind Zahlen, Datumsangaben und vom Nutzer selbst vergebene Namen. Deshalb darf
 * der Lauf direkt in `insights` schreiben, ohne die Bestätigungspflicht des Chat-Agenten (docs/athenas-takt.html).
 *
 * Zwei Dinge unterscheiden das vom "Insight-Friedhof":
 *   - Jede Erinnerung trägt einen stabilen Schlüssel (`payload.key`). Was schon einmal erzeugt wurde, kommt
 *     nicht wieder, auch nicht, wenn der Nutzer es weggeklickt hat.
 *   - Trifft die Bedingung nicht mehr zu (Frist verstrichen, Lücke geschlossen), wird die offene Erinnerung
 *     archiviert (`dismissed_at`), statt liegen zu bleiben.
 *
 * Keine Imports außer Typen, damit `node --test` die Datei direkt lädt.
 */

export const ERINNERUNG_TYP = 'reminder'

export type Erinnerung = {
  /** Stabiler Schlüssel; gleiche Lage = gleicher Schlüssel. */
  key: string
  severity: 'info' | 'warning'
  title: string
  body: string
}

export type ErinnerungsEingabe = {
  /** `YYYY-MM-DD` */
  heute: string
  vertraege: {
    id: string
    name: string
    end_date: string | null
    notice_days: number | null
    auto_renews: boolean | null
  }[]
  /** Verträge, zu deren letztem Termin keine passende Buchung eingegangen ist (Status `offen`). */
  offeneVertragsbuchungen: { id: string; name: string; termin: string; betrag: number }[]
  steuer: {
    jahr: number
    ruecklage: { soll: number; ist: number | null; luecke: number | null }
    kleinunternehmer: { status: 'gruen' | 'gelb' | 'rot' | 'unbekannt'; umsatzLaufend: number; grenzeLaufend: number }
    krypto: {
      saldoSteuerpflichtig: number
      zuVersteuern: number
      freigrenze: number
      offeneLose: { anschaffungId: string; asset: string; quantity: number; steuerfreiAb: string }[]
    } | null
  } | null
  /** Buchungen ohne Kategorie (Konsum, Anlage, Forderung). */
  unkategorisiert: number
  /** Letzter Kraken-Sync (ISO); null = nie. `hatKraken`: es ist ein Schlüssel hinterlegt. */
  kraken: { hatKraken: boolean; letzterSync: string | null }
}

const euro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const menge = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 6 })
const datum = (iso: string) => { const [j, m, t] = iso.slice(0, 10).split('-'); return `${t}.${m}.${j}` }

function tageZwischen(von: string, bis: string): number {
  return Math.round((Date.parse(`${bis.slice(0, 10)}T00:00:00Z`) - Date.parse(`${von.slice(0, 10)}T00:00:00Z`)) / 86_400_000)
}

function tagDavor(iso: string, tage: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) - tage * 86_400_000).toISOString().slice(0, 10)
}

/** ISO-Kalenderwoche als Schlüsselteil, damit eine dauerhafte Lage höchstens einmal pro Woche erneut auftaucht. */
function woche(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)) // Donnerstag der Woche bestimmt das Jahr
  const nr = Math.ceil(((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(nr).padStart(2, '0')}`
}

const quartal = (iso: string) => `${iso.slice(0, 4)}-Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`

export function erzeugeErinnerungen(e: ErinnerungsEingabe): Erinnerung[] {
  const out: Erinnerung[] = []

  // ── Kündigungsfristen: nur Verträge, die sich ohne Kündigung verlängern ─────────────────────────
  for (const v of e.vertraege) {
    if (!v.end_date || !v.auto_renews) continue
    const letzter = tagDavor(v.end_date, v.notice_days ?? 0)
    const tage = tageZwischen(e.heute, letzter)
    if (tage < 0 || tage > 21) continue
    out.push({
      key: `kuendigung:${v.id}:${v.end_date}`,
      severity: tage <= 7 ? 'warning' : 'info',
      title: tage === 0 ? `Heute letzter Kündigungstag: ${v.name}` : `Kündigungsfrist „${v.name}" endet in ${tage} ${tage === 1 ? 'Tag' : 'Tagen'}`,
      body: `Letzter Kündigungstag ist der ${datum(letzter)}. Ohne Kündigung verlängert sich der Vertrag über den ${datum(v.end_date)} hinaus.`,
    })
  }

  // ── Vertragsbuchungen: Verträge buchen nichts selbst, sie melden nur, was auf dem Konto fehlt ───────
  for (const v of e.offeneVertragsbuchungen) {
    out.push({
      key: `vertrag-offen:${v.id}:${v.termin}`,
      severity: 'warning',
      title: `„${v.name}": Abbuchung vom ${datum(v.termin)} fehlt`,
      body: `Erwartet wurden ${euro(v.betrag)}, auf dem Konto ist keine passende Buchung eingegangen. Prüfe den Bank-Sync oder ob das Abo gekündigt oder der Betrag geändert wurde (Finance → Verträge & Abos).`,
    })
  }

  // ── Steuer ────────────────────────────────────────────────────────────────────────────────────
  const s = e.steuer
  if (s) {
    const { ruecklage, kleinunternehmer: ku, krypto } = s
    if (ruecklage.soll > 0 && (ruecklage.luecke ?? ruecklage.soll) >= 50) {
      out.push({
        key: `ruecklage:${s.jahr}:${quartal(e.heute)}`,
        severity: 'warning',
        title: ruecklage.ist === null
          ? `Steuerrücklage ${s.jahr}: noch kein Sparziel angelegt`
          : `Steuerrücklage ${s.jahr}: ${euro(ruecklage.luecke ?? 0)} fehlen`,
        body: ruecklage.ist === null
          ? `Die geschätzte Steuer liegt bei ${euro(ruecklage.soll)}. Lege ein Sparziel „Steuerrücklage ${s.jahr}" an, damit das Geld nicht ausgegeben wird.`
          : `Soll ${euro(ruecklage.soll)}, zurückgelegt ${euro(ruecklage.ist)}.`,
      })
    }
    if (ku.status === 'gelb' || ku.status === 'rot') {
      out.push({
        key: `kleinunternehmer:${s.jahr}:${ku.status}`,
        severity: ku.status === 'rot' ? 'warning' : 'info',
        title: ku.status === 'rot' ? 'Kleinunternehmergrenze überschritten' : 'Kleinunternehmergrenze rückt näher',
        body: `Umsatz ${s.jahr}: ${euro(ku.umsatzLaufend)} von ${euro(ku.grenzeLaufend)}.` +
          (ku.status === 'rot' ? ' Damit wird Umsatzsteuer fällig.' : ' Ab einem Umsatz über der Grenze wird Umsatzsteuer fällig.'),
      })
    }
    if (krypto) {
      if (krypto.zuVersteuern > 0) {
        out.push({
          key: `krypto-ueber:${s.jahr}`,
          severity: 'warning',
          title: `Krypto: Freigrenze ${s.jahr} überschritten`,
          body: `Der steuerpflichtige Saldo liegt bei ${euro(krypto.saldoSteuerpflichtig)} (Freigrenze ${euro(krypto.freigrenze)}). Bei Überschreitung zählt der ganze Betrag.`,
        })
      } else if (krypto.saldoSteuerpflichtig >= 0.8 * krypto.freigrenze && krypto.saldoSteuerpflichtig > 0) {
        out.push({
          key: `krypto-nah:${s.jahr}`,
          severity: 'info',
          title: `Krypto: ${euro(krypto.freigrenze - krypto.saldoSteuerpflichtig)} bis zur Freigrenze`,
          body: `Der steuerpflichtige Saldo ${s.jahr} liegt bei ${euro(krypto.saldoSteuerpflichtig)}. Ab ${euro(krypto.freigrenze)} wird der ganze Betrag steuerpflichtig.`,
        })
      }
      const bald = krypto.offeneLose
        .filter(l => { const t = tageZwischen(e.heute, l.steuerfreiAb); return t > 0 && t <= 30 })
        .sort((a, b) => a.steuerfreiAb.localeCompare(b.steuerfreiAb))
        .slice(0, 3)
      for (const l of bald) {
        out.push({
          key: `haltefrist:${l.anschaffungId}:${l.steuerfreiAb}`,
          severity: 'info',
          title: `${menge(l.quantity)} ${l.asset} werden am ${datum(l.steuerfreiAb)} steuerfrei`,
          body: `Die Haltefrist von einem Jahr endet. Ein Verkauf ab dem ${datum(l.steuerfreiAb)} ist steuerfrei, davor steuerpflichtig.`,
        })
      }
    }
  }

  // ── Datenpflege ───────────────────────────────────────────────────────────────────────────────
  if (e.unkategorisiert >= 10) {
    out.push({
      key: `unkategorisiert:${e.heute.slice(0, 7)}`,
      severity: 'info',
      title: `${e.unkategorisiert} Buchungen ohne Kategorie`,
      body: 'Unter Finance → Transaktionen gibt es Vorschläge, die du mit einem Klick übernehmen kannst. Ohne Kategorie fehlen die Buchungen in Auswertung und Steuer.',
    })
  }
  if (e.kraken.hatKraken) {
    const alter = e.kraken.letzterSync ? tageZwischen(e.kraken.letzterSync, e.heute) : null
    if (alter === null || alter >= 3) {
      out.push({
        key: `kraken-sync:${woche(e.heute)}`,
        severity: 'warning',
        title: alter === null ? 'Kraken wurde noch nie synchronisiert' : `Kraken-Sync liegt ${alter} Tage zurück`,
        body: 'Bestände, Einstandspreise und die Krypto-Steuer beruhen auf dem letzten Sync. Prüfe den API-Key unter Einstellungen → Integrationen.',
      })
    }
  }

  return out
}

export type VorhandeneErinnerung = { id: string; key: string; dismissed_at: string | null }

/**
 * Was zu tun ist: neue Schlüssel einfügen, offene Erinnerungen archivieren, deren Bedingung nicht mehr gilt.
 * Schon vorhandene Schlüssel (auch weggeklickte) werden nie erneut eingefügt.
 */
export function planeAbgleich(aktiv: Erinnerung[], vorhanden: VorhandeneErinnerung[]): { einfuegen: Erinnerung[]; archivieren: string[] } {
  const bekannt = new Set(vorhanden.map(v => v.key))
  const aktivKeys = new Set(aktiv.map(a => a.key))
  return {
    einfuegen: aktiv.filter(a => !bekannt.has(a.key)),
    archivieren: vorhanden.filter(v => v.dismissed_at === null && !aktivKeys.has(v.key)).map(v => v.id),
  }
}
