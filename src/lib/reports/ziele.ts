/**
 * Wer bekommt den Monatsreport? Reine Regel, damit sie testbar ist.
 *
 *  - REPORT_USER_ID gesetzt: genau dieser Nutzer (bisheriges Single-Tenant-Verhalten); Empfaenger = REPORT_RECIPIENT_EMAIL,
 *    sonst die Mailadresse des Nutzers aus auth.users (`recipient: null` = aufloesen).
 *  - REPORT_USER_ID nicht gesetzt: Schleife ueber alle uebergebenen Nutzer (Mehrpersonen-Betrieb); die Empfaenger-Variable
 *    gilt dann nicht (sie wuerde sonst jedem Nutzer den Report einer anderen Person schicken).
 */
export type ReportZiel = { userId: string; recipient: string | null }

export function bestimmeReportZiele(
  env: { userId?: string | null; recipient?: string | null },
  alleNutzer: string[],
): ReportZiel[] {
  const userId = env.userId?.trim()
  if (userId) return [{ userId, recipient: env.recipient?.trim() || null }]
  return [...new Set(alleNutzer)].map(id => ({ userId: id, recipient: null }))
}
