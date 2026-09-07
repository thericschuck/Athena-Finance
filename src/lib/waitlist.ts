import { createClient } from '@supabase/supabase-js'

export type WaitlistRow = {
  id: string
  email: string
  created_at: string
}

/**
 * Liest die Interessenten-Liste — ausschließlich serverseitig und ausschließlich
 * für den Eigentümer.
 *
 * Warum nicht einfach über den normalen Supabase-Client der Seite: `waitlist_signups`
 * hat bewusst KEINE select-Policy (siehe Migration 20260906220000). Von außen ist nur
 * INSERT erlaubt, damit das öffentliche Formular eintragen kann, ohne dass irgendwer
 * die gesammelten Adressen wieder auslesen kann. Eine Policy `to authenticated`
 * nachzurüsten wäre der bequeme Weg und der falsche: in dieser Datenbank liegen zwei
 * auth.users, das zweite Konto bekäme damit sämtliche fremden E-Mail-Adressen zu sehen.
 *
 * Stattdessen der Service-Role-Schlüssel, der RLS umgeht — er bleibt auf dem Server,
 * und die Berechtigung prüft diese Funktion selbst.
 *
 * Fällt bewusst ZU, nicht auf: ist keine Eigentümer-ID auffindbar, gibt es kein
 * Ergebnis und die Ansicht erscheint gar nicht erst. Bei personenbezogenen Daten ist
 * ein stillschweigend offener Zustand die schlechtere Voreinstellung als ein Feature,
 * das fehlt und dessen Fehlen auffällt.
 *
 * @returns die Zeilen für den Eigentümer, sonst `null` (kein Zugriff / nicht konfiguriert)
 */
export async function listWaitlistFor(userId: string): Promise<WaitlistRow[] | null> {
  /*
   * WAITLIST_OWNER_ID hat Vorrang; ohne sie gilt BANK_SYNC_USER_ID.
   *
   * Die Rückfallebene ist Absicht und keine Bequemlichkeit: BANK_SYNC_USER_ID
   * steht bereits in der Umgebung und enthält dieselbe Nutzer-ID — diese
   * Installation hat genau einen Eigentümer. Ohne den Rückfall müsste eine
   * zweite Variable mit demselben Wert gepflegt werden, und wenn sie irgendwo
   * fehlt (etwa bei Vercel), verschwindet die Ansicht kommentarlos.
   *
   * Die eigene Variable bleibt trotzdem stehen: sobald Eigentümer und
   * Bank-Sync-Konto einmal auseinanderfallen, ist sie die Stelle, an der man
   * das sagt — statt eine Bank-Variable stillschweigend als Rechte-Prüfung
   * weiterzubenutzen.
   */
  const ownerId = process.env.WAITLIST_OWNER_ID ?? process.env.BANK_SYNC_USER_ID
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!ownerId || !serviceKey || userId !== ownerId) return null

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    // Kein Session-Handling für einen Client, der genau eine Abfrage macht und
    // danach wieder verschwindet.
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await admin
    .from('waitlist_signups')
    .select('id, email, created_at')
    .order('created_at', { ascending: false })

  // Ein Fehler hier ist kein Grund, die ganze Einstellungsseite scheitern zu
  // lassen — die Ansicht bleibt dann einfach leer.
  if (error) return []
  return data ?? []
}
