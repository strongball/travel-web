import type { AssistantOperation } from '../../types'
import type { Itinerary } from '../../../../types/database'
import { saveItinerary, saveTodo } from '../../../../lib/expensesApi'

export function extractProposedTodos(operations: AssistantOperation[]): Array<{ title: string; category: string }> {
  return operations
    .filter((op): op is { type: 'add_todo'; title: string; category?: string } => op.type === 'add_todo')
    .map((op) => ({
      title: op.title.trim(),
      category: op.category?.trim() || '行前準備',
    }))
}

export function extractProposedCategories(operations: AssistantOperation[]): string[] {
  return operations
    .filter((op): op is { type: 'add_todo_category'; name: string } => op.type === 'add_todo_category')
    .map((op) => op.name.trim())
}

export async function applyTodoProposal(
  itinerary: Itinerary,
  proposedTodos: Array<{ title: string; category: string }>,
  proposedCategories: string[],
) {
  if (proposedCategories.length > 0) {
    const currentCats = itinerary.todoCategories ?? ['行前準備', '旅途中', '其他']
    const newCats = proposedCategories.filter((c) => !currentCats.includes(c))
    if (newCats.length > 0) {
      await saveItinerary({
        ...itinerary,
        todoCategories: [...currentCats, ...newCats],
      })
    }
  }

  if (proposedTodos.length > 0) {
    for (const todo of proposedTodos) {
      await saveTodo({
        id: crypto.randomUUID(),
        itineraryId: itinerary.id,
        title: todo.title,
        isCompleted: false,
        category: todo.category || '行前準備',
        imagePath: null,
        images: [],
      })
    }
  }
}
