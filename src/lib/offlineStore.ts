import type { Expense, ExpenseDraft, Itinerary, TodoItem } from '../types/database'

const databaseName = 'travel-web-offline'
const databaseVersion = 1
const mutationStore = 'mutations'
const snapshotStore = 'snapshots'

export type OfflineMutation =
  | { operation: 'saveItinerary'; entityId: string; payload: Itinerary }
  | { operation: 'deleteItinerary'; entityId: string; payload: { id: string } }
  | { operation: 'saveTodo'; entityId: string; payload: TodoItem }
  | { operation: 'deleteTodo'; entityId: string; payload: { id: string } }
  | {
      operation: 'saveExpense'
      entityId: string
      payload: { draft: ExpenseDraft; originalImagePaths: string[] }
    }
  | {
      operation: 'deleteExpense'
      entityId: string
      payload: { id: string; receiptImagePaths: string[] }
    }

export type StoredMutation = OfflineMutation & {
  key: string
  userId: string
  createdAt: number
  updatedAt: number
}

export interface OfflineSnapshot {
  userId: string
  itineraries: Itinerary[]
  expenses: Expense[]
  todos: TodoItem[]
  updatedAt: number
}

type SnapshotData = Pick<OfflineSnapshot, 'itineraries' | 'expenses' | 'todos'>

const upsertById = <Value extends { id: string }>(items: Value[], value: Value) =>
  items.some((item) => item.id === value.id)
    ? items.map((item) => item.id === value.id ? value : item)
    : [value, ...items]

export function applyPendingMutations(
  data: SnapshotData,
  mutations: readonly StoredMutation[],
): SnapshotData {
  return mutations.reduce<SnapshotData>((current, mutation) => {
    switch (mutation.operation) {
      case 'saveItinerary':
        return {
          ...current,
          itineraries: upsertById(current.itineraries, mutation.payload),
        }
      case 'deleteItinerary':
        return {
          itineraries: current.itineraries.filter((item) => item.id !== mutation.payload.id),
          expenses: current.expenses.filter((item) => item.itineraryId !== mutation.payload.id),
          todos: current.todos.filter((item) => item.itineraryId !== mutation.payload.id),
        }
      case 'saveTodo':
        return { ...current, todos: upsertById(current.todos, mutation.payload) }
      case 'deleteTodo':
        return { ...current, todos: current.todos.filter((item) => item.id !== mutation.payload.id) }
      case 'saveExpense': {
        const draft = mutation.payload.draft
        const expense: Expense = {
          ...draft,
          id: mutation.entityId,
          imageUrl: draft.receiptImagePaths[0] ?? null,
        }
        return { ...current, expenses: upsertById(current.expenses, expense) }
      }
      case 'deleteExpense':
        return { ...current, expenses: current.expenses.filter((item) => item.id !== mutation.payload.id) }
    }
  }, data)
}

const entityGroup = (operation: OfflineMutation['operation']) => {
  if (operation.endsWith('Itinerary')) return 'itinerary'
  if (operation.endsWith('Todo')) return 'todo'
  return 'expense'
}

export const mutationKey = (userId: string, mutation: OfflineMutation) =>
  `${userId}:${entityGroup(mutation.operation)}:${mutation.entityId}`

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(databaseName, databaseVersion)
  request.onupgradeneeded = () => {
    const database = request.result
    if (!database.objectStoreNames.contains(mutationStore)) {
      const store = database.createObjectStore(mutationStore, { keyPath: 'key' })
      store.createIndex('userId', 'userId')
    }
    if (!database.objectStoreNames.contains(snapshotStore)) {
      database.createObjectStore(snapshotStore, { keyPath: 'userId' })
    }
  }
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})

const requestValue = <Value>(request: IDBRequest<Value>) =>
  new Promise<Value>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const transactionDone = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error)
    transaction.onerror = () => reject(transaction.error)
  })

export async function enqueueMutation(userId: string, mutation: OfflineMutation) {
  const database = await openDatabase()
  const transaction = database.transaction(mutationStore, 'readwrite')
  const store = transaction.objectStore(mutationStore)
  const key = mutationKey(userId, mutation)
  const request = store.get(key)
  request.onsuccess = () => {
    const existing = request.result as StoredMutation | undefined
    const now = Date.now()
    let nextMutation = mutation
    if (existing?.operation === 'saveExpense' && mutation.operation === 'saveExpense') {
      const files = [...existing.payload.draft.imageFiles, ...mutation.payload.draft.imageFiles]
      const uniqueFiles = files.filter((file, index) =>
        files.findIndex((candidate) =>
          candidate.name === file.name &&
          candidate.size === file.size &&
          candidate.lastModified === file.lastModified,
        ) === index,
      )
      nextMutation = {
        ...mutation,
        payload: {
          ...mutation.payload,
          draft: {
            ...mutation.payload.draft,
            imageFiles: uniqueFiles,
          },
        },
      }
    }
    store.put({
      ...nextMutation,
      key,
      userId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    } satisfies StoredMutation)
  }
  await transactionDone(transaction)
  database.close()
}

export async function listMutations(userId: string): Promise<StoredMutation[]> {
  const database = await openDatabase()
  const transaction = database.transaction(mutationStore, 'readonly')
  const mutations = await requestValue(
    transaction.objectStore(mutationStore).index('userId').getAll(userId),
  ) as StoredMutation[]
  await transactionDone(transaction)
  database.close()
  return mutations.sort((first, second) => first.createdAt - second.createdAt)
}

export async function removeMutation(mutation: StoredMutation) {
  const database = await openDatabase()
  const transaction = database.transaction(mutationStore, 'readwrite')
  const store = transaction.objectStore(mutationStore)
  const request = store.get(mutation.key)
  request.onsuccess = () => {
    const current = request.result as StoredMutation | undefined
    if (current?.updatedAt === mutation.updatedAt) store.delete(mutation.key)
  }
  await transactionDone(transaction)
  database.close()
}

export async function countMutations(userId: string) {
  const database = await openDatabase()
  const transaction = database.transaction(mutationStore, 'readonly')
  const count = await requestValue(
    transaction.objectStore(mutationStore).index('userId').count(userId),
  )
  await transactionDone(transaction)
  database.close()
  return count
}

export async function saveSnapshot(snapshot: Omit<OfflineSnapshot, 'updatedAt'>) {
  const database = await openDatabase()
  const transaction = database.transaction(snapshotStore, 'readwrite')
  transaction.objectStore(snapshotStore).put({ ...snapshot, updatedAt: Date.now() })
  await transactionDone(transaction)
  database.close()
}

export async function loadSnapshot(userId: string): Promise<OfflineSnapshot | null> {
  const database = await openDatabase()
  const transaction = database.transaction(snapshotStore, 'readonly')
  const snapshot = await requestValue(transaction.objectStore(snapshotStore).get(userId))
  await transactionDone(transaction)
  database.close()
  return (snapshot as OfflineSnapshot | undefined) ?? null
}
