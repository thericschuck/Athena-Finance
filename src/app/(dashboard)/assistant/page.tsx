import { AssistantChat } from '@/components/assistant/AssistantChat'

export default function AssistantPage() {
  return (
    <div className="flex h-full flex-col p-4 sm:p-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Assistent</h1>
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
        <AssistantChat />
      </div>
    </div>
  )
}
