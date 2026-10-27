import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireAuthUser } from '@/lib/supabase/server'
import { resolveScope } from '@/lib/haushalt/resolve'
import { EditContractDialog, DeleteContractButton } from '@/components/finance/contract-form'
import { VertraegeKennzahlenLeiste, type Zelle } from '@/components/vertraege/VertraegeKennzahlenLeiste'
import { AbgleichHinweis, KuendigungHinweis } from '@/components/vertraege/VertragHinweise'
import { VertragVerlauf } from '@/components/vertraege/VertragVerlauf'
import { CONTRACT_TYPES, FREQUENCIES } from '@/lib/finance/contract-constants'
import { ladeVertragDetail } from '@/lib/data/vertraege-seite'
import { pruefeVertrag } from '@/lib/forecast/vertrag-abgleich'
import { tageZwischen } from '@/lib/forecast/datum'
import { fmtCurrency } from '@/lib/format'
import { datumText, istUmbuchung, kuendigung, naechsterTermin, proJahr, proMonat, relativTage } from '@/lib/vertraege/rechnen'
import { abbuchungsVerlauf, verlaufKennzahlen } from '@/lib/vertraege/verlauf'
import { ZuletztGeaendert } from '@/components/aenderungen/ZuletztGeaendert'
import { letzteAenderung } from '@/lib/data/aenderungen'

