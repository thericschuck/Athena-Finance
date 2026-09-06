'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Chat, useChat } from '@ai-sdk/react'
import {
  DefaultChatTransport,
  isToolUIPart,
  isReasoningUIPart,
  isTextUIPart,
  getToolName,
  type UIMessage,
} from 'ai'
import { Brain, Check, ChevronDown, ChevronUp, Globe, Loader2, Send, Square, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { AthenaAvatar, AthenaBackdrop } from '@/components/assistant/AthenaAvatar'
import { MarkdownLite } from '@/components/assistant/markdown-lite'
import {
  PendingActionCard,
  type PendingActionStatus,
} from '@/components/assistant/PendingActionCard'
import type { ActionDetail } from '@/lib/assistant/actions'
import { ATHENA_MODELS, ATHENA_EFFORT_OPTIONS, type AthenaEffort } from '@/lib/assistant/settings'
import { useAthenaChatSettings } from '@/components/providers/athena-settings-context'

/** Werkzeugnamen, hinter denen im UI ein sprechendes Label statt des rohen
    Bezeichners stehen soll. Alles, was hier fehlt, wird als Code angezeigt —
    besser ein unbekannter Name als ein falsch geratenes Label. */
const TOOL_LABELS: Record<string, string> = {
  getAccounts: 'Konten gelesen',
  getTransactions: 'Buchungen gelesen',
  getSpendingSummary: 'Ausgaben zusammengefasst',
  getContracts: 'Verträge gelesen',
  getDebts: 'Schulden gelesen',
  getGoals: 'Sparziele gelesen',
  getBudget: 'Fixkosten gelesen',
  getDepotHoldings: 'Depot gelesen',
  getCryptoPortfolio: 'Krypto-Portfolio gelesen',
  getNetWorthTrend: 'Vermögensverlauf gelesen',
  getCategories: 'Kategorien gelesen',
  getCategoryUsage: 'Kategorie-Nutzung geprüft',
  remember: 'Fakt gespeichert',
  searchMemory: 'Speicher durchsucht',
  forget: 'Fakt gelöscht',
  searchKnowledge: 'Wissensbasis durchsucht',
  saveKnowledge: 'Wissenseintrag angelegt',
  web_search: 'Web durchsucht',
  web_fetch: 'Webseite gelesen',
}

const WEB_TOOLS = new Set(['web_search', 'web_fetch'])

/** `isToolUIPart` erfasst beide Varianten: statisch deklarierte Werkzeuge und
    die `dynamic-tool`-Form. Beide tragen `state`/`output`, mehr braucht die
    Vorschlagserkennung unten nicht. */
type ToolPart = Extract<
  UIMessage['parts'][number],
  { type: `tool-${string}` } | { type: 'dynamic-tool' }
>

/** Erkennt die Antwort eines Vorschlags-Werkzeugs (siehe tools.ts,
    buildProposalTools) und zieht die Felder heraus, die die Karte braucht. */
function asProposal(
  part: ToolPart,
): { actionId: string; label?: string; summary: string; details: ActionDetail[] } | null {
  if (part.state !== 'output-available') return null
  const output = part.output as Record<string, unknown> | undefined
  if (!output || output.status !== 'pending_confirmation') return null
  if (typeof output.actionId !== 'string' || typeof output.summary !== 'string') return null
  return {
    actionId: output.actionId,
    label: typeof output.label === 'string' ? output.label : undefined,
    summary: output.summary,
    details: asDetails(output.details),
  }
}

/** Die Werkzeugausgabe kommt aus der Datenbank zurück, also als `unknown`.
    Nachrichten aus Sessions von vor der Aufschlüsselung haben gar kein
    `details` — dann bleibt die Karte bei der Zusammenfassung, statt an einem
    fehlenden Feld zu scheitern. */
function asDetails(value: unknown): ActionDetail[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const row = entry as Record<string, unknown>
    if (typeof row.label !== 'string') return []
    return [
      {
        label: row.label,
        value: typeof row.value === 'string' ? row.value : undefined,
        hint: typeof row.hint === 'string' ? row.hint : undefined,
      },
    ]
  })
}

