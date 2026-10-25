import type { SessionSummary } from '@/lib/assistant/sessions'

/**
 * Gruppierung und Suche der Session-Liste. Rein und ohne Browser-/Server-Abhängigkeit, damit
 * dieselbe Regel in der Seitenleiste und im mobilen Umschalter gilt (und testbar bleibt).
 */

export type SessionGruppe = {
  key: 'angeheftet' | 'heute' | 'gestern' | 'woche' | 'aelter'
  label: string
  sessions: SessionSummary[]
}

const TAG_MS = 86_400_000

const BERLIN_TAG = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * Kalendertag in Berliner Zeit als fortlaufende Zahl — Unterschiede zweier Tage sind ganze Zahlen.
 * Bewusst nicht „lokale Zeit": die Seitenleiste wird auf dem Server (UTC) vorgerendert, und in den
 * Stunden nach Mitternacht wichen „Heute"/„Gestern" dann zwischen Server und Browser ab
 * (Hydration-Fehler).
 */
export function berlinTagNummer(d: Date): number {
  const [j, m, t] = BERLIN_TAG.format(d).split('-').map(Number)
  return Math.floor(Date.UTC(j, m - 1, t) / TAG_MS)
}

/**
 * Angeheftete zuerst, danach nach Alter. Die Reihenfolge innerhalb einer Gruppe bleibt die der
 * Eingabe (der Loader liefert bereits nach `updated_at` absteigend). Leere Gruppen entfallen.
 */
export function gruppiereSessions(sessions: SessionSummary[], jetzt: Date = new Date()): SessionGruppe[] {
  const heute = berlinTagNummer(jetzt)
  const gruppen: SessionGruppe[] = [
    { key: 'angeheftet', label: 'Angeheftet', sessions: [] },
    { key: 'heute', label: 'Heute', sessions: [] },
    { key: 'gestern', label: 'Gestern', sessions: [] },
    { key: 'woche', label: 'Diese Woche', sessions: [] },
    { key: 'aelter', label: 'Älter', sessions: [] },
  ]
  for (const s of sessions) {
    if (s.pinned) {
      gruppen[0].sessions.push(s)
      continue
    }
    const alter = heute - berlinTagNummer(new Date(s.updatedAt))
    const ziel = alter <= 0 ? 1 : alter === 1 ? 2 : alter < 7 ? 3 : 4
    gruppen[ziel].sessions.push(s)
  }
  return gruppen.filter((g) => g.sessions.length > 0)
}

/** Groß-/Kleinschreibung egal, Treffer im Titel; leere Eingabe lässt alles durch. */
export function filtereSessions(sessions: SessionSummary[], suche: string): SessionSummary[] {
  const q = suche.trim().toLocaleLowerCase('de-DE')
  if (!q) return sessions
  return sessions.filter((s) => (s.title ?? 'Ohne Titel').toLocaleLowerCase('de-DE').includes(q))
}
