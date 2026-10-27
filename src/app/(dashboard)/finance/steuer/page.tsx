import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/server'
import { ladeSteuerdaten } from '@/lib/tax/laden'
import { berechneSteuerposition } from '@/lib/tax/position'
import { AlertTriangle, ArrowRight, Calculator } from 'lucide-react'
import { LeerZustand } from '@/components/leer/LeerZustand'

const euro = (n: number) =>
  n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })

const prozent = (n: number) =>
  `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`

const menge = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 6 })

const datum = (iso: string) => {
  const [j, m, t] = iso.split('-')
  return `${t}.${m}.${j}`
}

const ROLLEN_LABEL: Record<string, string> = {
  betriebseinnahme: 'Betriebseinnahme',
  betriebsausgabe: 'Betriebsausgabe',
  lohn: 'Lohn',
  privat: 'Privat',
}

const AMPEL: Record<string, { text: string; klasse: string }> = {
  gruen:     { text: 'Innerhalb der Grenzen',        klasse: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  gelb:      { text: 'Nähert sich einer Grenze',     klasse: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  rot:       { text: 'Grenze überschritten',        klasse: 'bg-destructive/10 text-destructive' },
  unbekannt: { text: 'Vorjahr unbekannt',            klasse: 'bg-muted text-muted-foreground' },
}

function Kennzahl({
  label, wert, fussnote, gross = false,
}: { label: string; wert: string; fussnote?: string; gross?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 font-semibold tabular-nums ${gross ? 'text-2xl' : 'text-lg'}`}>{wert}</div>
      {fussnote && <div className="mt-1 text-xs text-muted-foreground tabular-nums">{fussnote}</div>}
    </div>
  )
}

export default async function SteuerPage({
  searchParams,
}: {
  searchParams: Promise<{ jahr?: string }>
}) {
  const { supabase, user } = await getAuthUser()
  if (!user) redirect('/login')

  const { jahr: jahrParam } = await searchParams
  const geparst = Number(jahrParam)
  const jahr = Number.isInteger(geparst) && geparst >= 2020 && geparst <= 2100
    ? geparst
    : new Date().getFullYear()

  // Fehlt der Tarif oder bricht eine Abfrage, wird das gesagt und nicht mit
  // halben Daten gerechnet -- eine falsche Steuerzahl ist schlimmer als keine.
  // Die Konten-Zaehlung (unten fuer den Leerzustand) ist unabhaengig von den Steuerdaten: gleich mitstarten.
  const kontenZaehlung = Promise.resolve(
    supabase.from('accounts').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
  )
  let daten
  try {
    ;[daten] = await Promise.all([ladeSteuerdaten(supabase, user.id, jahr), kontenZaehlung])
  } catch (fehler) {
    return (
      <div className="p-4 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Steuer {jahr}</h1>
        <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          {fehler instanceof Error ? fehler.message : 'Die Steuerposition ist nicht berechenbar.'}
        </div>
      </div>
    )
  }

  // Wirklich nichts da (keine eigenen Konten, keine steuerrelevanten Betraege, kein Kraken): erklaeren
  // statt einer Steuerposition aus lauter Nullen. Wer Daten hat, kommt hier nie hinein.
  const { count: eigeneKonten } = await kontenZaehlung
  const e = daten.eingaben
  const steuerLeer = (eigeneKonten ?? 0) === 0 && daten.krypto === null
    && e.betriebseinnahmen === 0 && e.betriebsausgaben === 0 && e.lohnNettoImJahr === 0
  if (steuerLeer) {
    return (
      <div className="space-y-4 p-4 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Steuer {jahr}</h1>
        <LeerZustand
          icon={Calculator}
          titel="Noch keine steuerrelevanten Daten"
          text="Die Steuerposition rechnet aus deinen Buchungen: Betriebseinnahmen und -ausgaben, Lohn und Krypto-Gewinne. Sie erscheint, sobald Konten mit Buchungen da sind und Kategorien eine steuerliche Rolle tragen."
          aktion={{ label: 'Konto anlegen', href: '/finance/accounts' }}
          sekundaer={{ label: 'Kategorien öffnen', href: '/finance/categories' }}
        />
      </div>
    )
  }

  const p = berechneSteuerposition(daten.eingaben)
  const ampel = AMPEL[p.kleinunternehmer.status]
  const jahre = [jahr - 1, jahr, jahr + 1]
  const heute = new Date().toISOString().slice(0, 10)

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Steuer {jahr}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Einkommensteuer nach § 32a EStG, Tarif {p.tarif.jahr} (geprüft {p.tarif.geprueft_am})
          </p>
        </div>
        <div className="flex gap-1">
          {jahre.map(j => (
            <Link
              key={j}
              href={`/finance/steuer?jahr=${j}`}
              className={`rounded-md px-3 py-1.5 text-sm ${
                j === jahr ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-muted/50'
              }`}
            >
              {j}
            </Link>
          ))}
        </div>
      </div>

      {/* Warnungen zuerst. Eine geschätzte Steuerzahl ohne ihre Einschränkung
          ist die eigentliche Gefahr dieser Seite. */}
      {p.warnungen.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 space-y-1.5">
          {p.warnungen.map(w => (
            <div key={w} className="flex gap-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Die Kernzahl steht zuerst und allein: der Grenzsteuersatz. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kennzahl
          label="Grenzsteuersatz auf den nächsten Euro"
          wert={prozent(p.grenzsteuersatz.naechster_euro_pct)}
          fussnote="Die belastbare Zahl — Abzüge verschieben sie nur an Zonengrenzen"
          gross
        />
        <Kennzahl
          label="Von 1.000 € Auftrag bleiben"
          wert={euro(p.grenzsteuersatz.von_1000_bleiben)}
          fussnote={`Effektiv ${prozent(p.grenzsteuersatz.naechste_1000_pct)} auf die nächsten 1.000 €`}
          gross
        />
        <Kennzahl
          label="Gewinn Schuck Webdesign"
          wert={euro(p.betrieb.gewinn)}
          fussnote={`${euro(p.betrieb.einnahmen)} Einnahmen − ${euro(p.betrieb.ausgaben)} Ausgaben`}
        />
        <Kennzahl
          label="Der Gewinn kostet"
          wert={euro(p.gewinn_kostet.steuer)}
          fussnote="Steuer mit dem Gewinn minus Steuer ohne ihn"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Rechenweg offen hinlegen -- eine Steuerschätzung, deren Weg man
            nicht sieht, kann man nicht prüfen. */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Rechenweg</h2>
          <div className="rounded-lg border border-border bg-card divide-y divide-border text-sm">
            {[
              ['Bruttojahreslohn', euro(p.lohn.brutto), p.lohn.quelle === 'geschaetzt' ? 'geschätzt' : 'aus den Einstellungen'],
              ['− Werbungskostenpauschale', euro(-p.zve.abzuege.werbungskosten), ''],
              ['− Vorsorgeaufwand (pauschal)', euro(-p.zve.abzuege.vorsorge), 'geschätzt'],
              ['+ Gewinn', euro(p.betrieb.gewinn), ''],
              ...(p.krypto.zuVersteuern > 0 ? [['+ Krypto-Gewinne (§ 23 EStG)', euro(p.krypto.zuVersteuern), 'Kraken']] : []),
              ['− Sonderausgabenpauschale', euro(-p.zve.abzuege.sonderausgaben), ''],
            ].map(([label, wert, hinweis]) => (
              <div key={label} className="flex items-baseline justify-between gap-3 px-4 py-2">
                <span className="text-muted-foreground">{label}</span>
                <span className="flex items-baseline gap-2">
                  {hinweis && <span className="text-xs text-muted-foreground">{hinweis}</span>}
                  <span className="tabular-nums">{wert}</span>
                </span>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-3 px-4 py-2 font-medium">
              <span>= zu versteuerndes Einkommen (Zone {p.zve.zone})</span>
              <span className="tabular-nums">{euro(p.zve.betrag)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3 px-4 py-2">
              <span className="text-muted-foreground">Einkommensteuer</span>
              <span className="tabular-nums">{euro(p.steuer.einkommensteuer)}</span>
            </div>
            {p.steuer.kirchensteuer > 0 && (
              <div className="flex items-baseline justify-between gap-3 px-4 py-2">
                <span className="text-muted-foreground">Kirchensteuer</span>
                <span className="tabular-nums">{euro(p.steuer.kirchensteuer)}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-3 px-4 py-2 font-semibold">
              <span>Gesamt (Schätzung)</span>
              <span className="tabular-nums">{euro(p.steuer.gesamt)}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Kein Steuerbescheid. Größte Unsicherheit ist der Vorsorgeaufwand — die echten Beiträge zu
            Renten-, Kranken- und Pflegeversicherung kennt die App nicht.{' '}
            <Link href="/settings" className="underline">Steuerprofil anpassen</Link>
          </p>
        </section>

        <div className="space-y-6">
          {/* Kleinunternehmer */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Kleinunternehmer § 19 UStG</h2>
            <div className="rounded-lg border border-border bg-card px-4 py-3 space-y-3">
              <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${ampel.klasse}`}>
                {ampel.text}
              </span>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Umsatz {jahr}</span>
                  <span className="tabular-nums">
                    {euro(p.kleinunternehmer.umsatz_laufend)} von {euro(p.kleinunternehmer.grenze_laufend)}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Umsatz {jahr - 1}</span>
                  <span className="tabular-nums">
                    {p.kleinunternehmer.umsatz_vorjahr === null
                      ? 'keine Daten'
                      : `${euro(p.kleinunternehmer.umsatz_vorjahr)} von ${euro(p.kleinunternehmer.grenze_vorjahr)}`}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Rücklage */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Steuerrücklage</h2>
            <div className="rounded-lg border border-border bg-card px-4 py-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Soll</span>
                <span className="tabular-nums">{euro(p.ruecklage.soll)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Zurückgelegt</span>
                <span className="tabular-nums">
                  {p.ruecklage.ist === null ? 'kein Sparziel angelegt' : euro(p.ruecklage.ist)}
                </span>
              </div>
              {p.ruecklage.luecke !== null && p.ruecklage.luecke > 0 && (
                <div className="flex justify-between gap-3 font-medium">
                  <span>Lücke</span>
                  <span className="tabular-nums">{euro(p.ruecklage.luecke)}</span>
                </div>
              )}
              {p.ruecklage.ist === null && (
                <Link
                  href="/finance/goals"
                  className="inline-flex items-center gap-1 pt-1 text-sm underline"
                >
                  Sparziel „Steuerrücklage {jahr}&ldquo; anlegen <ArrowRight className="size-3.5" />
                </Link>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Krypto: eigene Einkunftsart (§ 23 EStG), deshalb eigener Abschnitt mit eigenen Einschränkungen. */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Krypto-Veräußerungen {jahr} (§ 23 EStG, Kraken)</h2>
          <p className="text-xs text-muted-foreground">
            FIFO über die gespeicherte Kraken-Historie. Gewinne nach mehr als einem Jahr Haltedauer sind steuerfrei;
            bleibt der Saldo der übrigen unter {euro(daten.krypto?.freigrenzeEur ?? 1000)}, ist er ebenfalls steuerfrei
            (Freigrenze: ab dem ersten Euro darüber wird alles steuerpflichtig).
          </p>
        </div>

        {daten.kryptoFehler && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
            Die Krypto-Daten konnten nicht geladen werden, die Steuer oben enthält sie deshalb nicht: {daten.kryptoFehler}
          </div>
        )}

        {daten.krypto && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kennzahl
                label="Steuerpflichtiger Saldo"
                wert={euro(daten.krypto.ergebnis.saldoSteuerpflichtigEur)}
                fussnote="Verkäufe innerhalb der Haltefrist"
              />
              <Kennzahl
                label="Davon zu versteuern"
                wert={euro(daten.krypto.ergebnis.zuVersteuernEur)}
                fussnote={
                  daten.krypto.ergebnis.zuVersteuernEur > 0
                    ? 'Über der Freigrenze: der ganze Betrag zählt'
                    : daten.krypto.ergebnis.saldoSteuerpflichtigEur > 0
                      ? `Noch ${euro(daten.krypto.freigrenzeEur - daten.krypto.ergebnis.saldoSteuerpflichtigEur - 0.01)} bis zur Freigrenze`
                      : 'Kein Gewinn innerhalb der Haltefrist'
                }
                gross
              />
              <Kennzahl
                label="Steuerfreier Gewinn"
                wert={euro(daten.krypto.ergebnis.steuerfreierGewinnEur)}
                fussnote="Verkäufe nach mehr als einem Jahr"
              />
              <Kennzahl
                label="Steuer auf Krypto"
                wert={euro(p.krypto.steuer)}
                fussnote="Mehrsteuer, steckt in der Rücklage"
              />
            </div>

            {daten.krypto.warnungen.length > 0 && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 space-y-1.5">
                {daten.krypto.warnungen.map(w => (
                  <div key={w} className="flex gap-2 text-sm">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            {daten.krypto.veraeusserungenImJahr.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2 font-normal">Datum</th>
                      <th className="px-4 py-2 font-normal">Asset</th>
                      <th className="px-4 py-2 text-right font-normal">Menge</th>
                      <th className="hidden px-4 py-2 text-right font-normal sm:table-cell">Erlös</th>
                      <th className="px-4 py-2 text-right font-normal">Gewinn</th>
                      <th className="px-4 py-2 text-right font-normal">Steuerpflichtig</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {daten.krypto.veraeusserungenImJahr.map(v => (
                      <tr key={v.veraeusserungId}>
                        <td className="px-4 py-2 tabular-nums">{datum(v.date)}</td>
                        <td className="px-4 py-2">{v.asset}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{menge(v.quantity)}</td>
                        <td className="hidden px-4 py-2 text-right tabular-nums sm:table-cell">{euro(v.erloesEur)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{euro(v.gewinnEur)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {euro(v.steuerpflichtigerGewinnEur)}
                          {v.fehlmenge > 0 && <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">Fehlmenge {menge(v.fehlmenge)}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {daten.krypto.fifo.offeneLose.length > 0 && (
              <div className="space-y-1.5">
                <h3 className="text-xs font-semibold text-muted-foreground">Bestand: ab wann ein Verkauf steuerfrei ist</h3>
                <div className="rounded-lg border border-border bg-card divide-y divide-border text-sm">
                  {daten.krypto.fifo.offeneLose.slice(0, 10).map(l => (
                    <div key={`${l.anschaffungId}-${l.wallet}-${l.quantity}`} className="flex items-baseline justify-between gap-3 px-4 py-2">
                      <span>
                        {menge(l.quantity)} {l.asset}
                        <span className="ml-2 text-xs text-muted-foreground">
                          gekauft {datum(l.anschaffungDatum)} · Kosten {euro(l.kostenEur)}{l.wallet === 'extern' ? ' · ausgezahlt' : ''}
                        </span>
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {l.steuerfreiAb <= heute ? 'bereits steuerfrei' : `steuerfrei ab ${datum(l.steuerfreiAb)}`}
                      </span>
                    </div>
                  ))}
                </div>
                {daten.krypto.fifo.offeneLose.length > 10 && (
                  <p className="text-xs text-muted-foreground">Die nächsten 10 von {daten.krypto.fifo.offeneLose.length} Losen, nach Datum sortiert.</p>
                )}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Keine Steuerberatung. Offen mit dem Steuerberater: ob die Finanzverwaltung die Berechnung je Wallet
              (BMF-Schreiben vom 06.03.2025) oder im Gesamtverfahren verlangt. Mit Kraken als einziger Wallet ist
              das Ergebnis dasselbe.{' '}
              <Link href="/crypto" className="underline">Kraken synchronisieren</Link>
            </p>
          </>
        )}
      </section>

      {/* Nicht zugeordnete Einnahmen -- der Grund, warum eine Zahl zu niedrig
          sein kann. Gehört sichtbar auf die Seite, nicht in eine Fußnote. */}
      {p.unzugeordnet.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Einnahmen ohne steuerliche Rolle</h2>
          <div className="rounded-lg border border-border bg-card divide-y divide-border text-sm">
            {p.unzugeordnet.map(u => (
              <div key={u.kategorie} className="flex items-baseline justify-between gap-3 px-4 py-2">
                <span>{u.kategorie}</span>
                <span className="tabular-nums">{euro(u.betrag)}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Diese Beträge sind in der Rechnung oben NICHT enthalten.{' '}
            <Link href="/finance/categories" className="underline">Rolle in den Kategorien setzen</Link>
            {' '}— was steuerlich nicht zählt, gehört auf „Privat&ldquo;.
          </p>
        </section>
      )}

      {/* Zuordnung, damit nachvollziehbar ist, woraus der Gewinn entsteht. */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Zuordnung der Kategorien</h2>
        <div className="rounded-lg border border-border bg-card divide-y divide-border text-sm">
          {daten.rollen.filter(r => r.rolle !== null).length === 0 ? (
            <div className="px-4 py-6 text-center text-muted-foreground">
              Noch keine Kategorie steuerlich zugeordnet — deshalb ist der Gewinn 0.{' '}
              <Link href="/finance/categories" className="underline">Jetzt zuordnen</Link>
            </div>
          ) : (
            daten.rollen
              .filter(r => r.rolle !== null)
              .map(r => (
                <div key={r.kategorie} className="flex items-baseline justify-between gap-3 px-4 py-2">
                  <span>
                    {r.kategorie}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {ROLLEN_LABEL[r.rolle as string] ?? r.rolle}
                    </span>
                  </span>
                  <span className="tabular-nums">{euro(r.summe)}</span>
                </div>
              ))
          )}
        </div>
      </section>
    </div>
  )
}
