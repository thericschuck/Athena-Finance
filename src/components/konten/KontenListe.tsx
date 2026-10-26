'use client'

import Link from 'next/link'
import { AlertTriangle, ArrowDown, ArrowUp, Landmark } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AccountSparkline } from '@/components/finance/account-sparkline'
import { EditAccountDialog, DeleteAccountButton } from '@/components/finance/account-form'
import { AnalyseKennzahlInfo } from '@/components/analyse/AnalyseKennzahlInfo'
import { SaldoSetzenDialog } from '@/components/konten/SaldoSetzenDialog'
import { AbweichungAusgleichen } from '@/components/konten/AbweichungAusgleichen'
import { useKontenSortierung } from '@/components/konten/KontenSortierung'
import { fmtCurrency } from '@/lib/format'
import { TYP_LABELS } from '@/lib/konten/berechnen'
import type { StandAnzeige } from '@/lib/konten/berechnen'
import type { KontoGruppeKey, KontoZeile } from '@/lib/konten/typen'

/**
 * Gruppen der Konten-Liste: je Gruppe eine Kopfzeile (Name, Anzahl, Zwischensumme) und darunter die
 * Konten in EINEM Rahmen mit Trennlinien. Client-Insel, weil der Sortiermodus (▲▼) und die Dialoge
 * Zustand brauchen; alle Werte (Stand-Text, Zwischensummen) kommen fertig vom Server.
 *
 * Zeilenlayout: ein Grid für Handy und Desktop, die Zellen wandern per Klassen
 *   Handy  (2 Spalten):  Name | Saldo  /  Typ · Institution | Δ  /  Marken + Stand | Aktionen
 *   Desktop (md, 5 Sp.): Name+Typ | Verlauf+Δ | Stand | Saldo | Aktionen
 */

export interface KontoAnzeige {
  zeile: KontoZeile
  stand: StandAnzeige | null
}

export interface GruppeAnzeige {
  key: KontoGruppeKey
  label: string
  summe: number
  fremdwaehrung: number
  konten: KontoAnzeige[]
}

const KRYPTO = ['BTC', 'ETH']

function fmtSaldo(n: number, waehrung: string, locale: string): string {
  return KRYPTO.includes(waehrung)
    ? `${n.toFixed(6)} ${waehrung}`
    : fmtCurrency(n, waehrung, locale, { fractionDigits: 2 })
}

