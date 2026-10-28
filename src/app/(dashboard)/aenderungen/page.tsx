import { hatPartner } from '@/lib/haushalt/scope'
import Link from 'next/link'
import { History } from 'lucide-react'
import { requireAuthUser } from '@/lib/supabase/server'
import { resolveScope } from '@/lib/haushalt/resolve'
import { ladeVerlauf } from '@/lib/data/aenderungen'
import { BEREICHE, ZEITRAEUME, datumDe, relativeZeit } from '@/lib/aenderungen/format'
import { Button } from '@/components/ui/button'
import { LeerZustand } from '@/components/leer/LeerZustand'

const SELECT =
  'h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

type SP = Record<string, string | string[] | undefined>
const erster = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

export default async function AenderungenPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const { supabase, user } = await requireAuthUser()
  const ctx = await resolveScope(supabase, user!)

  const bereich = BEREICHE.some(b => b.key === erster(sp.bereich)) ? erster(sp.bereich) : ''
  const zeitraum = ZEITRAEUME.some(z => z.key === erster(sp.zeitraum)) ? erster(sp.zeitraum) : 'alle'
  const personRoh = erster(sp.person)
  const person =
    personRoh === 'ich' || personRoh === 'system' || ctx.members.some(m => m.id === personRoh) ? personRoh : ''
  const cursor = erster(sp.cursor)

  const seite = await ladeVerlauf(supabase, ctx, { bereich, zeitraum, person, cursor })
  const mehrere = hatPartner(ctx)
  const gefiltert = Boolean(bereich || person || zeitraum !== 'alle')

  const andere = ctx.members.filter(m => m.id !== ctx.userId)
  const naechsterHref = seite.naechsterCursor
    ? `/aenderungen?${new URLSearchParams({
        ...(bereich ? { bereich } : {}),
        ...(person ? { person } : {}),
        ...(zeitraum !== 'alle' ? { zeitraum } : {}),
        cursor: seite.naechsterCursor,
      }).toString()}`
    : null

  return (
    <div className="min-w-0 space-y-4 p-4 sm:p-8">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Änderungen</h1>
        <p className="text-sm text-muted-foreground">
          {mehrere
            ? 'Wer im Haushalt wann was geändert hat. Automatische Änderungen (Bank-Sync, Regeln, KI) erscheinen als System.'
            : 'Deine letzten Änderungen. Sobald jemand deinem Haushalt beitritt, siehst du hier auch dessen Änderungen.'}
        </p>
      </div>

      <form method="get" action="/aenderungen" className="grid gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Bereich
          <select name="bereich" defaultValue={bereich} className={SELECT}>
            <option value="">Alle Bereiche</option>
            {BEREICHE.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Person
          <select name="person" defaultValue={person} className={SELECT}>
            <option value="">Alle</option>
            <option value="ich">Du</option>
            {andere.map(m => <option key={m.id} value={m.id}>{m.name?.trim() || 'Mitglied'}</option>)}
            <option value="system">System</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Zeitraum
          <select name="zeitraum" defaultValue={zeitraum} className={SELECT}>
            {ZEITRAEUME.map(z => <option key={z.key} value={z.key}>{z.label}</option>)}
          </select>
        </label>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Filtern</Button>
          {gefiltert && (
            <Button asChild variant="ghost" size="sm"><Link href="/aenderungen">Zurücksetzen</Link></Button>
          )}
        </div>
      </form>

      {seite.eintraege.length === 0 ? (
        <LeerZustand
          icon={History}
          titel={gefiltert || cursor ? 'Keine passenden Änderungen' : 'Noch keine Änderungen'}
          text={
            gefiltert || cursor
              ? 'Mit diesen Filtern gibt es keine Einträge. Wähle einen größeren Zeitraum oder setze die Filter zurück.'
              : 'Sobald etwas an Konten, Verträgen, Schulden, Sparzielen oder dem Inventar geändert wird, steht es hier.'
          }
          sekundaer={gefiltert || cursor ? { label: 'Filter zurücksetzen', href: '/aenderungen' } : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Wann</th>
                <th className="px-3 py-2 font-medium">Wer</th>
                <th className="px-3 py-2 font-medium">Was</th>
              </tr>
            </thead>
            <tbody>
              {seite.eintraege.map(e => (
                <tr key={e.id} className="border-b border-border/60 last:border-0 align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground" title={datumDe(e.wann)}>
                    {relativeZeit(e.wann)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium">{e.wer}</td>
                  <td className="px-3 py-2">
                    <span className="text-muted-foreground">{e.art}</span>{' '}
                    {e.href ? (
                      <Link href={e.href} className="font-medium underline-offset-4 hover:underline">{e.objekt}</Link>
                    ) : (
                      <span className="font-medium">{e.objekt}</span>
                    )}
                    <span className="text-muted-foreground">: {e.aktion}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(naechsterHref || cursor) && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {cursor && (
            <Link
              href={`/aenderungen?${new URLSearchParams({
                ...(bereich ? { bereich } : {}),
                ...(person ? { person } : {}),
                ...(zeitraum !== 'alle' ? { zeitraum } : {}),
              }).toString()}`}
              className="text-muted-foreground underline-offset-4 hover:underline"
            >
              Zurück zu den neuesten
            </Link>
          )}
          {naechsterHref && (
            <Button asChild variant="outline" size="sm"><Link href={naechsterHref}>Ältere Änderungen</Link></Button>
          )}
        </div>
      )}
    </div>
  )
}
