import {
  AsyncNotifier,
  asyncData,
  asyncError,
  asyncLoading,
  asyncNotifierProviderFamily,
} from '@stball/react-river'

import {
  createAssistantThread,
  deleteAssistantThread,
  listAssistantThreads,
  renameAssistantThread,
  updateAssistantThreadSummary,
  type AssistantThread,
} from '../lib/repositories'
import { userIdProvider } from './authProviders'

export class AssistantThreadsNotifier extends AsyncNotifier<AssistantThread[]> {
  private loadGeneration = 0
  private readonly itineraryId: string

  constructor(itineraryId: string) {
    super()
    this.itineraryId = itineraryId
  }

  async build(): Promise<AssistantThread[]> {
    const generation = ++this.loadGeneration
    const userId = this.ref.watch(userIdProvider)
    if (!userId) return []
    const threads = await listAssistantThreads(this.itineraryId)
    return generation === this.loadGeneration ? threads : this.state.data ?? threads
  }

  async refresh(): Promise<AssistantThread[]> {
    const generation = ++this.loadGeneration
    const previous = this.state.data ?? []
    this.state = asyncLoading(previous)
    try {
      const threads = await listAssistantThreads(this.itineraryId)
      if (generation === this.loadGeneration) {
        this.state = asyncData(threads)
        return threads
      }
      return this.state.data ?? threads
    } catch (error) {
      if (generation === this.loadGeneration) this.state = asyncError(error, previous)
      throw error
    }
  }

  async create(): Promise<AssistantThread> {
    const userId = this.ref.read(userIdProvider)
    if (!userId) throw new Error('請先登入')
    const thread = await createAssistantThread(this.itineraryId, userId)
    this.insert(thread)
    return thread
  }

  async rename(threadId: string, title: string): Promise<void> {
    await renameAssistantThread(threadId, title)
    this.patch(threadId, { title: title.trim() })
  }

  async delete(threadId: string): Promise<void> {
    await deleteAssistantThread(threadId)
    this.remove(threadId)
  }

  async updateSummary(threadId: string, summary: string): Promise<void> {
    await updateAssistantThreadSummary(threadId, summary)
    this.patch(threadId, { summary })
  }

  patch(threadId: string, changes: Partial<Pick<AssistantThread, 'title' | 'summary'>>) {
    const current = this.state.data
    if (!current) return []
    const target = current.find((thread) => thread.id === threadId)
    if (!target) return current
    const threads = [
      { ...target, ...changes },
      ...current.filter((thread) => thread.id !== threadId),
    ]
    return this.commit(threads)
  }

  private insert(thread: AssistantThread) {
    const current = this.state.data
    if (!current) return []
    const threads = [thread, ...current.filter((item) => item.id !== thread.id)]
    return this.commit(threads)
  }

  private remove(threadId: string) {
    const current = this.state.data
    if (!current) return []
    const threads = current.filter((thread) => thread.id !== threadId)
    return this.commit(threads)
  }

  private commit(threads: AssistantThread[]) {
    // A local mutation wins over any refresh that was already in flight.
    this.loadGeneration += 1
    this.state = asyncData(threads)
    return threads
  }
}

export const assistantThreadsProvider = asyncNotifierProviderFamily<
  AssistantThreadsNotifier,
  string
>(
  (itineraryId) => new AssistantThreadsNotifier(itineraryId),
  { name: 'assistantThreads' },
)
