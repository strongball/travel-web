import { useEffect, type ReactNode } from 'react'
import type { Itinerary } from '../../types/database'
import { AssistantAppBarActions, AssistantConversationView } from './AssistantConversationView'
import { useAssistantConversation } from './useAssistantConversation'

export function AssistantSection({
  itinerary,
  onItineraryApplied,
  fullPage = false,
  onAssistantToolbarChange,
}: {
  itinerary: Itinerary
  onItineraryApplied: () => void | Promise<void>
  fullPage?: boolean
  onAssistantToolbarChange?: (toolbar: ReactNode) => void
}) {
  const conversation = useAssistantConversation(itinerary, onItineraryApplied)
  const {
    currentThread,
    deleteThread,
    deletingThreadId,
    manualSummarize,
    messages,
    online,
    sending,
    showThreadList,
  } = conversation
  useEffect(() => {
    if (!fullPage || !onAssistantToolbarChange) return
    onAssistantToolbarChange(
      <AssistantAppBarActions
        thread={currentThread}
        deletingThreadId={deletingThreadId}
        sending={sending}
        messageCount={messages.length}
        online={online}
        onConversationList={showThreadList}
        onSummarize={() => void manualSummarize()}
        onDelete={(threadId) => void deleteThread(threadId)}
      />,
    )
  }, [
    currentThread,
    deleteThread,
    deletingThreadId,
    fullPage,
    manualSummarize,
    messages.length,
    onAssistantToolbarChange,
    online,
    sending,
    showThreadList,
  ])

  useEffect(() => () => onAssistantToolbarChange?.(null), [onAssistantToolbarChange])

  return <AssistantConversationView controller={conversation} fullPage={fullPage} />
}

export default AssistantSection
