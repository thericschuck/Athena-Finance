import { requireAuthUser } from '@/lib/supabase/server'
import { resolveScope } from '@/lib/haushalt/resolve'
import { AddContractDialog } from '@/components/finance/contract-form'
import { VertragsVorschlaege } from '@/components/finance/vertrags-vorschlaege'
import { VertraegeKennzahlenLeiste, type Zelle } from '@/components/vertraege/VertraegeKennzahlenLeiste'
import { VertraegeAnsicht } from '@/components/vertraege/VertraegeAnsicht'
import { DepotPlanZeilen, VertraegeGruppe } from '@/components/vertraege/VertraegeListe'
import { ladeVertraegeSeite } from '@/lib/data/vertraege-seite'
import { fmtCurrency } from '@/lib/format'
import { Repeat } from 'lucide-react'
import { LeerZustand } from '@/components/leer/LeerZustand'
import { ScopeHinweisFuer } from '@/components/leer/ScopeHinweisFuer'
import {
  ansichtVon, datumText, fixkostenNachKonto, gruppiere, kennzahlen, relativTage, type Ansicht,
} from '@/lib/vertraege/rechnen'

export default async function ContractsPage({ searchParams }: { searchParams: Promise<{ ansicht?: string | string[]}> }) {
  const [{ supabase, user }, params] = await Promise.all([requireAuthUser(), searchParams])
  const ansicht = ansichtVon(params.ansicht)
  const ctx = await resolveScope(supabase, user!)
  const d = await ladeVertraegeSeite(supabase, ctx)

  const { heute, locale, dateFormat } = d
  const euro = (n: number, stellen = 0) => fmtCurrency(n, 'EUR', locale, { fractionDigits: stellen })

  const gruppen = gruppiere(d.vertraege, heute)
  const aktiveDepot = d.depotPlaene.filter(p => p.is_active)
  const offeneIds = new Set([...d.abgleich].filter(([, a]) => a.status === 'offen').map(([id]) => id))
  const k = kennzahlen(d.vertraege, aktiveDepot.reduce((s, p) => s + Number(p.monthly_amount), 0), offeneIds, heute)
  const nachKonto = fixkostenNachKonto(d.vertraege, id => d.konten.find(x => x.id === id)?.name)

  const zahlen: Record<Ansicht, number> = {
    alle: d.vertraege.length + d.depotPlaene.length,
    fixkosten: gruppen.fixkosten.length,
    sparraten: gruppen.sparraten.length + d.depotPlaene.length,
    inaktiv: gruppen.inaktiv.length,
  }

  const fremd = k.fremdwaehrung > 0
    ? ` ${k.fremdwaehrung} Vertrag${k.fremdwaehrung === 1 ? '' : 'e'} in anderer Währung ${k.fremdwaehrung === 1 ? 'steht' : 'stehen'} nicht in der Summe.`
    : ''

  const zellen: Zelle[] = [
    {
      titel: 'Fixkosten', wert: euro(k.monatlich), zusatz: '/ Monat',
      info: {
        titel: 'Fixkosten pro Monat',
        zeilen: [['Verträge', String(k.anzahlFixkosten)], ['Genau', euro(k.monatlich, 2)]],
        text: `Summe der aktiven Verträge in Euro, Wochen-, Quartals-, Halbjahres- und Jahresbeträge auf den Monat umgerechnet. Sparraten und Umbuchungen zählen nicht dazu.${fremd}`,
      },
    },
    {
      titel: 'Pro Jahr', wert: euro(k.jahr),
      info: { titel: 'Fixkosten pro Jahr', zeilen: [['Genau', euro(k.jahr, 2)]], text: 'Die Monatssumme mal zwölf.' },
    },
    {
      titel: 'Aktiv', wert: String(k.anzahlFixkosten),
      zusatz: k.anzahlSparraten > 0 ? `+ ${k.anzahlSparraten} Sparraten` : undefined,
      info: {
        titel: 'Aktive Verträge',
        zeilen: [['Fixkosten', String(k.anzahlFixkosten)], ['Sparraten und Umbuchungen', String(k.anzahlSparraten)], ['Inaktiv', String(gruppen.inaktiv.length)]],
        text: 'Aktive Verträge ohne Sparraten. Die Sparraten sind Umbuchungen zwischen eigenen Konten.',
      },
    },
  ]
  if (k.sparMonatlich > 0) {
    zellen.push({
      titel: 'Sparraten', wert: euro(k.sparMonatlich), zusatz: '/ Monat',
      info: {
        titel: 'Sparraten pro Monat',
        zeilen: [['Verträge', String(k.anzahlSparraten)], ['Depot-Sparpläne', String(aktiveDepot.length)]],
        text: 'Daueraufträge, Bausparraten und Depot-Sparpläne. Das Geld bleibt bei dir, deshalb gehören sie nicht zu den Fixkosten.',
      },
    })
  }
  if (k.naechsteAbbuchung) {
    const n = k.naechsteAbbuchung
    zellen.push({
      titel: 'Nächste Abbuchung', wert: relativTage(n.tage), zusatz: n.name,
      info: {
        titel: n.name,
        zeilen: [['Termin', datumText(n.termin, dateFormat)], ['Betrag', euro(n.betrag, 2)]],
        text: 'Der nächste Abbuchungstermin aller aktiven Verträge, gerechnet nach Abrechnungstag und Intervall.',
      },
    })
  }
  if (k.naechsteKuendigung) {
    const n = k.naechsteKuendigung
    zellen.push({
      titel: 'Kündigungsfrist', wert: relativTage(n.tage), zusatz: n.name, ton: n.tage <= 30 ? 'warning' : undefined,
      info: {
        titel: `Kündigung ${n.name}`,
        zeilen: [['Kündigen bis', datumText(n.frist, dateFormat)]],
        text: 'Die nächste Kündigungsfrist eines Vertrags mit Enddatum und automatischer Verlängerung (Enddatum minus Kündigungsfrist).',
      },
    })
  }
  if (k.ohneAbbuchung > 0) {
    zellen.push({
      titel: 'Ohne Abbuchung', wert: String(k.ohneAbbuchung), ton: 'warning',
      info: {
        titel: 'Abbuchung nicht eingegangen',
        text: 'Zum letzten Termin dieser Verträge gibt es keine passende Ausgabe auf dem Vertragskonto (Betrag innerhalb von 5 %, 3 Tage davor bis 7 Tage danach). Bank-Sync prüfen, oder die Zahlung läuft über ein anderes Konto (Karte, PayPal).',
      },
    })
  }

  const gemeinsam = { konten: d.konten, kategorien: d.kategorien, abgleich: d.abgleich, locale, dateFormat, heute }
  const leer = d.vertraege.length === 0 && d.depotPlaene.length === 0
  const zeigeVorschlaege = ansicht === 'alle' || ansicht === 'fixkosten'

  return (
    <div className="min-w-0 space-y-4 p-4 sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">Verträge &amp; Abos</h1>
          <p className="line-clamp-2 text-xs text-muted-foreground">Nur Übersicht: gebucht wird nichts, abgeglichen wird mit deinen Bankbuchungen.</p>
        </div>
        <AddContractDialog accounts={d.konten} categories={d.kategorien} />
      </div>

      {!leer && <VertraegeKennzahlenLeiste zellen={zellen} />}

      {d.abgleichFehlt && (
        <p role="status" className="text-xs text-warning">Der Abgleich mit den Bankbuchungen ließ sich nicht laden; die Hinweise zu fehlenden Abbuchungen fehlen vorübergehend.</p>
      )}

      {!leer && (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <VertraegeAnsicht aktiv={ansicht} zahlen={zahlen} />
          {nachKonto.length > 1 && ansicht !== 'sparraten' && ansicht !== 'inaktiv' && (
            <p className="flex min-w-0 flex-wrap gap-x-3 text-xs text-muted-foreground">
              {nachKonto.map(e => (
                <span key={e.id ?? 'ohne'} className="min-w-0 max-w-full truncate">
                  {e.name} <span className="tabular-nums text-foreground">{euro(e.monatlich)}</span>/Mo.
                </span>
              ))}
            </p>
          )}
        </div>
      )}

      {zeigeVorschlaege && <VertragsVorschlaege vorschlaege={d.vorschlaege} ausgeblendet={d.ausgeblendet} />}

      {leer ? (
        <div className="space-y-4">
          <ScopeHinweisFuer ctx={ctx} thema="Verträge" />
          <LeerZustand
            icon={Repeat}
            titel="Keine Verträge erfasst"
            text="Hier stehen Abos, Versicherungen und Daueraufträge. Sie speisen die Fixkosten und die Prognose; abgeglichen werden sie mit deinen Bankbuchungen. Lege einen Vertrag an oder übernimm einen erkannten Vorschlag."
            aktionNode={<AddContractDialog accounts={d.konten} categories={d.kategorien} />}
          />
        </div>
      ) : (
        <div className="min-w-0 space-y-6">
          {(ansicht === 'alle' || ansicht === 'fixkosten') && (
            <VertraegeGruppe titel="Fixkosten" vertraege={gruppen.fixkosten} {...gemeinsam} />
          )}
          {(ansicht === 'alle' || ansicht === 'sparraten') && (
            <VertraegeGruppe titel="Sparraten & Umbuchungen" zusatzAnzahl={d.depotPlaene.length} vertraege={gruppen.sparraten} {...gemeinsam}>
              {d.depotPlaene.length > 0 && <DepotPlanZeilen plaene={d.depotPlaene} locale={locale} dateFormat={dateFormat} heute={heute} />}
            </VertraegeGruppe>
          )}
          {(ansicht === 'alle' || ansicht === 'inaktiv') && (
            <VertraegeGruppe titel="Inaktiv" vertraege={gruppen.inaktiv} {...gemeinsam} />
          )}
          {zahlen[ansicht] === 0 && (
            <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">Hier ist nichts.</p>
          )}
        </div>
      )}
    </div>
  )
}
