import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { ScopeContext } from '@/lib/haushalt/scope'
import type { AthenaToolOptions } from '@/lib/assistant/tools/shared'
import { buildAccountTools } from '@/lib/assistant/tools/accounts'
import { buildTransactionTools } from '@/lib/assistant/tools/transactions'
import { buildPlanningTools } from '@/lib/assistant/tools/planning'
import { buildPortfolioTools } from '@/lib/assistant/tools/portfolio'
import { buildDataQualityTools } from '@/lib/assistant/tools/data-quality'
import { buildInsightTools } from '@/lib/assistant/tools/insights'
import { buildObligationTools } from '@/lib/assistant/tools/obligations'
import { buildSavingsPlanTools } from '@/lib/assistant/tools/savings-plans'
import { buildUserSettingsTools } from '@/lib/assistant/tools/user-settings'
import { buildAccountHistoryTools } from '@/lib/assistant/tools/account-history'
import { buildTaxTools } from '@/lib/assistant/tools/tax'
import { buildForecastTools } from '@/lib/assistant/tools/forecast'
import { buildRecurringTools } from '@/lib/assistant/tools/recurring'
import { buildCategoryTools } from '@/lib/assistant/tools/categories'
import { buildChartTools } from '@/lib/assistant/tools/chart'
import { buildMemoryTools } from '@/lib/assistant/tools/memory'
import { buildInventoryTools } from '@/lib/assistant/tools/inventory'
import { buildProposalTools } from '@/lib/assistant/tools/proposals'
import { buildAttachmentTools } from '@/lib/assistant/tools/attachments'
import { buildChangeTools } from '@/lib/assistant/tools/changes'

export type { AthenaToolOptions } from '@/lib/assistant/tools/shared'

type DB = SupabaseClient<Database>

/**
 * Baut den vollständigen Werkzeuggürtel für EINEN authentifizierten Nutzer.
 *
 * Jedes Tool schließt über `supabase`/`ctx` aus dem umgebenden Request — das
 * Zod-Input-Schema enthält deshalb bewusst KEIN `userId`/`accountId`-Feld, das
 * Modell kann fremde Daten also nicht einmal versuchen anzufragen, weil das
 * Schema es strukturell nicht zulässt. Pro Request neu aufgebaut, kein
 * modulweiter/geteilter Zustand zwischen Nutzern.
 *
 * Drei Klassen von Werkzeugen, mit absichtlich unterschiedlichem Risiko:
 *  - **Lesend** auf Finanzdaten: führen sofort aus.
 *  - **Speicher/Wissensbasis**: schreiben sofort, aber nur in Athenas eigene
 *    Notizen. Alles davon ist im UI sichtbar, editierbar und löschbar, und
 *    jeder Schreibzugriff steht im System-Log. Diese hinter eine Bestätigung zu
 *    setzen würde bedeuten, dass Eric jeden gemerkten Fakt einzeln wegklickt —
 *    der Preis wäre höher als das Risiko, das hier bei "eine Notiz ist falsch"
 *    liegt.
 *  - **Schreibend auf Finanzdaten**: führen NIE aus, sondern legen nur einen
 *    Vorschlag in ai_pending_actions an (siehe ../actions/).
 */
export function buildAthenaTools(supabase: DB, ctx: ScopeContext, options: AthenaToolOptions) {
  return {
    ...buildAccountTools(supabase, ctx),
    ...buildTransactionTools(supabase, ctx),
    ...buildPlanningTools(supabase, ctx),
    ...buildForecastTools(supabase, ctx),
    ...buildPortfolioTools(supabase, ctx),
    ...buildDataQualityTools(supabase, ctx),
    ...buildInsightTools(supabase, ctx),
    ...buildObligationTools(supabase, ctx),
    ...buildSavingsPlanTools(supabase, ctx),
    ...buildUserSettingsTools(supabase, ctx),
    ...buildAccountHistoryTools(supabase, ctx),
    ...buildTaxTools(supabase, ctx),
    ...buildRecurringTools(supabase, ctx),
    ...buildCategoryTools(supabase, ctx),
    ...buildChartTools(),
    ...buildMemoryTools(supabase, ctx, options),
    ...buildInventoryTools(supabase, ctx),
    ...buildChangeTools(supabase, ctx),
    ...buildAttachmentTools(supabase, ctx, options),

    // ── Schreibende Aktionen: nur Vorschläge ──────────────────────────────────
    ...buildProposalTools(supabase, ctx, options),
  }
}

export type AthenaTools = ReturnType<typeof buildAthenaTools>
