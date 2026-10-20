import { timingSafeEqual } from 'node:crypto'

export type CronAuthResult = 'ok' | 'unconfigured' | 'unauthorized'

/**
 * Reiner Kern der Cron-Auth (ohne next/supabase-Importe, damit er im node:test-Lauf ladbar ist).
 *
 * Fail-closed: fehlendes/leeres Secret -> 'unconfigured'. Erwartet `Bearer <secret>`; der
 * Vergleich läuft in konstanter Zeit (Längenunterschied wird vorab abgewiesen, das ist bei
 * timingSafeEqual unvermeidlich und verrät nur die Länge).
 */
export function checkCronAuth(
  headerValue: string | null | undefined,
  secret: string | null | undefined,
): CronAuthResult {
  if (!secret) return 'unconfigured'
  const given = Buffer.from(headerValue ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return 'unauthorized'
  return 'ok'
}
