import { z } from 'zod'
import { getFinTSErrorDetails } from '@/lib/fints'
import { syncBankForUser, BankScaRequiredError } from '@/lib/fints/user-sync'
import { userHasBankAccess } from '@/lib/fints/connections'
import { defineAction, type ActionDefinition } from '@/lib/assistant/actions/types'

export const bankActions = {
  // ── Bank: Konten mit der Bank synchronisieren ────────────────────────────────
  //
  // Holt Salden, Umsätze und Depotbestände per FinTS. Nichts wird gelöscht (Umsätze werden
  // per external_id dedupliziert), trotzdem eine bestätigte Aktion: der Sync kann eine
  // Freigabe in der SecureGo-plus-App auslösen und blockiert dann bis zu mehrere Minuten.
  syncBank: defineAction({
    label: 'Bank synchronisieren',
    description:
      'Synchronisiert die Bankkonten per FinTS: aktualisiert Salden, importiert neue Umsätze ' +
      'und Depotbestände. Standard: letzte 90 Tage — das läuft normalerweise OHNE Freigabe in ' +
      'der Bank-App. fullHistory=true holt die komplette Historie und verlangt IMMER eine ' +
      'Freigabe in der SecureGo-plus-App; nur nutzen, wenn Eric ausdrücklich alle alten Umsätze ' +
      'will. Nutze das, wenn Eric aktuelle Bankdaten will oder Salden/Umsätze veraltet wirken ' +
      '(siehe checkDataQuality) — nicht für bloße Fragen zu vorhandenen Daten.',
    schema: z.object({
      fullHistory: z.boolean().optional().describe('Komplette Historie statt 90 Tage (braucht Freigabe).'),
    }),
    validate: async (_input, ctx) => {
      // Wie /api/bank/sync: Zugriff hat, wer eine eigene Bankverbindung hat oder der Env-Nutzer ist.
      if (process.env.VERCEL && !(await userHasBankAccess(ctx.userId))) {
        return 'Bank-Sync ist für dieses Konto nicht verfügbar.'
      }
      return null
    },
    summarize: async (input) =>
      input.fullHistory
        ? 'Bank synchronisieren: komplette Historie — du musst den Zugriff in der SecureGo-plus-App freigeben'
        : 'Bank synchronisieren: Salden, Umsätze und Depot der letzten 90 Tage abrufen',
    details: async (input) => [
      { label: 'Zeitraum', value: input.fullHistory ? 'Gesamte verfügbare Historie' : 'Letzte 90 Tage' },
      {
        label: 'Freigabe',
        value: input.fullHistory ? 'Erforderlich' : 'Normalerweise nicht nötig',
        hint: 'Falls die Bank doch fragt: Push in der SecureGo-plus-App bestätigen — der Sync wartet darauf.',
      },
    ],
    execute: async (input, ctx) => {
      try {
        const r = await syncBankForUser(ctx.supabase, ctx.userId, { fullHistory: input.fullHistory })
        return {
          imported: r.imported,
          skipped: r.skipped,
          holdingsSynced: r.holdingsSynced ?? null,
          balancesSynced: r.balancesSynced ?? null,
          categorized: r.categorized ?? null,
          warnings: r.warnings ?? [],
        }
      } catch (err) {
        if (err instanceof BankScaRequiredError) {
          throw new Error(`${err.message} Bitte einmal in der App unter Bank manuell synchronisieren.`)
        }
        throw new Error(getFinTSErrorDetails(err).message)
      }
    },
  }),
} satisfies Record<string, ActionDefinition<z.ZodType>>
