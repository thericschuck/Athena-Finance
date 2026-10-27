import Link from 'next/link'
import { HandCoins } from 'lucide-react'
import { requireAuthUser } from '@/lib/supabase/server'
import { resolveScope } from '@/lib/haushalt/resolve'
import { getSettings } from '@/lib/settings'
import { fmtCurrency } from '@/lib/format'
import { heuteBerlin } from '@/lib/transaktionen/formular'
import { ladeSchuldenSeite, type SchuldMitZahlungen } from '@/lib/data/schulden-seite'
import { istUeberfaellig, schuldenKennzahlen } from '@/lib/schulden/berechnen'
import { AddDebtDialog } from '@/components/finance/debt-payment-form'
import { SchuldenKennzahlenLeiste } from '@/components/schulden/SchuldenKennzahlenLeiste'
import { SchuldZeile } from '@/components/schulden/SchuldZeile'
import { cn } from '@/lib/utils'
import { LeerZustand } from '@/components/leer/LeerZustand'
import { ScopeHinweisFuer } from '@/components/leer/ScopeHinweisFuer'
import { letzteAenderungen } from '@/lib/data/aenderungen'

interface PageProps {
  searchParams: Promise<{ all?: string }>
}

export default async function DebtsPage({ searchParams }: PageProps) {
  const { all } = await searchParams
  const zeigeAbgeschlossene = all === '1'

  const { supabase, user } = await requireAuthUser()
  const settings = await getSettings(user!.id)
  const locale = (settings.number_format as string) ?? 'de-DE'
  const dateFormat = (settings.date_format as string) ?? 'dd.MM.yyyy'
  const heute = heuteBerlin()

  const ctx = await resolveScope(supabase, user!)
  const alle = await ladeSchuldenSeite(supabase, ctx)
  const kennzahlen = schuldenKennzahlen(alle, heute)
  const zuletzt = await letzteAenderungen(supabase, ctx, 'debts', alle.map(d => d.id))

  // Überfällige zuerst, dann größte Restschuld
  const sortiere = (a: SchuldMitZahlungen, b: SchuldMitZahlungen) =>
    Number(istUeberfaellig(b.due_date, heute)) - Number(istUeberfaellig(a.due_date, heute)) || b.outstanding - a.outstanding
  const aktive = alle.filter(d => d.is_active)
  const geliehen = aktive.filter(d => d.type === 'borrowed').sort(sortiere)
  const verliehen = aktive.filter(d => d.type === 'lent').sort(sortiere)
  const letzteZahlung = (d: SchuldMitZahlungen) => d.zahlungen[0]?.payment_date ?? d.angelegt
  const abgeschlossen = alle.filter(d => !d.is_active).sort((a, b) => (letzteZahlung(a) < letzteZahlung(b) ? 1 : -1))

  const summe = (liste: SchuldMitZahlungen[]) =>
    liste.filter(d => d.currency === 'EUR').reduce((s, d) => s + d.outstanding, 0)

  return (
    <div className="min-w-0 space-y-4 p-4 sm:p-8">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Schulden</h1>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {abgeschlossen.length > 0 && (
            <Link
              href={zeigeAbgeschlossene ? '/finance/debts' : '/finance/debts?all=1'}
              scroll={false}
              aria-pressed={zeigeAbgeschlossene}
              className={cn(
                'inline-flex h-10 items-center rounded-full border px-3 text-sm transition-colors md:h-8',
                zeigeAbgeschlossene
                  ? 'border-foreground/30 bg-accent font-medium text-foreground'
                  : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              Abgeschlossene ({abgeschlossen.length})
            </Link>
          )}
          <AddDebtDialog />
        </div>
      </div>

      {alle.length === 0 ? (
        <EmptyState ctx={ctx} />
      ) : (
        <>
          <SchuldenKennzahlenLeiste k={kennzahlen} locale={locale} />

          {aktive.length === 0 && !zeigeAbgeschlossene && (
            <div className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center">
              <p className="text-sm font-medium">Keine offenen Schulden</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Alles beglichen. Die {abgeschlossen.length} abgeschlossenen Einträge findest du über „Abgeschlossene“ oben.
              </p>
            </div>
          )}

          <div className="space-y-6">
            {geliehen.length > 0 && (
              <Abschnitt titel="Ich schulde" ton="danger" summe={summe(geliehen)} locale={locale} liste={geliehen} dateFormat={dateFormat} heute={heute} zuletzt={zuletzt} />
            )}
            {verliehen.length > 0 && (
              <Abschnitt titel="Mir wird geschuldet" ton="success" summe={summe(verliehen)} locale={locale} liste={verliehen} dateFormat={dateFormat} heute={heute} zuletzt={zuletzt} />
            )}
            {zeigeAbgeschlossene && abgeschlossen.length > 0 && (
              <Abschnitt titel="Abgeschlossen" summe={null} locale={locale} liste={abgeschlossen} dateFormat={dateFormat} heute={heute} zuletzt={zuletzt} />
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Abschnitt({
  titel, ton, summe, locale, liste, dateFormat, heute, zuletzt,
}: {
  zuletzt: Awaited<ReturnType<typeof letzteAenderungen>>
  titel: string
  ton?: 'danger' | 'success'
  summe: number | null
  locale: string
  liste: SchuldMitZahlungen[]
  dateFormat: string
  heute: string
}) {
  return (
    <section className="min-w-0 space-y-2">
      <h2 className="flex items-baseline justify-between gap-3 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="min-w-0 truncate">{titel} ({liste.length})</span>
        {summe !== null && (
          <span className={cn('shrink-0 tabular-nums normal-case tracking-normal', ton === 'danger' ? 'text-danger' : 'text-success')}>
            {fmtCurrency(summe, 'EUR', locale, { fractionDigits: 2 })}
          </span>
        )}
      </h2>
      <ul className="min-w-0 divide-y divide-border rounded-lg border border-border bg-card">
        {liste.map(s => (
          <SchuldZeile key={s.id} schuld={s} locale={locale} dateFormat={dateFormat} heute={heute} zuletzt={zuletzt.get(s.id)} />
        ))}
      </ul>
    </section>
  )
}

function EmptyState({ ctx }: { ctx: Parameters<typeof ScopeHinweisFuer>[0]['ctx'] }) {
  return (
    <div className="space-y-4">
      <ScopeHinweisFuer ctx={ctx} thema="Schulden" />
      <LeerZustand
        icon={HandCoins}
        titel="Noch keine Schulden erfasst"
        text="Trage Kredite, geliehenes oder verliehenes Geld ein. Mit jeder Zahlung sinkt die Restschuld, und du siehst Fortschritt, monatliche Last und wann du schuldenfrei bist."
        aktionNode={<AddDebtDialog />}
      />
    </div>
  )
}
