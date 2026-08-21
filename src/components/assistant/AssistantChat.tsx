'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, isToolUIPart, getToolName, type UIMessage } from 'ai'
import { Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

function extractText(parts: UIMessage['parts']): string {
  return parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
}

/** Die "leichte" Tool-Trace-Variante aus dem Plan — Liste statt Graph-Bibliothek,
    aber ohne Architekturänderung später zu einem echten Diagramm ausbaubar. */
function ToolTrace({ parts }: { parts: UIMessage['parts'] }) {
  const toolParts = parts.filter(isToolUIPart)
  if (toolParts.length === 0) return null

  return (
    <details className="mt-1.5 text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none hover:text-foreground transition-colors">
        {toolParts.length} Werkzeug{toolParts.length === 1 ? '' : 'e'} verwendet
      </summary>
      <ol className="mt-1.5 space-y-1 pl-3">
        {toolParts.map((part) => (
          <li key={part.toolCallId} className="flex items-center gap-1.5">
            <span
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                part.state === 'output-available' && 'bg-emerald-500',
                part.state === 'output-error' && 'bg-destructive',
                (part.state === 'input-streaming' || part.state === 'input-available') &&
                  'bg-amber-400',
              )}
            />
            <code className="font-mono">{getToolName(part)}</code>
            {part.state === 'output-error' && <span className="text-destructive">Fehler</span>}
          </li>
        ))}
      </ol>
    </details>
  )
}

export function AssistantChat({ className }: { className?: string }) {
  // Ein Chat-Mount = eine Konversation. Dieselbe ID geht sowohl an useChat als
  // auch an die Route (siehe transport unten) — die Route legt beim ersten
  // Aufruf mit dieser ID die ai_conversations-Zeile an (upsert, siehe route.ts).
  const [chatId] = useState(() => crypto.randomUUID())
  const transport = useMemo(
    () => new DefaultChatTransport({ api: '/api/assistant', body: { conversationId: chatId } }),
    [chatId],
  )
  const { messages, sendMessage, status, error } = useChat({ id: chatId, transport })
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const busy = status === 'submitted' || status === 'streaming'

  function submit() {
    const text = input.trim()
    if (!text || busy) return
    sendMessage({ text })
    setInput('')
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-4">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Frag mich etwas zu deinen Finanzen — z.&nbsp;B. „Wie hat sich mein Vermögen die
              letzten 6 Monate entwickelt?“
            </p>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap',
                message.role === 'user'
                  ? 'self-end bg-primary text-primary-foreground'
                  : 'self-start bg-muted text-foreground',
              )}
            >
              {extractText(message.parts)}
              {message.role === 'assistant' && <ToolTrace parts={message.parts} />}
            </div>
          ))}
          {error && (
            <p className="self-start rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error.message || 'Etwas ist schiefgelaufen.'}
            </p>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="flex items-end gap-2 border-t border-border p-3"
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="Frag den Assistenten…"
          className="min-h-9 resize-none"
          disabled={busy}
        />
        <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Senden">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </form>
    </div>
  )
}
