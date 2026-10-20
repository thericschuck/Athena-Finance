import type { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export type DB = SupabaseClient<Database>

export type ActionContext = { supabase: DB; userId: string }

/**
 * Eine schreibende Aktion, die Athena VORSCHLAGEN darf.
 *
 * Der Modellaufruf führt `execute` niemals selbst aus — das Werkzeug in
 * tools.ts legt nur eine Zeile in `ai_pending_actions` an (Status `pending`)
 * und gibt deren ID zurück. Erst eine ausdrückliche Bestätigung im UI ruft
 * `runWriteAction` auf (siehe app/(dashboard)/assistant/actions.ts).
 *
 * Daraus folgt die Aufteilung:
 *  - `schema`    validiert BEIDE Male — beim Vorschlagen und erneut beim
 *                Ausführen. Zwischen beiden Zeitpunkten liegt eine Runde durch
 *                die Datenbank (jsonb), deshalb wird der Input beim Ausführen
 *                nicht als bereits geprüft angenommen.
 *  - `summarize` erzeugt den Satz, den die Nutzerin/der Nutzer im
 *                Bestätigungs-Dialog liest. Er muss aus echten Daten bestehen
 *                (Kategoriename statt UUID), sonst ist die Bestätigung
 *                wertlos — man kann nicht zustimmen, was man nicht sieht.
 *  - `execute`   schreibt. Jede Query filtert zusätzlich auf `user_id`, obwohl
 *                RLS das ohnehin täte: die Aktion läuft mit dem Client der
 *                Nutzerin/des Nutzers, doppelter Boden kostet hier nichts.
 */
export type ActionDefinition<S extends z.ZodType> = {
  /** Klartext-Name der Aktion fürs UI. Der rohe Bezeichner
      (`categorizeTransactions`) sagt niemandem etwas. */
  label: string
  /** Wird 1:1 zur Werkzeugbeschreibung für das Modell. */
  description: string
  schema: S
  summarize: (input: z.infer<S>, ctx: ActionContext) => Promise<string>
  /** Aufschlüsselung unter der Zusammenfassung: `summarize` sagt WAS passiert,
      `details` sagen WOMIT. Bei „2 Buchungen der Kategorie Abo zuordnen" ist
      genau das die Frage, die vor dem Klick offen bleibt — welche zwei? */
  details?: (input: z.infer<S>, ctx: ActionContext) => Promise<ActionDetail[]>
  /** Prüfung VOR dem Vorschlag. Liefert eine Klartext-Begründung, wenn die
      Aktion am aktuellen Datenstand gar nicht ausführbar wäre (Kategorie mit
      Unterkategorien löschen, Kategorie unter sich selbst hängen). Das Modell
      bekommt sie als Werkzeugfehler zurück und kann den Aufruf korrigieren,
      statt Eric eine Karte hinzulegen, die beim Klick scheitert. `null` heißt
      „in Ordnung". Läuft ein zweites Mal bei der Bestätigung, weil sich der
      Datenstand zwischen Vorschlag und Klick geändert haben kann. */
  validate?: (input: z.infer<S>, ctx: ActionContext) => Promise<string | null>
  execute: (input: z.infer<S>, ctx: ActionContext) => Promise<Record<string, unknown>>
}

/** Eine Zeile der Aufschlüsselung im Bestätigungs-Dialog. */
export type ActionDetail = {
  /** Worum es geht: Buchungstext, Feldname. */
  label: string
  /** Der konkrete Wert: Betrag, Datum, „alt → neu". */
  value?: string
  /** Kleingedrucktes unter dem Label: Datum, bisherige Kategorie. */
  hint?: string
}

export function defineAction<S extends z.ZodType>(def: ActionDefinition<S>): ActionDefinition<S> {
  return def
}