/** Aufklappbare Werkzeug-Spur: was Athena in diesem Zug getan hat. */
function ToolTrace({ parts }: { parts: UIMessage['parts'] }) {
  const toolParts = parts.filter(isToolUIPart)
  if (toolParts.length === 0) return null

  const usedWeb = toolParts.some((p) => WEB_TOOLS.has(getToolName(p)))

  return (
    <details className="mt-2 text-xs text-muted-foreground">
      <summary className="flex cursor-pointer select-none items-center gap-1.5 transition-colors hover:text-foreground">
        <Wrench className="size-3" />
        {toolParts.length} Schritt{toolParts.length === 1 ? '' : 'e'}
        {usedWeb && (
          <span className="flex items-center gap-1 text-primary">
            <Globe className="size-3" /> Web
          </span>
        )}
      </summary>
      <ol className="mt-1.5 space-y-1 border-l border-border pl-3">
        {toolParts.map((part) => {
          const name = getToolName(part)
          return (
            <li key={part.toolCallId} className="flex items-center gap-1.5">
              <span
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  part.state === 'output-available' && 'bg-success',
                  part.state === 'output-error' && 'bg-destructive',
                  (part.state === 'input-streaming' || part.state === 'input-available') &&
                    'animate-pulse bg-warning',
                )}
              />
              {TOOL_LABELS[name] ? (
                <span>{TOOL_LABELS[name]}</span>
              ) : (
                <code className="font-mono">{name}</code>
              )}
              {part.state === 'output-error' && <span className="text-destructive">Fehler</span>}
            </li>
          )
        })}
      </ol>
    </details>
  )
}

/** Höhe des Denk-Fensters während des Streamens, in px.
    Fest statt `max-height`: eine mitwachsende Box schiebt bei jedem
    eintreffenden Satz alles darunter nach unten — genau das Wackeln, das der
    Gedankengang verursacht hat. Mit fester Höhe scrollt stattdessen der Text
    im Fenster, das Layout steht. */
const REASONING_VIEWPORT_PX = 96

/** Abstand in px, bis zu dem eine Scroll-Position noch als „ganz unten" bzw.
    „ganz oben" gilt — subpixel-Rundung darf das Mitlaufen nicht abwürgen. */
const SCROLL_EDGE_PX = 8

/** Zusammengefasstes Denken des Modells. Beim Streamen ist es oft das Einzige,
    was zu sehen ist — danach eingeklappt, weil es die Antwort erklärt, aber
    nicht ersetzt. */
function ReasoningTrace({ parts, streaming }: { parts: UIMessage['parts']; streaming: boolean }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  // Solange der Nutzer am unteren Rand steht, läuft das Fenster mit. Scrollt er
  // hoch, um Früheres zu lesen, hört es auf — sonst reißt der nächste Token ihn
  // wieder nach unten.
  const [pinned, setPinned] = useState(true)
  const [atTop, setAtTop] = useState(true)
  const text = parts
    .filter(isReasoningUIPart)
    .map((p) => p.text)
    .join('\n')
    .trim()

  // Im festen Fenster mitlaufen, damit immer der neueste Gedanke sichtbar ist.
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || !streaming || !pinned) return
    viewport.scrollTop = viewport.scrollHeight
  }, [text, streaming, pinned])

  function handleScroll() {
    const viewport = viewportRef.current
    if (!viewport) return
    const distanceToBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
    setPinned(distanceToBottom <= SCROLL_EDGE_PX)
    setAtTop(viewport.scrollTop <= SCROLL_EDGE_PX)
  }

  if (!text) return null

  if (streaming) {
    return (
      <div className="mb-2 text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <Brain className="size-3 animate-pulse" />
          Denkt nach…
        </p>
        <div
          ref={viewportRef}
          onScroll={handleScroll}
          style={{ height: REASONING_VIEWPORT_PX }}
          className={cn(
            // `overscroll-contain`: am Ende des Denk-Fensters soll nicht der
            // ganze Chat weiterscrollen.
            'mt-1.5 overflow-y-auto overscroll-contain border-l border-border pl-3 italic opacity-80',
            // Die Ausblendung nach oben nur, solange oben wirklich noch etwas
            // abgeschnitten ist — sonst versteckt sie die erste Zeile.
            !atTop && '[mask-image:linear-gradient(to_bottom,transparent,black_2rem)]',
          )}
        >
          <p className="whitespace-pre-wrap">{text}</p>
        </div>
      </div>
    )
  }

  return (
    <details className="mb-2 text-xs text-muted-foreground">
      <summary className="flex cursor-pointer select-none items-center gap-1.5 transition-colors hover:text-foreground">
        <Brain className="size-3" />
        Gedankengang
      </summary>
      <div className="mt-1.5 max-h-64 overflow-y-auto overscroll-contain whitespace-pre-wrap border-l border-border pl-3 italic opacity-80">
        {text}
      </div>
    </details>
  )
}

