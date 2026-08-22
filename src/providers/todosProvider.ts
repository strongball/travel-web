import {
  AsyncNotifier,
  asyncData,
  asyncError,
  asyncLoading,
  asyncNotifierProvider,
} from '@stball/react-river'

import { fetchTodos } from '../lib/repositories'
import {
  applyPendingMutations,
  listMutations,
  loadSnapshot,
  type OfflineMutation,
} from '../lib/offlineStore'
import type { TodoItem } from '../types/database'
import { userIdProvider } from './authProviders'

export class TodosNotifier extends AsyncNotifier<TodoItem[]> {
  private async loadData(userId: string): Promise<TodoItem[]> {
    try {
      const raw = await fetchTodos()
      const pending = await listMutations(userId).catch(() => [])
      const applied = applyPendingMutations(
        { itineraries: [], expenses: [], todos: raw },
        pending,
      )
      return applied.todos
    } catch (err) {
      const snapshot = await loadSnapshot(userId).catch(() => null)
      if (snapshot?.todos) return snapshot.todos
      throw err
    }
  }

  async build(): Promise<TodoItem[]> {
    const userId = this.ref.watch(userIdProvider)
    if (!userId) return []
    return this.loadData(userId)
  }

  async save(
    todo: TodoItem,
    enqueue: (m: OfflineMutation) => Promise<void>,
  ): Promise<void> {
    const current = this.state.data ?? []
    const exists = current.some((item) => item.id === todo.id)
    const next = exists
      ? current.map((item) => (item.id === todo.id ? todo : item))
      : [todo, ...current]
    this.state = asyncData(next)
    await enqueue({
      operation: 'saveTodo',
      entityId: todo.id,
      payload: todo,
    })
  }

  async delete(
    id: string,
    enqueue: (m: OfflineMutation) => Promise<void>,
  ): Promise<void> {
    const current = this.state.data ?? []
    const next = current.filter((item) => item.id !== id)
    this.state = asyncData(next)
    await enqueue({
      operation: 'deleteTodo',
      entityId: id,
      payload: { id },
    })
  }

  async refresh(): Promise<void> {
    this.state = asyncLoading(this.state.data)
    const userId = this.ref.read(userIdProvider)
    if (!userId) {
      this.state = asyncData([])
      return
    }
    try {
      const data = await this.loadData(userId)
      this.state = asyncData(data)
    } catch (err) {
      this.state = asyncError(err, this.state.data)
    }
  }
}

export const todosProvider = asyncNotifierProvider(
  () => new TodosNotifier(),
  { name: 'todos' },
)
