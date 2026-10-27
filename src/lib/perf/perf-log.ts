/**
 * Dev-Instrumentierung fuer Supabase-Aufrufe. NUR aktiv bei Umgebungsvariable PERF_LOG=1 (sonst ist `perfFetch` undefined,
 * also gar kein Wrapper und kein Overhead). Schreibt JSON-Zeilen nach perf-log/perf.log (Projektordner, per .gitignore
 * ausgeschlossen). Ausgewertet mit `node scripts/perf-report.mjs`.
 *
 * Datenschutz: Protokolliert werden nur Methode, Pfad (Tabelle/RPC), Namen der Filterspalten samt Operator (z. B. `user_id=eq`),
 * die Spaltenliste von `select`, Dauer und Status. NIE Filterwerte, Bodys oder Antworten.
 */
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { headers } from 'next/headers'
import { describeUrl } from './describe-url'

export const PERF_ENABLED = process.env.PERF_LOG === '1'

const LOG_DIR = join(process.cwd(), 'perf-log')
const LOG_FILE = join(LOG_DIR, 'perf.log')
let dirReady = false

export type PerfRequestInfo = { rid: string; route: string }

function write(entry: Record<string, unknown>) {
  try {
    if (!dirReady) {
      mkdirSync(LOG_DIR, { recursive: true })
      dirReady = true
    }
    appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n')
  } catch {
    // Messung darf die App nie stoeren.
  }
}

/** Request-Kennung und Route, vom Proxy als Header gesetzt (nur bei PERF_LOG=1). Ausserhalb eines Requests (Cron) Fallback. */
export async function perfRequestInfo(): Promise<PerfRequestInfo> {
  try {
    const h = await headers()
    return { rid: h.get('x-perf-rid') ?? 'no-rid', route: h.get('x-perf-path') ?? 'unbekannt' }
  } catch {
    return { rid: 'no-request', route: 'ausserhalb-request' }
  }
}

/** Fetch-Wrapper fuer `global.fetch` der Supabase-Clients. */
export function createPerfFetch(info: PerfRequestInfo, source: string): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase()
    const start = Date.now()
    const t0 = performance.now()
    let status = 0
    try {
      const res = await fetch(input, init)
      status = res.status
      return res
    } finally {
      const dur = performance.now() - t0
      write({ kind: 'sb', source, rid: info.rid, route: info.route, method, ...describeUrl(url), start, dur: Math.round(dur * 10) / 10, status })
    }
  }
}

/** Gesamtdauer des Seiten-Renders (vom Layout aus mit `after()` aufgerufen). */
export function logRender(info: PerfRequestInfo, startedAt: number) {
  write({ kind: 'render', rid: info.rid, route: info.route, start: startedAt, dur: Date.now() - startedAt })
}