/** Quellen aus der Web-Recherche, damit recherchierte Aussagen nachprüfbar sind. */
function Sources({ parts }: { parts: UIMessage['parts'] }) {
  const sources = parts.filter(
    (p): p is Extract<UIMessage['parts'][number], { type: 'source-url' }> => p.type === 'source-url',
  )
  if (sources.length === 0) return null

  // Dieselbe URL taucht bei mehreren Suchen mehrfach auf — einmal reicht.
  const unique = Array.from(new Map(sources.map((s) => [s.url, s])).values())

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {unique.map((source, i) => (
        <a
          key={source.sourceId ?? i}
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex max-w-[16rem] items-center gap-1 truncate rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          title={source.url}
        >
          <Globe className="size-3 shrink-0" />
          <span className="truncate">{source.title || new URL(source.url).hostname}</span>
        </a>
      ))}
    </div>
  )
}

/** Kurzform des Modellnamens für den Auslöser — „Claude" steht ohnehin überall
    sonst auf der Seite, im Chip kostet es nur Platz. */
function shortModelLabel(id: string): string {
  const model = ATHENA_MODELS.find((m) => m.id === id)
  if (!model) return id.replace(/^claude-/, '')
  return model.label.replace(/^Claude\s+/, '')
}

/** Erster Teil des Denktiefe-Labels („Hoch — Standard" → „Hoch"). */
function shortEffortLabel(effort: AthenaEffort): string {
  return ATHENA_EFFORT_OPTIONS.find((o) => o.value === effort)?.label.split(' — ')[0] ?? effort
}

/**
 * Farbe eines Pegel-Balkens: Verlauf von `--success` (gruen) nach `--danger`
 * (rot) ueber die fuenf Stufen — die Denktiefe ist ein Kosten-Regler, und ein
 * einheitliches Gruen hat "Maximal" genauso harmlos aussehen lassen wie
 * "Niedrig".
 *
 * `color-mix` mit den THEME-TOKENS statt fester Hex-Werte: jedes Preset bringt
 * eigene Gruen- und Rottoene mit (Athena z. B. Oliv #8CA277 und Terrakotta
 * #BE6348 statt Signalgruen und Signalrot), und die Rampe uebernimmt sie
 * automatisch.
 *
 * Interpoliert in `oklch`, nicht in `oklab` oder `srgb`: oklch nimmt den kurzen
 * Weg ueber den Farbkreis, und der fuehrt von Gruen nach Rot durch Gelb und
 * Orange. Das ist genau die gewuenschte Ampel-Rampe. In oklab/srgb liefe der
 * Weg quer durch die Mitte und die mittleren Stufen wuerden schlammig grau.
 */
function effortTone(index: number, total: number): string {
  const anteil = total > 1 ? Math.round((index / (total - 1)) * 100) : 0
  return `color-mix(in oklch, var(--danger) ${anteil}%, var(--success))`
}

/** Denktiefe als Pegel statt als Zahl: fünf ansteigende Balken, gefüllt bis zur
    gewählten Stufe. Im Auslöser ersetzt das eine zweite Textzeile, im Popover
    zeigt es dieselbe Skala noch einmal groß. */
function EffortMeter({ level, className }: { level: number; className?: string }) {
  return (
    <span aria-hidden className={cn('flex items-end gap-[2px]', className)}>
      {ATHENA_EFFORT_OPTIONS.map((o, i) => (
        <span
          key={o.value}
          className={cn('w-[3px] rounded-full transition-colors', i > level && 'bg-border')}
          style={{
            height: 4 + i * 2,
            background: i <= level ? effortTone(i, ATHENA_EFFORT_OPTIONS.length) : undefined,
          }}
        />
      ))}
    </span>
  )
}

