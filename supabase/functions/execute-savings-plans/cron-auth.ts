// Cron-Auth der Edge Functions: `Authorization: Bearer <CRON_SECRET>`.
//
// DIESE DATEI STEHT DREIMAL IM REPO, byte-identisch:
//   supabase/functions/daily-snapshot/cron-auth.ts
//   supabase/functions/execute-savings-plans/cron-auth.ts
//   supabase/functions/fetch-fund-price/cron-auth.ts
// Absichtlich keine geteilte Datei (`_shared/`): jede Function wird für sich deployt, und ein Deploy
// ohne den Nachbarordner würde beim Import scheitern. Dass die Kopien nicht auseinanderlaufen,
// prüft src/lib/api/edge-cron-auth.test.ts.
//
// Warum ein eigenes Secret statt des Supabase-JWT: Der anon-Key ist ein gültiges JWT und steht im
// Browser-Bundle jeder Seite. Wer ihn hatte, konnte die Functions (Service-Role!) beliebig auslösen
// (SECURITY-AUDIT.md S1). Deshalb läuft die Prüfung hier im Code und `verify_jwt` steht für diese
// Functions auf false (supabase/config.toml): Ein Secret, das kein JWT ist, würde die Plattform sonst
// schon vor diesem Code abweisen.
//
// Gleiche Semantik wie src/lib/api/cron-auth.ts (Node) und check_cron_auth() in api/bank-sync.py:
// fail-closed, wenn CRON_SECRET fehlt oder leer ist; Vergleich in konstanter Zeit.
//
// Bewusst ohne Imports und ohne `Deno`-Global: läuft unverändert unter Deno (Edge Runtime) und im
// Node-Testlauf des Projekts.

export type CronAuth = 'ok' | 'unconfigured' | 'unauthorized'

/** Konstante Zeit über die gemeinsame Länge. Nur die Länge selbst ist nicht geschützt (wie bei timingSafeEqual). */
function gleich(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/**
 * Reiner Kern. Erwartet exakt `Bearer <secret>`.
 * Ohne konfiguriertes Secret ist jede Anfrage unberechtigt, auch `Bearer ` mit leerem Wert.
 */
export function pruefeCronAuth(
  headerWert: string | null | undefined,
  secret: string | null | undefined,
): CronAuth {
  if (!secret) return 'unconfigured'
  const enc = new TextEncoder()
  return gleich(enc.encode(headerWert ?? ''), enc.encode(`Bearer ${secret}`)) ? 'ok' : 'unauthorized'
}

/**
 * Erste Zeile jedes Handlers, VOR dem Anlegen des Datenbank-Clients:
 *
 *   const abgewiesen = cronAuthAntwort(req, Deno.env.get('CRON_SECRET'))
 *   if (abgewiesen) return abgewiesen
 *
 * Gibt `null` zurück, wenn die Anfrage berechtigt ist, sonst die fertige Fehlerantwort:
 * 401 bei fehlendem oder falschem Header, 500 wenn auf dem Server gar kein Secret eingetragen ist
 * (fail-closed, aber als Konfigurationsfehler erkennbar statt als „falsches Passwort").
 */
export function cronAuthAntwort(req: Request, secret: string | null | undefined): Response | null {
  const ergebnis = pruefeCronAuth(req.headers.get('Authorization'), secret)
  if (ergebnis === 'ok') return null
  if (ergebnis === 'unconfigured') {
    return Response.json({ error: 'CRON_SECRET nicht konfiguriert' }, { status: 500 })
  }
  return Response.json({ error: 'Unauthorized' }, { status: 401 })
}
