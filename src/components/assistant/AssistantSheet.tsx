'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { AssistantChat } from '@/components/assistant/AssistantChat'

/** Global gemountet in AppShell — von jeder Seite aus per Klick erreichbar,
    daneben gibt es die volle Konversationsseite unter /assistant. */
export function AssistantSheet() {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="icon-lg"
          className="fixed bottom-5 right-5 z-40 rounded-full shadow-lg"
          aria-label="Assistent öffnen"
        >
          <Sparkles className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <SheetTitle>Assistent</SheetTitle>
        </SheetHeader>
        <AssistantChat className="flex-1" />
      </SheetContent>
    </Sheet>
  )
}
