import { type ReactNode } from 'react'
import type { Itinerary, TodoItem } from '../../types/database'
import { AssistantConversationView } from './components'
import { useAssistantConversation } from './useAssistantConversation'

export function AssistantSection({
  itinerary,
  todos,
  todoCategories,
  onItineraryApplied,
  fullPage = false,
  onAssistantToolbarChange,
}: {
  itinerary: Itinerary
  todos: TodoItem[]
  todoCategories: string[]
  onItineraryApplied: () => void | Promise<void>
  fullPage?: boolean
  onAssistantToolbarChange?: (toolbar: ReactNode) => void
}) {
  const conversation = useAssistantConversation(itinerary, onItineraryApplied, todos, todoCategories)
  return (
    <AssistantConversationView
      controller={conversation}
      fullPage={fullPage}
      onAssistantToolbarChange={onAssistantToolbarChange}
    />
  )
}

export default AssistantSection
