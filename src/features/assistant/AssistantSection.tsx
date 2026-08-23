import type { ReactNode } from 'react'

import type { Itinerary, TodoItem } from '../../types/database'
import { AssistantConversationView } from './components'

export function AssistantSection({
  itinerary,
  todos,
  todoCategories,
  fullPage = false,
  onAssistantToolbarChange,
}: {
  itinerary: Itinerary
  todos: TodoItem[]
  todoCategories: string[]
  fullPage?: boolean
  onAssistantToolbarChange?: (toolbar: ReactNode) => void
}) {
  return (
    <AssistantConversationView
      key={itinerary.id}
      itineraryId={itinerary.id}
      itinerary={itinerary}
      todos={todos}
      todoCategories={todoCategories}
      fullPage={fullPage}
      onAssistantToolbarChange={onAssistantToolbarChange}
    />
  )
}

export default AssistantSection
