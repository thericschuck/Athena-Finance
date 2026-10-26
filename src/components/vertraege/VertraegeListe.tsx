import Link from 'next/link'
import { ExternalLink, TrendingUp } from 'lucide-react'
import { EditContractDialog, DeleteContractButton } from '@/components/finance/contract-form'
import { AbgleichHinweis, KuendigungHinweis } from '@/components/vertraege/VertragHinweise'
import { CONTRACT_TYPES } from '@/lib/finance/contract-constants'
import { fmtCurrency } from '@/lib/format'
import type { Abgleich } from '@/lib/forecast/vertrag-abgleich'
import type { Auswahl } from '@/lib/data/vertraege-seite'
import type { SavingsPlanRow } from '@/lib/data/finance-planning'
import {
  datumText, istUmbuchung, kuendigung, naechsterTermin, naechsteAusfuehrung, proMonat, relativTage, type Vertrag,
} from '@/lib/vertraege/rechnen'
import { tageZwischen } from '@/lib/forecast/datum'

/**
 * Gruppen der Verträge-Seite. Eine Zeile ist am Handy eine Kartenzeile (Name + Betrag, darunter Meta und
 * Hinweise, Aktionen rechts, immer sichtbar), am Desktop dieselbe Zeile mit Aktionen beim Überfahren.
 * Server-Komponente; nur die Dialoge sind Client-Komponenten.
 */

const TYP = Object.fromEntries(CONTRACT_TYPES.map(t => [t.value, t.label]))
/** Kurzform für „/ Monat“ usw. */
const PRO: Record<string, string> = {
  weekly: 'Woche', biweekly: '2 Wochen', monthly: 'Monat', quarterly: 'Quartal', biannual: 'Halbjahr', yearly: 'Jahr',
}

type Gemeinsam = {
  konten: Auswahl[]
  kategorien: Auswahl[]
  abgleich: Map<string, Abgleich>
  locale: string
  dateFormat: string
  heute: string
}

const AKTIONEN =
  'flex shrink-0 items-center opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100'

export function VertraegeGruppe({
  titel, zusatzAnzahl = 0, vertraege, children, ...rest
}: Gemeinsam & { titel: string; zusatzAnzahl?: number; vertraege: Vertrag[]; children?: React.ReactNode }) {
  const anzahl = vertraege.length + zusatzAnzahl
  if (anzahl === 0) return null
  return (
    <section className="min-w-0 space-y-2" aria-label={titel}>
      <h2 className="flex flex-wrap items-baseline gap-x-2 px-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {titel}
        <span className="text-xs font-normal normal-case tracking-normal text-muted-foreground/70">
          {anzahl}
        </span>
      </h2>
      {/* Kein overflow-hidden: die Hover-Karten der Hinweise ragen aus der Liste. */}
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {vertraege.map(v => <VertragZeile key={v.id} v={v} {...rest} />)}
        {children}
      </ul>
    </section>
  )
}