/**
 * Modell und Denktiefe in einem einzigen Auslöser statt in zwei nebeneinander
 * stehenden Auswahlfeldern.
 *
 * Der Grund für den Umbau: zwei Selects sahen aus wie ein Formular über dem
 * Eingabefeld, und die Denktiefe war eine Liste aus fünf Sätzen — für etwas,
 * das in Wahrheit ein Regler von „wenig" nach „viel" ist. Jetzt trägt der Chip
 * beide Werte (Name + Pegel), und das Popover zeigt die Modelle als Liste mit
 * Begründung und die Denktiefe als Skala, auf der man direkt die Stufe trifft.
 *
 * Beide Werte gehen weiter über den geteilten Context (siehe
 * athena-settings-context) — die Auswahl gilt sofort für jeden offenen Chat.
 */
function ModelEffortPicker() {
  const { model, effort, setModel, setEffort } = useAthenaChatSettings()
  const effortIndex = ATHENA_EFFORT_OPTIONS.findIndex((o) => o.value === effort)

  /**
   * Eine Stufe weiter, am Ende zurueck auf die niedrigste. Die Balken bleiben
   * der Weg, um eine Stufe DIREKT zu treffen; das hier ist der schnelle Weg
   * fuer "eine Stufe mehr", ohne das richtige von fuenf 1,5-px-Zielen zu
   * suchen. Mit Umlauf statt Anschlag, damit der Knopf nie tot ist.
   */
  function naechsteStufe() {
    const next = ATHENA_EFFORT_OPTIONS[(effortIndex + 1) % ATHENA_EFFORT_OPTIONS.length]
    setEffort(next.value)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Modell ${shortModelLabel(model)}, Denktiefe ${shortEffortLabel(effort)} — ändern`}
          className="flex h-7 items-center gap-2 rounded-full border border-border/70 px-2.5 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
        >
          <span className="font-medium">{shortModelLabel(model)}</span>
          <EffortMeter level={effortIndex} />
          <ChevronDown className="size-3 opacity-60" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-72 p-2">
        <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Modell
        </p>
        <div className="flex flex-col">
          {ATHENA_MODELS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setModel(m.id)}
              aria-pressed={model === m.id}
              className={cn(
                'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent',
                model === m.id && 'bg-accent/60',
              )}
            >
              <Check
                className={cn('mt-0.5 size-3.5 shrink-0', model === m.id ? 'text-primary' : 'text-transparent')}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-foreground">{m.label}</span>
                <span className="block text-[11px] leading-snug text-muted-foreground">{m.hint}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="mt-2 border-t border-border pt-2">
          <div className="flex items-baseline justify-between px-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Denktiefe
            </p>
            {/* Der Wert selbst ist der Weiterschalter — beschriftet ueber
                aria-label, weil im Text nur die aktuelle Stufe steht. */}
            <button
              type="button"
              onClick={naechsteStufe}
              aria-label={`Denktiefe ${shortEffortLabel(effort)} — eine Stufe weiter`}
              className="flex items-center gap-1 rounded px-1 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {shortEffortLabel(effort)}
              <ChevronUp className="size-3 opacity-60" />
            </button>
          </div>

          {/* Die Balken sind die Schaltflächen selbst. Die Klickfläche ist
              absichtlich höher als der sichtbare Balken (h-7 gegen h-1.5) —
              1,5 px hohe Ziele trifft niemand zuverlässig. */}
          <div className="mt-1 flex items-center gap-1 px-1">
            {ATHENA_EFFORT_OPTIONS.map((o, i) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setEffort(o.value)}
                title={o.label}
                aria-label={o.label}
                aria-pressed={o.value === effort}
                className="group flex h-7 flex-1 items-center px-0.5"
              >
                <span
                  className={cn(
                    'block h-1.5 w-full rounded-full transition-colors',
                    i > effortIndex && 'bg-border group-hover:bg-muted-foreground/40',
                  )}
                  style={{
                    background:
                      i <= effortIndex ? effortTone(i, ATHENA_EFFORT_OPTIONS.length) : undefined,
                  }}
                />
              </button>
            ))}
          </div>

          <div className="flex justify-between px-2 text-[10px] text-muted-foreground">
            <span>schnell &amp; günstig</span>
            <span>gründlich &amp; teuer</span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Baut die Chat-Instanz, in der Nachrichten, Status und laufender Stream liegen.
 *
 * Warum als eigene Instanz und nicht über `useChat({ id, messages })`: der Zustand gehört
 * dann dem Objekt und nicht dem Hook, und das Objekt kann jemand anderes halten. Genau das
 * braucht das schwebende Sheet — sein Inhalt wird beim Schließen ausgehängt (Radix mountet
 * den Dialog-Inhalt nicht durch), und mit dem Hook-Zustand war danach jedes Mal ein leerer
 * Chat da. Liegt die Instanz eine Ebene höher, überlebt der Verlauf Schließen und Öffnen
 * und stirbt erst beim Neuladen der Seite.
 *
 * Die Konversations-ID wird hier festgelegt und in den Transport gebacken: die Route legt
 * die Zeile beim ersten Aufruf unter genau dieser ID an (api/assistant/route.ts).
 */
export function erzeugeChat(conversationId?: string, messages?: UIMessage[]): Chat<UIMessage> {
  const id = conversationId ?? crypto.randomUUID()
  return new Chat<UIMessage>({
    id,
    messages,
    transport: new DefaultChatTransport({ api: '/api/assistant', body: { conversationId: id } }),
  })
}

export function AthenaChat({
  chat,
  conversationId,
  initialMessages,
  actionStatuses,
  actionResults,
  backdrop = false,
  className,
}: {
  /** Von außen gehaltene Chat-Instanz (siehe `erzeugeChat`). Ist sie gesetzt, gilt sie —
      `conversationId` und `initialMessages` stecken dann schon in ihr. */
  chat?: Chat<UIMessage>
  /** Beim Öffnen einer gespeicherten Session deren ID; sonst wird eine neue erzeugt. */
  conversationId?: string
  initialMessages?: UIMessage[]
  /** Status der Vorschläge aus dieser Session, damit bereits entschiedene
      Karten nach dem Neuladen nicht wieder als offen erscheinen. */
  actionStatuses?: Record<string, PendingActionStatus>
  /** Rückgaben bereits ausgeführter Vorschläge, damit eine wiedergeöffnete Session das
      erzeugte Artwork weiterhin zeigt statt nur „Ausgeführt.". */
  actionResults?: Record<string, unknown>
  /** Statue als stiller Hintergrund. Nur auf der vollen Seite sinnvoll - im
      schmalen Sheet stuende sie hinter dem Text statt neben ihm. */
  backdrop?: boolean
  className?: string
}) {
  // Einmal beim Mount festhalten, nicht bei jedem Rendern neu ableiten: `initialMessages`
  // kommt als frisches Array vom Server, und ein `useMemo` darauf würde bei jedem
  // router.refresh() eine neue Instanz bauen und den laufenden Verlauf wegwerfen. Beim
  // Wechsel der Session mountet stattdessen neu — auf der Seite über den Key, im Sheet
  // über den Key auf der Chat-ID.
  const [instanz] = useState(() => chat ?? erzeugeChat(conversationId, initialMessages))
  const { messages, sendMessage, status, error, stop } = useChat({ chat: instanz })
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  // Die Seite, von der aus gefragt wird, geht als Kontext mit (siehe
  // atlas.ts: describeCurrentRoute). Pro NACHRICHT, nicht pro Session — das
  // schwebende Sheet bleibt beim Navigieren offen, die Route darunter wechselt.
  const pathname = usePathname()

  /** Eine Nachricht abschicken, immer mit der aktuellen Route im Gepaeck. */
  function frage(text: string) {
    sendMessage({ text }, { body: { route: pathname } })
  }

  // Nur auf die ANZAHL der Nachrichten hören, nicht auf ihren Inhalt: bei
  // `[messages]` feuert der Effekt bei jedem gestreamten Wort und startet die
  // weiche Scroll-Animation jedes Mal neu — das ruckelt sichtbar. So wird
  // einmal pro neuer Nachricht gescrollt; während des Streamens hält der
  // wachsende Text den Blick ohnehin am unteren Rand.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const busy = status === 'submitted' || status === 'streaming'

  function submit() {
    const text = input.trim()
    if (!text || busy) return
    frage(text)
    setInput('')
  }

  return (
    <div className={cn('relative flex h-full min-h-0 flex-col', className)}>
      {backdrop && <AthenaBackdrop />}

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
          {messages.length === 0 && <EmptyState onPick={frage} />}

          {messages.map((message, index) => {
            const isLast = index === messages.length - 1
            const proposals = message.parts.filter(isToolUIPart).flatMap((part) => {
              const proposal = asProposal(part)
              return proposal ? [{ ...proposal, action: getToolName(part) }] : []
            })

            const text = message.parts.filter(isTextUIPart).map((p) => p.text).join('\n')

            return (
              <div key={message.id} className="flex flex-col gap-2">
                {message.role === 'user' ? (
                  <div className="max-w-[85%] self-end whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
                    {text}
                  </div>
                ) : (
                  // Athena bekommt ein Gesicht in der linken Spalte: das
                  // Medaillon macht auf einen Blick klar, wer spricht — den
                  // Unterschied zwischen rechtsbündiger Blase und grauer
                  // Fläche liest man im langen Verlauf sonst nur mit Mühe.
                  <div className="flex w-full gap-2.5">
                    <AthenaAvatar
                      size={28}
                      thinking={isLast && busy}
                      className="mt-0.5 hidden sm:inline-flex"
                    />
                    {/* Antworten nehmen die volle Restbreite. Eine Blase, die
                        sich an den Inhalt anpasst, wächst beim Streamen mit
                        jedem Wort auch in die Breite — der Text springt dann
                        Zeile für Zeile hin und her. Feste Breite: nur die Höhe
                        wächst. */}
                    <div className="min-w-0 flex-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
                      <ReasoningTrace parts={message.parts} streaming={isLast && busy} />
                      <MarkdownLite>{text}</MarkdownLite>
                      <Sources parts={message.parts} />
                      <ToolTrace parts={message.parts} />
                    </div>
                  </div>
                )}

                {/* Bestätigungskarten stehen bewusst AUSSERHALB der Sprechblase:
                    sie sind eine Handlung des Nutzers, keine Aussage Athenas. */}
                {proposals.map((proposal) => (
                  <PendingActionCard
                    key={proposal.actionId}
                    actionId={proposal.actionId}
                    action={proposal.action}
                    label={proposal.label}
                    summary={proposal.summary}
                    details={proposal.details}
                    initialStatus={actionStatuses?.[proposal.actionId] ?? 'pending'}
                    initialResult={actionResults?.[proposal.actionId]}
                    className="self-start"
                  />
                ))}
              </div>
            )
          })}

          {status === 'submitted' && (
            <div className="flex gap-2.5">
              <AthenaAvatar size={28} thinking className="mt-0.5 hidden sm:inline-flex" />
              <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Athena arbeitet…
              </div>
            </div>
          )}

          {error && (
            <p className="self-start rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error.message || 'Etwas ist schiefgelaufen.'}
            </p>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* `bg-background` am Formular: die Statue im Hintergrund reicht bis zur
          Unterkante der Fläche und würde sonst blass hinter dem Eingabefeld
          durchscheinen. */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="relative border-t border-border bg-background p-3"
      >
        {/* Eingabefeld und Steuerung liegen in EINEM Rahmen: der Umschalter
            gehört zur Nachricht, die gerade getippt wird, und stand als
            eigene Zeile darüber wie ein losgelöstes Formular im Raum. Der
            Fokusring sitzt deshalb auf dem Container, nicht auf dem Feld. */}
        <div className="mx-auto w-full max-w-3xl rounded-xl border border-input bg-card shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="Frag Athena…"
            className="max-h-48 min-h-9 resize-none border-0 bg-transparent px-3 pb-0 pt-2.5 shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
          />
          <div className="flex items-center justify-between gap-2 p-2">
            <ModelEffortPicker />
            {busy ? (
              <Button type="button" size="icon-sm" variant="outline" onClick={stop} aria-label="Abbrechen">
                <Square className="size-3.5" />
              </Button>
            ) : (
              <Button type="submit" size="icon-sm" disabled={!input.trim()} aria-label="Senden">
                <Send className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}

const STARTERS = [
  'Wie hat sich mein Vermögen die letzten 6 Monate entwickelt?',
  'Welche Abos zahle ich, die ich kaum nutze?',
  'Kann ich mir im Herbst etwas für 3.000 € leisten?',
  'Finde unkategorisierte Buchungen und schlag Kategorien vor',
]

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      {/* Das Medaillon groß, bevor der erste Zug läuft: der leere Chat ist die
          einzige Stelle, an der Platz dafür ist, und danach steht dasselbe
          Gesicht klein an jeder Antwort. */}
      <AthenaAvatar size={72} />

      <div className="space-y-1.5">
        <p className="text-base font-medium text-foreground">Athena</p>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          Liest deine Finanzdaten, merkt sich, was dauerhaft gilt, recherchiert bei Bedarf im Web
          und schlägt Änderungen vor — ausgeführt wird nur, was du bestätigst.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {STARTERS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}
