import { Bot, User } from 'lucide-react'
import { HoverInfo } from '@/components/ui/hover-info'

/** Mensch-/Roboter-Icon mit Hover-Karte, woher der Eintrag stammt. */
export function Herkunft({ vonMensch, titel, text }: { vonMensch: boolean; titel: string; text: string }) {
  return (
    <HoverInfo titel={titel} text={text} bare className="mt-0.5 shrink-0 items-center text-muted-foreground">
      {vonMensch ? <User className="size-4" aria-label={titel} /> : <Bot className="size-4" aria-label={titel} />}
    </HoverInfo>
  )
}
