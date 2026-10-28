import { ladeSparzieleSeite } from '@/lib/data/sparziele-seite'
import { AddGoalDialog } from '@/components/finance/goal-form'
import { SparzieleKennzahlenLeiste } from '@/components/sparziele/SparzieleKennzahlenLeiste'
import { SparzielZeile } from '@/components/sparziele/SparzielZeile'
import { PiggyBank } from 'lucide-react'
import { requireAuthUser } from '@/lib/supabase/server'
import { resolveScope } from '@/lib/haushalt/resolve'
import { LeerZustand } from '@/components/leer/LeerZustand'
import { ScopeHinweisFuer } from '@/components/leer/ScopeHinweisFuer'
import { letzteAenderungen } from '@/lib/data/aenderungen'

export default async function GoalsPage() {
  const s = await ladeSparzieleSeite()
  // Scope nur fuer den Leerzustand (Hinweis auf „Gemeinsam“); pro Anfrage gecacht.
  const { supabase: sb, user: authUser } = await requireAuthUser()
  const scopeCtx = await resolveScope(sb, authUser!)
  const leerCtx = s.gesamt === 0 ? scopeCtx : null
  const zuletzt = await letzteAenderungen(sb, scopeCtx, 'savings_goals', [...s.offen, ...s.erreicht, ...s.beendet].map(z => z.id))
  const erledigt = s.erreicht.length + s.beendet.length
  const zeile = (z: (typeof s.offen)[number]) => (
    <SparzielZeile key={z.id} ziel={z} heute={s.heute} locale={s.locale} dateFormat={s.dateFormat} zuletzt={zuletzt.get(z.id)} />
  )

  return (
    <div className="min-w-0 space-y-4 p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Sparziele</h1>
        <AddGoalDialog />
      </div>

      {s.gesamt === 0 ? (
        <div className="space-y-4">
          {leerCtx && <ScopeHinweisFuer ctx={leerCtx} thema="Sparziele" />}
          <LeerZustand
            icon={PiggyBank}
            titel="Noch keine Sparziele"
            text="Lege ein Ziel mit Betrag an, z. B. Reise oder Notfallfonds. Mit einer monatlichen Sparrate und einem Zieldatum rechnet die Seite aus, ob du rechtzeitig fertig wirst. Den gesparten Stand pflegst du selbst über „Einzahlen“; er ist nicht mit einem Konto verknüpft."
            aktionNode={<AddGoalDialog />}
          />
        </div>
      ) : (
        <>
          <SparzieleKennzahlenLeiste k={s.k} locale={s.locale} dateFormat={s.dateFormat} />

          {s.k.vollOffen > 0 && (
            <p className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
              {s.k.vollOffen === 1 ? 'Bei einem Ziel ist der Betrag erreicht.' : `Bei ${s.k.vollOffen} Zielen ist der Betrag erreicht.`}{' '}
              Markiere {s.k.vollOffen === 1 ? 'es' : 'sie'} als erreicht, um {s.k.vollOffen === 1 ? 'es' : 'sie'} abzuschließen.
            </p>
          )}

          {s.offen.length > 0 ? (
            <ul className="space-y-2">{s.offen.map(zeile)}</ul>
          ) : (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Keine offenen Sparziele. Lege ein neues an oder öffne ein abgeschlossenes wieder.
            </p>
          )}

          {erledigt > 0 && (
            <details open={s.offen.length === 0} className="group/erledigt">
              <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-sm font-medium text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                <span aria-hidden className="transition-transform group-open/erledigt:rotate-90">›</span>
                Abgeschlossen
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{erledigt}</span>
              </summary>
              <div className="mt-2 space-y-3">
                {s.erreicht.length > 0 && (
                  <div className="space-y-2">
                    <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Erreicht</h2>
                    <ul className="space-y-2">{s.erreicht.map(zeile)}</ul>
                  </div>
                )}
                {s.beendet.length > 0 && (
                  <div className="space-y-2">
                    <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Beendet, Betrag nicht voll</h2>
                    <ul className="space-y-2">{s.beendet.map(zeile)}</ul>
                  </div>
                )}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  )
}
