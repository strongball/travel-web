import {
  AsyncNotifier,
  asyncData,
  asyncError,
  asyncLoading,
  asyncNotifierProvider,
} from '@stball/react-river'

import { fetchExpenses } from '../lib/repositories'
import {
  applyPendingMutations,
  listMutations,
  loadSnapshot,
  type OfflineMutation,
} from '../lib/offlineStore'
import type { Expense } from '../types/database'
import { userIdProvider } from './authProviders'

export class ExpensesNotifier extends AsyncNotifier<Expense[]> {
  private async loadData(userId: string): Promise<Expense[]> {
    try {
      const raw = await fetchExpenses()
      const pending = await listMutations(userId).catch(() => [])
      const applied = applyPendingMutations(
        { itineraries: [], expenses: raw, todos: [] },
        pending,
      )
      return applied.expenses
    } catch (err) {
      const snapshot = await loadSnapshot(userId).catch(() => null)
      if (snapshot?.expenses) return snapshot.expenses
      throw err
    }
  }

  async build(): Promise<Expense[]> {
    const userId = this.ref.watch(userIdProvider)
    if (!userId) return []
    return this.loadData(userId)
  }

  async save(
    savedExpense: Expense,
    originalImagePaths: string[],
    enqueue: (m: OfflineMutation) => Promise<void>,
  ): Promise<void> {
    const current = this.state.data ?? []
    const exists = current.some((item) => item.id === savedExpense.id)
    const next = exists
      ? current.map((item) => (item.id === savedExpense.id ? savedExpense : item))
      : [savedExpense, ...current]
    this.state = asyncData(next)
    await enqueue({
      operation: 'saveExpense',
      entityId: savedExpense.id,
      payload: {
        draft: {
          ...savedExpense,
          imageFiles: [],
          receiptImagePaths: savedExpense.receiptImagePaths ?? [],
        },
        originalImagePaths,
      },
    })
  }

  async delete(
    id: string,
    receiptImagePaths: string[] | undefined,
    enqueue: (m: OfflineMutation) => Promise<void>,
  ): Promise<void> {
    const current = this.state.data ?? []
    const next = current.filter((item) => item.id !== id)
    this.state = asyncData(next)
    await enqueue({
      operation: 'deleteExpense',
      entityId: id,
      payload: { id, receiptImagePaths: receiptImagePaths ?? [] },
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

export const expensesProvider = asyncNotifierProvider(
  () => new ExpensesNotifier(),
  { name: 'expenses' },
)
