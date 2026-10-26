import { estimateCostUsd } from './cost.ts'
import type { UsageLike } from './cost.ts'

/**
 * Kosten-Entwicklung von Athena: reine Aggregation, ohne Datenbank.
 *
 * Zeilen kommen aus `ai_messages` (Chat-Antworten, Quelle 'chat') und aus `ai_logs`
 * `run.finish` der automatischen Läufe (Wochenlauf, KI-Kategorisierung; Quelle 'auto').
 * Tage sind BERLINER Kalendertage, nicht UTC. Kosten sind Schätzungen (siehe cost.ts).
 */

export type KostenQuelle = 'chat' | 'auto'

export type KostenZeile = {
  /** ISO-Zeitstempel (created_at) */
  zeit: string
  model: string | null
  usage: UsageLike | null
  quelle: KostenQuelle
}

export type KostenTag = {
  /** Berliner Kalendertag, YYYY-MM-DD */
  tag: string
  /** Chat-Antworten: Tokens je Art */
  eingabe: number
  cacheLesen: number
  cacheSchreiben: number
  ausgabe: number
  /** Chat-Antworten: geschätzte Kosten gesamt und je Modell */
  kosten: number
  kostenNachModell: Record<string, number>
  /** Anzahl Chat-Antworten */
  laeufe: number
  /** Automatische Läufe, zusammengefasst */
  auto: { tokens: number; kosten: number; laeufe: number }
}

export type KostenModell = {
  model: string
  laeufe: number
  tokens: number
  /** Geschätzte Kosten; null, wenn für das Modell kein Preis hinterlegt ist. */
  kosten: number | null
}

export type KostenAuswertung = {
  tage: KostenTag[]
  /** Modelle nach Kosten absteigend (ohne Preis zuletzt); Chat und automatisch zusammen. */
  modelle: KostenModell[]
  summe: {
    kosten: number
    tokens: number
    antworten: number
    autoLaeufe: number
    autoKosten: number
    autoTokens: number
    /** Läufe mit Tokens, aber ohne hinterlegten Preis. */
    ohnePreis: number
  }
  /** Ø Kosten je Chat-Antwort (nur Antworten mit Preis); null ohne Antworten. */
  kostenProAntwort: number | null
  /** cacheLesen / Gesamt-Eingabe der Chat-Antworten (0..1); null ohne Eingabe. */
  cacheQuote: number | null
}

const TAG_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Berliner Kalendertag (YYYY-MM-DD) eines Zeitpunkts. */
export function berlinerTag(zeit: Date | string): string {
  return TAG_FORMAT.format(typeof zeit === 'string' ? new Date(zeit) : zeit)
}

/** Tag um n Tage verschieben (reine Kalenderrechnung, keine Zeitzone im Spiel). */
function tagPlus(tag: string, n: number): string {
  const [y, m, d] = tag.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

function zahl(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** Token-Aufteilung einer Zeile. `inputTokens` enthält Cache-Zugriffe bereits mit. */
export function tokenAufteilung(usage: UsageLike | null) {
  const gesamtEingabe = zahl(usage?.inputTokens)
  const lesen = zahl(usage?.inputTokenDetails?.cacheReadTokens)
  const schreiben = zahl(usage?.inputTokenDetails?.cacheWriteTokens)
  return {
    eingabe: Math.max(0, gesamtEingabe - lesen - schreiben),
    cacheLesen: lesen,
    cacheSchreiben: schreiben,
    ausgabe: zahl(usage?.outputTokens),
    gesamtEingabe,
  }
}

export function aggregiereKosten(zeilen: KostenZeile[], tage: 30 | 90, jetzt: Date = new Date()): KostenAuswertung {
  const heute = berlinerTag(jetzt)
  const reihe: KostenTag[] = []
  const index = new Map<string, KostenTag>()
  for (let i = tage - 1; i >= 0; i--) {
    const eintrag: KostenTag = {
      tag: tagPlus(heute, -i),
      eingabe: 0,
      cacheLesen: 0,
      cacheSchreiben: 0,
      ausgabe: 0,
      kosten: 0,
      kostenNachModell: {},
      laeufe: 0,
      auto: { tokens: 0, kosten: 0, laeufe: 0 },
    }
    reihe.push(eintrag)
    index.set(eintrag.tag, eintrag)
  }

  const modelle = new Map<string, { laeufe: number; tokens: number; kosten: number; preis: boolean }>()
  let kosten = 0
  let tokens = 0
  let antworten = 0
  let autoLaeufe = 0
  let autoKosten = 0
  let autoTokens = 0
  let ohnePreis = 0
  let chatKosten = 0
  let chatMitPreis = 0
  let chatEingabe = 0
  let chatCacheLesen = 0

  for (const z of zeilen) {
    const eintrag = index.get(berlinerTag(z.zeit))
    if (!eintrag) continue // außerhalb des Zeitraums
    const t = tokenAufteilung(z.usage)
    const summeTokens = t.gesamtEingabe + t.ausgabe
    const k = estimateCostUsd(z.model, z.usage)
    const hatPreis = k !== null
    const betrag = k ?? 0
    const name = z.model ?? 'unbekannt'

    if (summeTokens > 0 && !hatPreis) ohnePreis += 1
    tokens += summeTokens
    kosten += betrag

    const m = modelle.get(name) ?? { laeufe: 0, tokens: 0, kosten: 0, preis: false }
    m.laeufe += 1
    m.tokens += summeTokens
    m.kosten += betrag
    m.preis = m.preis || hatPreis
    modelle.set(name, m)

    if (z.quelle === 'auto') {
      eintrag.auto.tokens += summeTokens
      eintrag.auto.kosten += betrag
      eintrag.auto.laeufe += 1
      autoLaeufe += 1
      autoKosten += betrag
      autoTokens += summeTokens
      continue
    }

    eintrag.eingabe += t.eingabe
    eintrag.cacheLesen += t.cacheLesen
    eintrag.cacheSchreiben += t.cacheSchreiben
    eintrag.ausgabe += t.ausgabe
    eintrag.kosten += betrag
    eintrag.kostenNachModell[name] = (eintrag.kostenNachModell[name] ?? 0) + betrag
    eintrag.laeufe += 1
    antworten += 1
    chatEingabe += t.gesamtEingabe
    chatCacheLesen += t.cacheLesen
    if (hatPreis) {
      chatKosten += betrag
      chatMitPreis += 1
    }
  }

  const modellListe: KostenModell[] = [...modelle.entries()]
    .map(([model, m]) => ({ model, laeufe: m.laeufe, tokens: m.tokens, kosten: m.preis ? m.kosten : null }))
    .sort((a, b) => (b.kosten ?? -1) - (a.kosten ?? -1) || b.tokens - a.tokens)

  return {
    tage: reihe,
    modelle: modellListe,
    summe: { kosten, tokens, antworten, autoLaeufe, autoKosten, autoTokens, ohnePreis },
    kostenProAntwort: chatMitPreis > 0 ? chatKosten / chatMitPreis : null,
    cacheQuote: chatEingabe > 0 ? chatCacheLesen / chatEingabe : null,
  }
}

/** Kompakte Token-Zahl: 1,2 Mio / 340 Tsd / 512 (deutsche Schreibweise). */
export function formatTokensKompakt(n: number): string {
  const f = (v: number) => v.toLocaleString('de-DE', { maximumFractionDigits: 1 })
  if (n >= 1_000_000) return `${f(n / 1_000_000)} Mio`
  if (n >= 10_000) return `${f(Math.round(n / 100) / 10)} Tsd`
  return Math.round(n).toLocaleString('de-DE')
}
