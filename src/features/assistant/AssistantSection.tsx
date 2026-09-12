
import type { Itinerary, TodoItem } from '../../types/database'
import { AssistantConversationView } from './components'

export function AssistantSection({
  itinerary,
  todos,
  todoCategories,
  onBack,
  onRegisterBrowserBackHandler,
}: {
  itinerary: Itinerary
  todos: TodoItem[]
  todoCategories: string[]
  onBack?: () => void
  onRegisterBrowserBackHandler?: ((handler: (() => boolean) | null) => void) | null
}) {
  return (
    <AssistantConversationView
      key={itinerary.id}
      itineraryId={itinerary.id}
      itinerary={itinerary}
      todos={todos}
      todoCategories={todoCategories}
      onBack={onBack}
      onRegisterBrowserBackHandler={onRegisterBrowserBackHandler}
    />
  )
}

export default AssistantSection
