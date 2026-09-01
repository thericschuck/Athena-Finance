import { Fragment, type ReactNode } from 'react'

/**
 * Minimaler Markdown-Renderer für Athenas Antworten.
 *
 * Bewusst kein `react-markdown`: gebraucht werden Fettdruck, Inline-Code,
 * Überschriften und Listen — der Rest (HTML-Einbettung, Bilder, Fußnoten) wäre
 * bei einem Modell-Output, den man nicht kontrolliert, eher Angriffsfläche als
 * Feature. Alles, was hier nicht erkannt wird, landet unverändert als Text auf
 * der Seite; es gibt keinen Pfad, auf dem Modell-Output zu HTML wird.
 */

/** Inline: **fett**, `code`, [text](url). */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*)|(`[^`]+`)|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g
  let last = 0
  let match: RegExpExecArray | null
  let i = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index))
    const [token] = match
    if (token.startsWith('**')) {
      out.push(
        <strong key={`${keyPrefix}-b${i}`} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      )
    } else if (token.startsWith('`')) {
      out.push(
        <code key={`${keyPrefix}-c${i}`} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
          {token.slice(1, -1)}
        </code>,
      )
    } else {
      const label = token.slice(1, token.indexOf(']'))
      const href = match[4]
      out.push(
        <a
          key={`${keyPrefix}-l${i}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          {label}
        </a>,
      )
    }
    last = match.index + token.length
    i++
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

type Block =
  | { type: 'p'; lines: string[] }
  | { type: 'h'; level: number; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }

function parseBlocks(source: string): Block[] {
  const blocks: Block[] = []
  for (const raw of source.split('\n')) {
    const line = raw.trimEnd()
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line)
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    const last = blocks.at(-1)

    if (heading) {
      blocks.push({ type: 'h', level: heading[1].length, text: heading[2] })
    } else if (bullet) {
      if (last?.type === 'ul') last.items.push(bullet[1])
      else blocks.push({ type: 'ul', items: [bullet[1]] })
    } else if (numbered) {
      if (last?.type === 'ol') last.items.push(numbered[1])
      else blocks.push({ type: 'ol', items: [numbered[1]] })
    } else if (line.trim() === '') {
      // Leerzeile beendet den laufenden Block, erzeugt aber keinen eigenen.
      if (last?.type === 'p') blocks.push({ type: 'p', lines: [] })
    } else if (last?.type === 'p' && last.lines.length > 0) {
      last.lines.push(line)
    } else {
      blocks.push({ type: 'p', lines: [line] })
    }
  }
  return blocks.filter((b) => b.type !== 'p' || b.lines.length > 0)
}

export function MarkdownLite({ children }: { children: string }) {
  const blocks = parseBlocks(children)

  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        if (block.type === 'h') {
          return (
            <p key={i} className="pt-1 text-sm font-semibold text-foreground">
              {renderInline(block.text, `h${i}`)}
            </p>
          )
        }
        if (block.type === 'ul' || block.type === 'ol') {
          const List = block.type === 'ul' ? 'ul' : 'ol'
          return (
            <List
              key={i}
              className={
                block.type === 'ul'
                  ? 'list-disc space-y-0.5 pl-5 marker:text-muted-foreground'
                  : 'list-decimal space-y-0.5 pl-5 marker:text-muted-foreground'
              }
            >
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item, `i${i}-${j}`)}</li>
              ))}
            </List>
          )
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {block.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && '\n'}
                {renderInline(line, `p${i}-${j}`)}
              </Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}