const TYP = Object.fromEntries(CONTRACT_TYPES.map(t => [t.value, t.label]))
const INTERVALL = Object.fromEntries(FREQUENCIES.map(f => [f.value, f.label]))

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { supabase, user }] = await Promise.all([params, requireAuthUser()])
  const ctx = await resolveScope(supabase, user!)
  // Die Aenderungs-Abfrage braucht nur die ID aus der URL, nicht das geladene Detail: parallel starten.
  const [d, zuletzt] = await Promise.all([
    ladeVertragDetail(supabase, ctx, id),
    letzteAenderung(supabase, ctx, 'contracts', id),
  ])
  if (!d) notFound()

  const { vertrag: c, heute, locale, dateFormat, konten, kategorien } = d
  const eur = (n: number, stellen = 2) => fmtCurrency(n, c.currency, locale, { fractionDigits: stellen })
  const umbuchung = istUmbuchung(c.type)
  const kontoName = (kid: string | null) => konten.find(k => k.id === kid)?.name
  const kategorie = kategorien.find(k => k.id === c.category_id)?.name

  const k = kuendigung(c, heute)
  const naechste = c.is_active ? naechsterTermin(c, heute) : null
  const monatlich = c.currency === 'EUR' ? proMonat(c.amount, c.frequency) : null

  const pruefbar = c.is_active && !umbuchung && c.account_id !== null
  const abgleich = pruefbar
    ? pruefeVertrag({ ...c, auto_renews: c.auto_renews === true }, d.buchungen, heute)
    : null
  const verlauf = pruefbar ? abbuchungsVerlauf({ ...c, auto_renews: c.auto_renews === true }, d.buchungen, heute, 12) : []
  const vk = verlaufKennzahlen(verlauf, c.amount)

  const zellen: Zelle[] = [
    {
      titel: 'Betrag', wert: eur(c.amount), zusatz: `/ ${INTERVALL[c.frequency]?.toLowerCase() ?? c.frequency}`,
      info: {
        titel: 'Vertragsbetrag',
        zeilen: [['Intervall', INTERVALL[c.frequency] ?? c.frequency], ['Abrechnungstag', c.billing_day ? String(c.billing_day) : 'Starttag']],
        text: 'Der im Vertrag hinterlegte Betrag je Abbuchung.',
      },
    },
  ]
  if (monatlich !== null && c.frequency !== 'monthly') {
    zellen.push({
      titel: 'Pro Monat', wert: eur(monatlich),
      info: { titel: 'Pro Monat', zeilen: [['Pro Jahr', eur(proJahr(c.amount, c.frequency))]], text: 'Der Betrag auf einen Monat umgerechnet.' },
    })
  }
  zellen.push({
    titel: 'Pro Jahr', wert: eur(proJahr(c.amount, c.frequency), 0),
    info: { titel: 'Pro Jahr', zeilen: [['Genau', eur(proJahr(c.amount, c.frequency))]], text: 'Hochgerechnet auf zwölf Monate.' },
  })
  if (naechste) {
    zellen.push({
      titel: 'Nächste Zahlung', wert: relativTage(tageZwischen(heute, naechste)), zusatz: datumText(naechste, dateFormat),
      info: { titel: 'Nächste Zahlung', zeilen: [['Termin', datumText(naechste, dateFormat)]], text: 'Nach Abrechnungstag und Intervall gerechnet, wie in der Prognose.' },
    })
  }
  if ((k.status === 'bald' || k.status === 'spaeter') && k.tage !== null) {
    zellen.push({
      titel: 'Kündigen bis', wert: datumText(k.frist, dateFormat), zusatz: relativTage(k.tage), ton: k.status === 'bald' ? 'warning' : undefined,
      info: { titel: 'Kündigungsfrist', zeilen: [['Enddatum', datumText(c.end_date, dateFormat)], ['Frist', `${c.notice_days} Tage`]], text: 'Letzter Tag für die Kündigung: Enddatum minus Kündigungsfrist.' },
    })
  }
  if (vk.anzahlGebucht > 0) {
    zellen.push({
      titel: 'Gebucht', wert: eur(vk.summeGebucht, 0), zusatz: `${vk.anzahlGebucht}×`,
      info: {
        titel: 'Tatsächlich abgebucht',
        zeilen: [['Buchungen', String(vk.anzahlGebucht)], ['Durchschnitt', vk.durchschnitt !== null ? eur(vk.durchschnitt) : '—'], ['Summe', eur(vk.summeGebucht)]],
        text: `Summe der gefundenen Abbuchungen zu den letzten ${verlauf.length} Terminen. Gefunden heißt: Ausgabe auf dem Vertragskonto, Betrag innerhalb von 5 %, Datum von 3 Tagen davor bis 7 Tage danach.`,
      },
    })
  }

  return (
    <div className="min-w-0 space-y-4 p-4 sm:p-8">
      <Link href="/finance/contracts" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground md:min-h-0">
        <ArrowLeft className="size-4" />
        Alle Verträge
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{c.name}</h1>
          <p className="truncate text-sm text-muted-foreground">
            {[TYP[c.type] ?? c.type, c.provider, umbuchung ? `${kontoName(c.account_id) ?? '—'} → ${kontoName(c.to_account_id) ?? '—'}` : kontoName(c.account_id)]
              .filter(Boolean).join(' · ')}
            {!c.is_active && ' · inaktiv'}
          </p>
          <ZuletztGeaendert info={zuletzt} />
        </div>
        <div className="flex shrink-0 items-center">
          <EditContractDialog contract={c} accounts={konten} categories={kategorien} />
          <DeleteContractButton contract={c} redirectTo="/finance/contracts" />
        </div>
      </div>

      <VertraegeKennzahlenLeiste zellen={zellen} />

      {c.is_active && (abgleich || k.status !== 'keine' || c.auto_renews) && (
        <div className="flex min-w-0 flex-col gap-1">
          {abgleich && <AbgleichHinweis abgleich={abgleich} dateFormat={dateFormat} />}
          <KuendigungHinweis k={k} endDate={c.end_date} dateFormat={dateFormat} autoRenews={c.auto_renews === true} />
          {vk.letzterBetrag !== null && (
            <p className="text-xs text-warning">
              Zuletzt wurden {eur(vk.letzterBetrag)} abgebucht, im Vertrag stehen {eur(c.amount)}. Betrag im Vertrag anpassen?
            </p>
          )}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border bg-card px-4 py-3 text-sm sm:grid-cols-4">
        <Fakt label="Start" wert={datumText(c.start_date, dateFormat)} />
        <Fakt label="Ende" wert={c.end_date ? datumText(c.end_date, dateFormat) : 'unbefristet'} />
        <Fakt label="Kündigungsfrist" wert={c.notice_days > 0 ? `${c.notice_days} Tage` : '—'} />
        <Fakt label="Verlängerung" wert={c.auto_renews ? 'automatisch' : 'keine'} />
        <Fakt label="Abrechnungstag" wert={c.billing_day ? `${c.billing_day}.` : 'wie Starttag'} />
        <Fakt label="Kategorie" wert={kategorie ?? '—'} />
        <Fakt label="Währung" wert={c.currency} />
        <Fakt label="Konto" wert={kontoName(c.account_id) ?? '—'} />
      </dl>

      <section className="min-w-0 space-y-2">
        <h2 className="px-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Abbuchungen
          {verlauf.length > 0 && <span className="ml-2 text-xs font-normal normal-case tracking-normal text-muted-foreground/70">letzte {verlauf.length} Termine</span>}
        </h2>
        {verlauf.length > 0 ? (
          <VertragVerlauf zeilen={verlauf} currency={c.currency} locale={locale} dateFormat={dateFormat} vertragsBetrag={c.amount} />
        ) : (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            {!c.is_active ? 'Der Vertrag ist inaktiv.'
              : umbuchung ? 'Umbuchungen zwischen eigenen Konten werden nicht mit Bankbuchungen abgeglichen.'
                : !c.account_id ? 'Ohne Konto lässt sich keine Abbuchung zuordnen. Konto im Vertrag hinterlegen.'
                  : 'Noch kein Abbuchungstermin seit dem Start.'}
          </p>
        )}
      </section>

      {d.verknuepft.length > 0 && (
        <section className="min-w-0 space-y-2">
          <h2 className="px-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Verknüpfte Buchungen
            <span className="ml-2 text-xs font-normal normal-case tracking-normal text-muted-foreground/70">{d.verknuepft.length}</span>
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {d.verknuepft.slice(0, 12).map(b => (
              <li key={b.id} className="flex items-baseline justify-between gap-3 px-3 py-2.5 sm:px-4">
                <span className="min-w-0 truncate text-sm">
                  <span className="tabular-nums">{datumText(b.date, dateFormat)}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{b.text || c.name}</span>
                </span>
                <span className={`shrink-0 text-sm font-medium tabular-nums ${b.type === 'expense' ? 'text-danger' : ''}`}>
                  {b.type === 'expense' ? '−' : ''}{eur(b.amount)}
                </span>
              </li>
            ))}
          </ul>
          <p className="px-1 text-xs text-muted-foreground">Früher hat ein Cron-Job Buchungen zum Vertrag angelegt; neue entstehen nicht mehr.</p>
        </section>
      )}

      {c.notes && (
        <p className="whitespace-pre-line rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">{c.notes}</p>
      )}
    </div>
  )
}

function Fakt({ label, wert }: { label: string; wert: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate">{wert}</dd>
    </div>
  )
}