const fmtTag = (iso: string, locale: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC' })

const CHIP = 'inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground'

export function KontenListe({ gruppen, locale }: { gruppen: GruppeAnzeige[]; locale: string }) {
  const sort = useKontenSortierung()
  return (
    <div className="space-y-5">
      {gruppen.map((g) => {
        const nachId = new Map(g.konten.map((k) => [k.zeile.id, k]))
        const reihenfolge = sort.idsVon(g.key)
        const konten = reihenfolge.length === g.konten.length
          ? reihenfolge.map((id) => nachId.get(id)).filter((k): k is KontoAnzeige => Boolean(k))
          : g.konten
        return (
          <section key={g.key} aria-label={g.label}>
            <header className="mb-1.5 flex items-baseline justify-between gap-3 px-1">
              <h2 className="min-w-0 truncate text-sm font-semibold">
                {g.label}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">{g.konten.length}</span>
              </h2>
              <span className="flex shrink-0 items-baseline gap-2 text-sm tabular-nums">
                {g.fremdwaehrung > 0 && (
                  <span className="text-[11px] text-muted-foreground">
                    + {g.fremdwaehrung} in anderer Währung
                  </span>
                )}
                <span className={`font-semibold ${g.summe < 0 ? 'text-danger' : ''}`}>
                  {fmtCurrency(g.summe, 'EUR', locale, { fractionDigits: 2 })}
                </span>
              </span>
            </header>
            <ul className="rounded-lg border border-border bg-card">
              {konten.map((k, i) => (
                <Zeile
                  key={k.zeile.id}
                  k={k}
                  locale={locale}
                  gruppe={g.key}
                  erste={i === 0}
                  letzte={i === konten.length - 1}
                />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function Marken({ z, locale }: { z: KontoZeile; locale: string }) {
  return (
    <>
      {z.istBank && (
        <AnalyseKennzahlInfo
          className={`${CHIP} cursor-help outline-none focus-visible:ring-2 focus-visible:ring-ring`}
          titel="Bankkonto"
          zeilen={z.bankIban ? [['IBAN', z.bankIban]] : []}
          text="Per FinTS mit der Bank verbunden: der Saldo ist der von der Bank gemeldete, nicht die Summe der Buchungen."
        >
          <Landmark className="size-2.5" aria-hidden />
          Bank
        </AnalyseKennzahlInfo>
      )}
      {!z.aktiv && <span className={CHIP}>inaktiv</span>}
      {z.currency !== 'EUR' && <span className={CHIP}>{z.currency}</span>}
      {z.abweichung !== null && z.saldo !== null && z.buchungssumme !== null && (
        <span className="inline-flex items-center gap-1.5">
          <AnalyseKennzahlInfo
            className="inline-flex cursor-help items-center gap-1 rounded-full bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-warning outline-none focus-visible:ring-2 focus-visible:ring-ring"
            titel="Abweichung zu den Buchungen"
            zeilen={[
              ['Saldo der Bank', fmtCurrency(z.saldo, z.currency, locale, { fractionDigits: 2 })],
              ['Summe der Buchungen', fmtCurrency(z.buchungssumme, z.currency, locale, { fractionDigits: 2 })],
            ]}
            text={`Die Bank meldet ${fmtCurrency(z.saldo, z.currency, locale, { fractionDigits: 2 })}, die Buchungen summieren sich auf ${fmtCurrency(z.buchungssumme, z.currency, locale, { fractionDigits: 2 })}. Umbuchungen und alle Buchungen im Zeitfenster sind dabei schon eingerechnet — es fehlt der Saldo vor der ersten Buchung (FinTS liefert nur ein Zeitfenster). Der angezeigte Saldo ist der der Bank; „Ausgleichen“ bucht den fehlenden Anfangsbestand.`}
          >
            <AlertTriangle className="size-2.5" aria-hidden />
            Abweichung {z.abweichung > 0 ? '+' : '−'}{fmtCurrency(Math.abs(z.abweichung), z.currency, locale, { fractionDigits: 0 })}
          </AnalyseKennzahlInfo>
          <AbweichungAusgleichen
            kontoId={z.id}
            name={z.name}
            abweichung={z.abweichung}
            waehrung={z.currency}
            locale={locale}
          />
        </span>
      )}
    </>
  )
}

function StandText({ stand }: { stand: StandAnzeige | null }) {
  if (!stand) return null
  return (
    <span className={`text-[11px] ${stand.ton === 'alt' ? 'text-warning' : 'text-muted-foreground'}`}>
      {stand.text}
    </span>
  )
}

function Zeile({
  k, locale, gruppe, erste, letzte,
}: {
  k: KontoAnzeige
  locale: string
  gruppe: KontoGruppeKey
  erste: boolean
  letzte: boolean
}) {
  const sort = useKontenSortierung()
  const { zeile: z, stand } = k
  const ids = sort.idsVon(gruppe)
  const pos = ids.indexOf(z.id)
  const ausgegraut = z.aktiv ? '' : 'opacity-60'
  const kontoRow = {
    id: z.id, name: z.name, type: z.type, institution: z.institution, currency: z.currency,
    color: z.color, iban: z.iban, bank_iban: z.bankIban, is_active: z.aktiv, sort_order: z.sortOrder,
  }
  const delta = z.delta
  const verlaufTitel = z.verlauf && z.verlauf.values.length >= 2
    ? [['Von', fmtTag(z.verlauf.first, locale)], ['Bis', fmtTag(z.verlauf.last, locale)]] as [string, string][]
    : null

  const deltaText = delta === null ? null : (
    <span className={`text-[11px] tabular-nums ${delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-muted-foreground'}`}>
      {delta > 0 ? '+' : delta < 0 ? '−' : ''}
      {KRYPTO.includes(z.currency)
        ? Math.abs(delta).toFixed(6)
        : fmtCurrency(Math.abs(delta), z.currency, locale, { fractionDigits: 0 })}
    </span>
  )

  return (
    <li
      className={`group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-t border-border px-3 py-2.5 transition-colors first:border-t-0 hover:bg-muted/30 md:grid-cols-[minmax(0,1fr)_9.5rem_8.5rem_9rem_auto] md:gap-x-4 ${erste ? 'rounded-t-lg' : ''} ${letzte ? 'rounded-b-lg' : ''}`}
    >
      {/* Name + Marken (Desktop) */}
      <div className={`col-start-1 row-start-1 flex min-w-0 items-center gap-2 ${ausgegraut}`}>
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: z.color ?? 'var(--muted-foreground)' }}
          aria-hidden
        />
        <Link
          href={`/finance/accounts/${z.id}`}
          className="min-w-0 truncate py-1 text-sm font-medium text-foreground hover:underline"
        >
          {z.name}
        </Link>
        <span className="hidden shrink-0 items-center gap-1.5 md:inline-flex">
          <Marken z={z} locale={locale} />
        </span>
      </div>

      {/* Typ · Institution */}
      <p className={`col-start-1 row-start-2 min-w-0 truncate pl-[18px] text-xs text-muted-foreground ${ausgegraut}`}>
        {TYP_LABELS[z.type] ?? z.type}
        {z.institution ? ` · ${z.institution}` : ''}
      </p>

      {/* Saldo */}
      <p className={`col-start-2 row-start-1 text-right text-sm font-medium tabular-nums md:col-start-4 md:row-span-2 ${ausgegraut} ${z.saldo !== null && z.saldo < 0 ? 'text-danger' : ''}`}>
        {z.saldo === null ? <span className="text-muted-foreground">—</span> : fmtSaldo(z.saldo, z.currency, locale)}
      </p>

      {/* Verlauf + Δ: Handy nur die Δ-Zahl */}
      <div className={`col-start-2 row-start-2 flex items-center justify-end gap-2 md:col-start-2 md:row-start-1 md:row-span-2 md:justify-center ${ausgegraut}`}>
        {verlaufTitel ? (
          <AnalyseKennzahlInfo
            className="hidden cursor-help rounded outline-none focus-visible:ring-2 focus-visible:ring-ring md:block"
            titel="Verlauf im Zeitraum"
            zeilen={verlaufTitel}
            text="Der Verlauf deckt nur den Zeitraum ab, für den es Daten gibt; die Kurve ist immer auf volle Breite gestreckt."
          >
            <AccountSparkline values={z.verlauf?.values ?? []} color={z.color} uid={z.id} width={72} className="text-muted-foreground" />
          </AnalyseKennzahlInfo>
        ) : (
          <AccountSparkline values={[]} uid={z.id} width={72} className="hidden text-muted-foreground md:block" />
        )}
        {deltaText}
      </div>

      {/* Stand (Desktop) */}
      <div className={`hidden md:col-start-3 md:row-start-1 md:row-span-2 md:block ${ausgegraut}`}>
        <StandText stand={stand} />
      </div>

      {/* Marken + Stand (Handy) */}
      <div className={`col-start-1 row-start-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pl-[18px] md:hidden ${ausgegraut}`}>
        <StandText stand={stand} />
        <Marken z={z} locale={locale} />
      </div>

      {/* Aktionen: auf dem Handy immer sichtbar, am Desktop bei Hover/Fokus */}
      <div className={`col-start-2 row-start-3 flex items-center justify-end gap-0.5 opacity-100 transition-opacity focus-within:opacity-100 md:col-start-5 md:row-start-1 md:row-span-2 md:group-hover:opacity-100 ${sort.aktiv ? 'md:opacity-100' : 'md:opacity-0'}`}>
        {sort.aktiv ? (
          <>
            <Button
              variant="outline" size="icon" className="size-10 md:size-8"
              disabled={pos <= 0} onClick={() => sort.verschiebe(gruppe, z.id, -1)}
              aria-label={`${z.name} nach oben`}
            >
              <ArrowUp className="size-4" aria-hidden />
            </Button>
            <Button
              variant="outline" size="icon" className="size-10 md:size-8"
              disabled={pos < 0 || pos >= ids.length - 1} onClick={() => sort.verschiebe(gruppe, z.id, 1)}
              aria-label={`${z.name} nach unten`}
            >
              <ArrowDown className="size-4" aria-hidden />
            </Button>
          </>
        ) : (
          <>
            {!z.istBank && z.aktiv && (
              <SaldoSetzenDialog
                kontoId={z.id}
                name={z.name}
                aktuell={z.saldo ?? 0}
                waehrung={z.currency}
                locale={locale}
              />
            )}
            <EditAccountDialog account={kontoRow} />
            <DeleteAccountButton account={kontoRow} />
          </>
        )}
      </div>
    </li>
  )
}
