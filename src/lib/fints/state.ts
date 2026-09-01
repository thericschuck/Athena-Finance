/**
 * Persistenz des FinTS-Client-Zustands (Tabelle `fints_client_state`).
 *
 * Warum das existiert: python-fints handelt beim ersten Dialog eine Kundensystem-ID aus
 * (HKSYN3 / NEW_SYSTEM_ID). Ohne gespeicherte System-ID wiederholt JEDER Sync diese
 * Erstsynchronisierung, die Bank sieht jedes Mal einen unbekannten Zugang und verlangt
 * zwingend eine SecureGo-plus-Freigabe. Mit gespeicherter System-ID greift die
 * PSD2-Ausnahme (Art. 10 RTS): nach EINER Freigabe sind Kontoinformationen der letzten
 * 90 Tage für 90 Tage freigabefrei abrufbar.
 *
 * Der Zustand muss geteilt werden zwischen dem lokalen Python-Sidecar und der
 * Vercel-Python-Function — sonst löst jeder Wechsel des Ausführungspfads wieder eine
 * Freigabe aus. Deshalb Supabase und nicht das (auf Vercel ohnehin flüchtige) Dateisystem.
 * Die Vercel-Function schreibt dieselbe Tabelle direkt über die REST-API
 * (siehe `api/bank-sync.py`), mit demselben `bank_key`-Schema.
 */
import { createClient } from '@supabase/supabase-js'
import type { BankClientStateMap } from './sidecar'

/**
 * Service-Role-Client. `fints_client_state` hat bewusst KEINE RLS-Policies — der Zustand
 * ist reine Server-Infrastruktur und soll nie über einen Browser-Client erreichbar sein.
 * Deshalb erzeugt dieses Modul seinen Client selbst, statt einen durchgereichten
 * (möglicherweise cookie-basierten) Client zu verwenden, der hier stillschweigend
 * leere Ergebnisse liefern würde.
 */
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** Dauer der PSD2-Ausnahme für Kontoinformationen nach einer starken Authentifizierung. */
export const SCA_EXEMPTION_DAYS = 90

export interface BankStateRow {
  bank_key: string
  bank_label: string | null
  last_sca_at: string | null
  sca_required_since: string | null
}

/**
 * Lädt den gespeicherten Client-Zustand aller Bank-Logins des Users.
 * Fehler werden geschluckt: ohne Zustand funktioniert der Sync weiterhin, er kostet
 * dann nur eine App-Freigabe — das ist besser, als den Sync komplett scheitern zu lassen.
 */
export async function loadBankClientState(userId: string): Promise<BankClientStateMap> {
  const { data, error } = await adminClient()
    .from('fints_client_state')
    .select('bank_key, bank_label, state_blob')
    .eq('user_id', userId)

  if (error) {
    console.warn('[fints] Client-Zustand konnte nicht geladen werden:', error.message)
    return {}
  }

  const map: BankClientStateMap = {}
  for (const row of (data ?? []) as { bank_key: string; bank_label: string | null; state_blob: string }[]) {
    if (row.state_blob) map[row.bank_key] = { blob: row.state_blob, label: row.bank_label ?? undefined }
  }
  return map
}

/**
 * Speichert den nach dem Sync zurückgegebenen Zustand.
 *
 * `last_sca_at` wird nur dann neu gesetzt, wenn in diesem Lauf tatsächlich eine Freigabe
 * stattgefunden hat (`scaPerformed`) — sonst würde jeder freigabefreie Sync die 90-Tage-Frist
 * scheinbar verlängern und die Anzeige „nächste Freigabe fällig am …" würde nie stimmen.
 */
export async function saveBankClientState(
  userId: string,
  state: BankClientStateMap | undefined,
): Promise<void> {
  if (!state) return
  const entries = Object.entries(state).filter(([, v]) => v?.blob)
  if (entries.length === 0) return

  const now = new Date().toISOString()
  const rows = entries.map(([bankKey, value]) => ({
    user_id: userId,
    bank_key: bankKey,
    bank_label: value.label ?? null,
    state_blob: value.blob,
    // Ein erfolgreicher Lauf räumt eine zuvor gemeldete Freigabe-Anforderung ab.
    sca_required_since: null,
    updated_at: now,
    ...(value.scaPerformed ? { last_sca_at: now } : {}),
  }))

  const { error } = await adminClient()
    .from('fints_client_state')
    .upsert(rows, { onConflict: 'user_id,bank_key' })

  if (error) {
    // Nicht fatal — die Transaktionen sind bereits gespeichert. Kostet nur den nächsten
    // Sync eine zusätzliche App-Freigabe.
    console.warn('[fints] Client-Zustand konnte nicht gespeichert werden:', error.message)
  }
}

/**
 * Vermerkt, dass ein unbeaufsichtigter Lauf abgebrochen ist, weil die Bank eine Freigabe
 * verlangt. Die /bank-Seite liest das und zeigt den Hinweis, dass ein manueller Sync fällig ist.
 * Bestehende Zeilen werden nur markiert — der (abgelaufene) Blob bleibt erhalten, weil er
 * beim nächsten interaktiven Sync noch als Ausgangspunkt taugt.
 */
export async function markScaRequired(userId: string): Promise<void> {
  const { error } = await adminClient()
    .from('fints_client_state')
    .update({ sca_required_since: new Date().toISOString() })
    .eq('user_id', userId)
    .is('sca_required_since', null)

  if (error) console.warn('[fints] sca_required_since konnte nicht gesetzt werden:', error.message)
}

/**
 * Status für die UI: wann war die letzte Freigabe, wann läuft die 90-Tage-Frist ab,
 * und wartet gerade ein Cron-Lauf darauf, dass einmal manuell synchronisiert wird?
 */
export interface BankScaStatus {
  bankLabel: string | null
  lastScaAt: string | null
  /** Ende der freigabefreien Periode (last_sca_at + 90 Tage), null wenn nie authentifiziert. */
  exemptionExpiresAt: string | null
  /** Ein automatischer Sync ist an einer fehlenden Freigabe gescheitert. */
  scaRequired: boolean
}

export async function getBankScaStatus(userId: string): Promise<BankScaStatus[]> {
  const { data, error } = await adminClient()
    .from('fints_client_state')
    .select('bank_key, bank_label, last_sca_at, sca_required_since')
    .eq('user_id', userId)

  if (error || !data) return []

  return (data as BankStateRow[]).map(row => {
    let expires: string | null = null
    if (row.last_sca_at) {
      const d = new Date(row.last_sca_at)
      d.setDate(d.getDate() + SCA_EXEMPTION_DAYS)
      expires = d.toISOString()
    }
    return {
      bankLabel: row.bank_label,
      lastScaAt: row.last_sca_at,
      exemptionExpiresAt: expires,
      scaRequired: row.sca_required_since !== null,
    }
  })
}
