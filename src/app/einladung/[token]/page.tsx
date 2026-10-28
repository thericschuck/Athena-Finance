import type { Metadata } from 'next'
import Link from 'next/link'
import { getAuthUser } from '@/lib/supabase/server'
import { normalisiereEmail } from '@/lib/haushalt/einladung'
import { ladeEinladung, versuchErlaubt } from '@/lib/haushalt/einladung-server'
import { abmeldenFuerEinladung } from './actions'
import { EinladungFormulare } from './EinladungFormulare'

export const metadata: Metadata = { title: 'Einladung', robots: { index: false, follow: false } }
// Immer frisch: Gueltigkeit haengt von Zeit und Zustand ab.
export const dynamic = 'force-dynamic'

function Huelle({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-5 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-8">{children}</div>
    </main>
  )
}

export default async function EinladungPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  // Zu viele Aufrufe von einer Adresse (Token-Raten): gleiche Antwort wie bei ungueltiger Einladung.
  const erlaubt = await versuchErlaubt()
  const inv = erlaubt ? await ladeEinladung(token) : ({ ok: false } as const)

  if (!inv.ok) {
    return (
      <Huelle>
        <h1 className="text-xl font-semibold tracking-tight">Einladung nicht verfügbar</h1>
        <p className="text-sm text-muted-foreground">
          Dieser Link ist ungültig, abgelaufen oder wurde schon benutzt. Bitte lass dir eine neue Einladung schicken.
        </p>
        <Link href="/login" className="text-sm underline underline-offset-4">Zur Anmeldung</Link>
      </Huelle>
    )
  }

  const { user } = await getAuthUser()
  const passt = !!user?.email && normalisiereEmail(user.email) === inv.email

  return (
    <Huelle>
      <div className="space-y-1.5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Einladung zu Athena Finance</p>
        <h1 className="text-xl font-semibold tracking-tight">Haushalt „{inv.haushalt}“</h1>
        <p className="text-sm text-muted-foreground">
          Eingeladen ist <span className="font-medium text-foreground break-all">{inv.email}</span>. Mit der Annahme siehst du
          die gemeinsamen Konten, Buchungen und Kategorien des Haushalts. Deine privaten Steuer- und Zugangsdaten bleiben nur
          bei dir.
        </p>
      </div>

      {user && !passt && (
        <div className="space-y-3 text-sm">
          <p className="rounded-md bg-muted/50 px-3 py-2 text-muted-foreground">
            Du bist mit einer anderen E-Mail-Adresse angemeldet. Die Einladung gilt nur für die oben genannte Adresse.
          </p>
          <form action={abmeldenFuerEinladung}>
            <input type="hidden" name="token" value={token} />
            <button type="submit" className="text-sm underline underline-offset-4">Abmelden und mit der richtigen Adresse fortfahren</button>
          </form>
        </div>
      )}

      {(!user || passt) && <EinladungFormulare token={token} email={inv.email} angemeldet={passt} />}
    </Huelle>
  )
}
