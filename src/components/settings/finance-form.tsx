'use client'

import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { saveFinance, SettingsState } from '@/app/(dashboard)/settings/actions'
import { Button } from '@/components/ui/button'
import type { SettingsMap } from '@/lib/settings'
import { leseSteuerprofil } from '@/lib/tax/profil'

const inputCls = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring'

export function FinanceForm({ initialSettings }: { initialSettings: SettingsMap }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveFinance, null)
  // Ueber leseSteuerprofil und nicht direkt aus initialSettings: der Wert ist
  // rohes jsonb, und derselbe Parser liest ihn auch serverseitig.
  const profil = leseSteuerprofil(initialSettings.tax_profile ?? null)

  useEffect(() => {
    if (!state) return
    if ('success' in state) toast.success('Finanz-Einstellungen gespeichert')
    if ('error'   in state) toast.error(state.error)
  }, [state])

  return (
    <form action={action} className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Finanzen</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Budget- und Steuerparameter</p>
      </div>

      <div className="space-y-4">
        {/* Monthly budget */}
        <div className="space-y-1.5">
          <label htmlFor="monthly_budget" className="text-sm font-medium">Monatliches Ausgaben-Budget (€)</label>
          <input
            id="monthly_budget"
            name="monthly_budget"
            type="number"
            step="0.01"
            min="0"
            defaultValue={(initialSettings.monthly_budget as number) ?? ''}
            className={inputCls}
            placeholder="z.B. 2000"
          />
          <p className="text-xs text-muted-foreground">
            Wird im Dashboard als Referenzwert für deine monatlichen Ausgaben angezeigt
          </p>
        </div>

        {/* Tax rate */}
        <div className="space-y-1.5">
          <label htmlFor="default_tax_rate" className="text-sm font-medium">Abgeltungsteuer inkl. Soli (%)</label>
          <input
            id="default_tax_rate"
            name="default_tax_rate"
            type="number"
            step="0.1"
            min="0"
            max="100"
            defaultValue={(initialSettings.default_tax_rate as number) ?? ''}
            className={inputCls}
            placeholder="26.375"
          />
          <p className="text-xs text-muted-foreground">
            Standardmäßig 26,375 % (25 % KESt + 5,5 % Soli) – wird für Nettorendite-Berechnungen im Depot verwendet
          </p>
        </div>
      </div>

      {/* Steuerprofil — Grundlage für den Grenzsteuersatz. Ohne den Bruttolohn
          muss die Engine ihn aus dem Netto schätzen, und genau das ist die
          Zahl, auf die es ankommt. */}
      <div className="space-y-4 border-t pt-6">
        <div>
          <h3 className="text-sm font-semibold">Steuerprofil</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Grundlage für Grenzsteuersatz und Steuerrücklage. Die Steuerlast bleibt eine
            Schätzung – der Grenzsteuersatz ist die belastbare Zahl.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="brutto_jahreslohn" className="text-sm font-medium">Bruttojahreslohn (€)</label>
          <input
            id="brutto_jahreslohn"
            name="brutto_jahreslohn"
            type="number"
            step="1"
            min="0"
            defaultValue={profil.bruttoJahreslohn ?? ''}
            className={inputCls}
            placeholder="z.B. 45000"
          />
          <p className="text-xs text-muted-foreground">
            {profil.bruttoStand
              ? `Stand ${profil.bruttoStand}. Nach einer Gehaltsänderung hier aktualisieren – sonst rechnet die Engine mit dem alten Wert weiter.`
              : 'Leer lassen schätzt aus den Lohn-Buchungen. Das Netto steht in den Buchungen, das Brutto nicht – diese eine Zahl kann die App nicht selbst lesen.'}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label htmlFor="kirchensteuer_pct" className="text-sm font-medium">Kirchensteuer (%)</label>
            <input
              id="kirchensteuer_pct"
              name="kirchensteuer_pct"
              type="number"
              step="0.1"
              min="0"
              max="12"
              defaultValue={profil.kirchensteuerPct}
              className={inputCls}
            />
            <p className="text-xs text-muted-foreground">0 = kein Mitglied. Bayern: 8 %</p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="vorsorge_anteil_pct" className="text-sm font-medium">Vorsorgeanteil (%)</label>
            <input
              id="vorsorge_anteil_pct"
              name="vorsorge_anteil_pct"
              type="number"
              step="0.5"
              min="0"
              max="50"
              defaultValue={profil.vorsorgeAnteilPct}
              className={inputCls}
            />
            <p className="text-xs text-muted-foreground">
              Anteil des Brutto, der als Vorsorgeaufwand abziehbar ist. Größte Unsicherheit der Rechnung.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="netto_quote" className="text-sm font-medium">Netto-Quote</label>
            <input
              id="netto_quote"
              name="netto_quote"
              type="number"
              step="0.01"
              min="0.3"
              max="1"
              defaultValue={profil.nettoQuote}
              className={inputCls}
            />
            <p className="text-xs text-muted-foreground">
              Nur als Notnagel, wenn kein Bruttolohn hinterlegt ist.
            </p>
          </div>
        </div>

        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            name="kleinunternehmer"
            defaultChecked={profil.kleinunternehmer}
            className="mt-0.5 size-4 rounded border-input"
          />
          <span>
            Kleinunternehmer nach § 19 UStG
            <span className="block text-xs text-muted-foreground">
              Keine Umsatzsteuer auf den Rechnungen. Die Engine überwacht dann die Grenzen
              (25.000 € Vorjahr / 100.000 € laufendes Jahr).
            </span>
          </span>
        </label>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? 'Speichern…' : 'Speichern'}
      </Button>
    </form>
  )
}