function VertragZeile({ v, konten, kategorien, abgleich, locale, dateFormat, heute }: Gemeinsam & { v: Vertrag }) {
  const umbuchung = istUmbuchung(v.type)
  const name = (id: string | null) => konten.find(k => k.id === id)?.name
  const kategorie = kategorien.find(k => k.id === v.category_id)?.name
  const k = kuendigung(v, heute)
  const naechste = v.is_active ? naechsterTermin(v, heute) : null
  const tage = naechste ? tageZwischen(heute, naechste) : null
  const a = v.is_active ? abgleich.get(v.id) : undefined
  const monatlich = v.frequency !== 'monthly' ? proMonat(v.amount, v.frequency) : null

  const meta = umbuchung
    ? `${name(v.account_id) ?? '—'} → ${name(v.to_account_id) ?? '—'}`
    : [v.provider, name(v.account_id), kategorie].filter(Boolean).join(' · ')

  return (
    <li className={`group flex items-start gap-2 px-3 py-3 transition-colors hover:bg-muted/30 first:rounded-t-lg last:rounded-b-lg sm:px-4 ${v.is_active ? '' : 'opacity-60'}`}>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-baseline justify-between gap-3">
          <Link href={`/finance/contracts/${v.id}`} className="min-w-0 truncate font-medium underline-offset-2 hover:underline">
            {v.name}
          </Link>
          <span className={`shrink-0 text-sm font-medium tabular-nums ${umbuchung ? '' : 'text-danger'}`}>
            {umbuchung ? '' : '−'}{fmtCurrency(v.amount, v.currency, locale, { fractionDigits: 2 })}
            <span className="ml-1 text-xs font-normal text-muted-foreground">/ {PRO[v.frequency] ?? v.frequency}</span>
          </span>
        </div>

        <p className="truncate text-xs text-muted-foreground">
          {TYP[v.type] ?? v.type}{meta ? ` · ${meta}` : ''}
          {!v.is_active && ' · inaktiv'}
        </p>

        {(naechste || monatlich !== null) && (
          <p className="flex min-w-0 flex-wrap justify-between gap-x-3 text-xs text-muted-foreground">
            {naechste && tage !== null && (
              <span className="truncate">
                Nächste Zahlung {datumText(naechste, dateFormat)} <span className="text-muted-foreground/70">({relativTage(tage)})</span>
              </span>
            )}
            {monatlich !== null && v.currency === 'EUR' && (
              <span className="tabular-nums">≈ {fmtCurrency(monatlich, 'EUR', locale, { fractionDigits: 2 })} / Monat</span>
            )}
          </p>
        )}

        {v.is_active && (
          <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
            {a && <AbgleichHinweis abgleich={a} dateFormat={dateFormat} />}
            <KuendigungHinweis k={k} endDate={v.end_date} dateFormat={dateFormat} autoRenews={v.auto_renews === true} />
          </div>
        )}
      </div>

      <div className={`${AKTIONEN} flex-col md:flex-row`}>
        <EditContractDialog contract={v} accounts={konten} categories={kategorien} />
        <DeleteContractButton contract={v} />
      </div>
    </li>
  )
}

/** Depot-Sparpläne (nur Anzeige, bearbeitet wird im Depot) als Zeilen der Gruppe „Sparraten“. */
export function DepotPlanZeilen({ plaene, locale, dateFormat, heute }: { plaene: SavingsPlanRow[]; locale: string; dateFormat: string; heute: string }) {
  return (
    <>
      {plaene.map(p => {
        const naechste = p.is_active ? naechsteAusfuehrung(p.execution_day, heute) : null
        return (
          <li key={p.id} className={`group flex items-start gap-2 px-3 py-3 transition-colors hover:bg-muted/30 first:rounded-t-lg last:rounded-b-lg sm:px-4 ${p.is_active ? '' : 'opacity-60'}`}>
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-1.5 font-medium">
                  <TrendingUp className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <Link href="/depot" className="min-w-0 truncate underline-offset-2 hover:underline">{p.fund_name}</Link>
                </span>
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  {fmtCurrency(p.monthly_amount, 'EUR', locale, { fractionDigits: 2 })}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">/ Monat</span>
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                Depot-Sparplan · <span className="font-mono">{p.isin}</span>{!p.is_active && ' · pausiert'}
              </p>
              {naechste && (
                <p className="truncate text-xs text-muted-foreground">
                  Nächste Ausführung {datumText(naechste, dateFormat)} · Tag {p.execution_day} des Monats
                </p>
              )}
            </div>
            <div className={AKTIONEN}>
              <Link
                href="/depot" aria-label={`${p.fund_name} im Depot bearbeiten`}
                className="inline-flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:size-8"
              >
                <ExternalLink className="size-3.5" />
              </Link>
            </div>
          </li>
        )
      })}
    </>
  )
}
