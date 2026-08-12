import { useCallback, useEffect, useRef, useState } from 'react'
import {
  deleteExpense,
  deleteItinerary,
  deleteReceiptImages,
  deleteTodo,
  saveExpense,
  saveItinerary,
  saveTodo,
  uploadReceiptImages,
} from '../lib/expensesApi'
import {
  countMutations,
  enqueueMutation,
  listMutations,
  removeMutation,
  type OfflineMutation,
  type StoredMutation,
} from '../lib/offlineStore'

export type SyncState = 'idle' | 'offline' | 'syncing' | 'error'

async function executeMutation(mutation: StoredMutation) {
  switch (mutation.operation) {
    case 'saveItinerary':
      return saveItinerary(mutation.payload)
    case 'deleteItinerary':
      return deleteItinerary(mutation.payload.id)
    case 'saveTodo':
      return saveTodo(mutation.payload)
    case 'deleteTodo':
      return deleteTodo(mutation.payload.id)
    case 'deleteExpense':
      await deleteExpense(mutation.payload.id)
      await deleteReceiptImages(mutation.payload.receiptImagePaths).catch(() => undefined)
      return
    case 'saveExpense': {
      let uploaded: string[] = []
      try {
        uploaded = mutation.payload.draft.imageFiles.length > 0
          ? await uploadReceiptImages(mutation.payload.draft.imageFiles)
          : []
        const nextDraft = {
          ...mutation.payload.draft,
          receiptImagePaths: [
            ...mutation.payload.draft.receiptImagePaths,
            ...uploaded,
          ],
          imageFiles: [],
        }
        await saveExpense(nextDraft)
        const removed = mutation.payload.originalImagePaths.filter(
          (reference) => !nextDraft.receiptImagePaths.includes(reference),
        )
        await deleteReceiptImages(removed).catch(() => undefined)
      } catch (error) {
        await deleteReceiptImages(uploaded).catch(() => undefined)
        throw error
      }
    }
  }
}

export function useOfflineSync(
  userId: string | null,
  onSynced: () => void | Promise<void>,
) {
  const [pendingCount, setPendingCount] = useState(0)
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [syncError, setSyncError] = useState<string | null>(null)
  const flushing = useRef(false)
  const onSyncedRef = useRef(onSynced)
  onSyncedRef.current = onSynced

  const refreshCount = useCallback(async () => {
    if (!userId) {
      setPendingCount(0)
      return 0
    }
    const count = await countMutations(userId)
    setPendingCount(count)
    return count
  }, [userId])

  const flush = useCallback(async () => {
    if (!userId || flushing.current) return
    if (!navigator.onLine) {
      setSyncState('offline')
      await refreshCount()
      return
    }

    flushing.current = true
    setSyncState('syncing')
    setSyncError(null)
    let completedAny = false
    let completedCleanly = false
    let remaining = 0
    try {
      const mutations = await listMutations(userId)
      for (const mutation of mutations) {
        await executeMutation(mutation)
        await removeMutation(mutation)
        completedAny = true
        setPendingCount((count) => Math.max(0, count - 1))
      }
      remaining = await refreshCount()
      completedCleanly = true
      setSyncState(remaining > 0 ? 'syncing' : 'idle')
      if (completedAny) await onSyncedRef.current()
    } catch (error) {
      setSyncState(navigator.onLine ? 'error' : 'offline')
      setSyncError(error instanceof Error ? error.message : '同步失敗')
      await refreshCount()
    } finally {
      flushing.current = false
      if (completedCleanly && remaining > 0 && navigator.onLine) {
        queueMicrotask(() => void flush())
      }
    }
  }, [refreshCount, userId])

  const enqueue = useCallback(async (mutation: OfflineMutation) => {
    if (!userId) throw new Error('請先登入')
    await enqueueMutation(userId, mutation)
    await refreshCount()
    if (navigator.onLine) void flush()
    else setSyncState('offline')
  }, [flush, refreshCount, userId])

  useEffect(() => {
    if (!userId) return
    void refreshCount().then((count) => {
      if (count > 0) void flush()
    })
    const handleOnline = () => void flush()
    const handleOffline = () => setSyncState('offline')
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [flush, refreshCount, userId])

  return { enqueue, flush, pendingCount, syncError, syncState }
}
