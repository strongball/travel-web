import type { ReactNode } from 'react'

import type { Itinerary, TodoItem } from '../../types/database'
import { AssistantConversationView } from './components'

export function AssistantSection({
  itinerary,
  todos,
  todoCategories,
  fullPage = false,
  onAssistantToolbarChange,
  onThreadChange,
  onRegisterBackHandler,
}: {
  itinerary: Itinerary
  todos: TodoItem[]
  todoCategories: string[]
  fullPage?: boolean
  onAssistantToolbarChange?: (toolbar: ReactNode) => void
  onThreadChange?: (threadId: string | null, threadTitle?: string) => void
  onRegisterBackHandler?: (handler: (() => boolean) | null) => void
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
      onThreadChange={onThreadChange}
      onRegisterBackHandler={onRegisterBackHandler}
    />
  )
}

export default AssistantSection
