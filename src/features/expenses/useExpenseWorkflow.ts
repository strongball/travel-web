import { useRiverMutation, useRiverRef, useRiverWatch } from '@stball/react-river'
import { useCallback, useRef, useState } from 'react'

import { downloadReceiptFiles } from '../../lib/repositories'
import type { OfflineMutation } from '../../lib/offlineStore'
import {
  appErrorProvider,
  expenseDraftProvider,
  expensesProvider,
  receiptResultProvider,
  signedReceiptUrlsFamily,
} from '../../providers'
import {
  emptyExpenseDraft,
  type Expense,
  type ExpenseDraft,
  type Itinerary,
} from '../../types/database'
import type { ReceiptScanResult } from '../../types/receipt'
import type { AppView } from '../../hooks/useBrowserNavigation'

type NavigateView = (view: AppView, mode?: 'push' | 'replace') => void

type UseExpenseWorkflowOptions = {
  itineraries: Itinerary[]
  selectedItineraryId: string | null
  navigateView: NavigateView
  enqueueOfflineMutation: (mutation: OfflineMutation) => Promise<void>
  markDataMutation: () => void
  showNotice: (message: string) => void
  queuedMessage: string
  unexpectedErrorMessage: string
  savedMessage: string
}

const EMPTY_IMAGE_PATHS: string[] = []
const EMPTY_IMAGE_URLS: string[] = []

export function useExpenseWorkflow({
  itineraries,
  selectedItineraryId,
  navigateView,
  enqueueOfflineMutation,
  markDataMutation,
  showNotice,
  queuedMessage,
  unexpectedErrorMessage,
  savedMessage,
}: UseExpenseWorkflowOptions) {
  const ref = useRiverRef()
  const draft = useRiverWatch(expenseDraftProvider)
  const receiptResult = useRiverWatch(receiptResultProvider)
  const imagePaths = draft?.receiptImagePaths ?? EMPTY_IMAGE_PATHS
  const storedImageUrlsAsync = useRiverWatch(signedReceiptUrlsFamily(imagePaths))
  const storedImageUrls = storedImageUrlsAsync.data ?? EMPTY_IMAGE_URLS

  const setDraft = useCallback(
    (value: ExpenseDraft | null | ((current: ExpenseDraft | null) => ExpenseDraft | null)) => {
      ref.set(expenseDraftProvider, value)
    },
    [ref],
  )
  const setReceiptResult = useCallback(
    (value: ReceiptScanResult | null | ((current: ReceiptScanResult | null) => ReceiptScanResult | null)) => {
      ref.set(receiptResultProvider, value)
    },
    [ref],
  )
  const setError = useCallback(
    (value: string | null | ((current: string | null) => string | null)) => {
      ref.set(appErrorProvider, value)
    },
    [ref],
  )

  const [isSaving, setIsSaving] = useState(false)
  const originalImagePaths = useRef<string[]>([])

  const { mutate: mutateScan, state: scanState } = useRiverMutation(
    async (_mutationRef, currentDraft: ExpenseDraft) => {
      const storedFiles = await downloadReceiptFiles(currentDraft.receiptImagePaths)
      const { compressReceiptImages } = await import('../../lib/receiptImages')
      const images = await compressReceiptImages([
        ...storedFiles,
        ...currentDraft.imageFiles,
      ])
      const { scanReceipt } = await import('../../lib/receiptApi')
      return scanReceipt({
        targetLocale: navigator.language || 'zh-TW',
        currencyHint: currentDraft.currency,
        images,
      })
    },
    {
      onSuccess: (result, _variables, _context, mutationRef) => {
        mutationRef.set(receiptResultProvider, result)
        navigateView('review')
      },
      onError: (scanError, _variables, _context, mutationRef) => {
        mutationRef.set(
          appErrorProvider,
          scanError instanceof Error ? scanError.message : unexpectedErrorMessage,
        )
      },
    },
  )

  const openDraft = useCallback((nextDraft: ExpenseDraft) => {
    setError(null)
    setDraft(nextDraft)
    originalImagePaths.current = [...nextDraft.receiptImagePaths]
    navigateView('editor')
  }, [navigateView, setDraft, setError])

  const handleAdd = useCallback((itineraryId?: string) => {
    const itinerary =
      itineraries.find((item) => item.id === itineraryId) ??
      itineraries.find((item) => item.id === selectedItineraryId) ??
      itineraries[0]
    openDraft({
      ...emptyExpenseDraft(itinerary?.id ?? ''),
      currency: itinerary?.currency ?? 'TWD',
    })
  }, [itineraries, openDraft, selectedItineraryId])

  const handleEdit = useCallback((expense: Expense) => {
    openDraft({
      ...expense,
      date: expense.date.slice(0, 10),
      imageFiles: [],
    })
  }, [openDraft])

  const handleScan = useCallback(async () => {
    if (!draft) return
    setError(null)
    try {
      await mutateScan(draft)
    } catch {
      // Error handled by mutation onError callback
    }
  }, [draft, mutateScan, setError])

  const applyReceipt = useCallback((result: ReceiptScanResult) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            items: result.items,
            amount: result.receiptTotal ?? current.amount,
            currency: result.detectedCurrency ?? current.currency,
            receiptSourceLocale: result.sourceLocale,
            receiptTargetLocale: result.targetLocale,
            receiptScannedAt: new Date().toISOString(),
          }
        : current,
    )
    setReceiptResult(null)
    navigateView('editor', 'replace')
  }, [navigateView, setDraft, setReceiptResult])

  const handleSave = useCallback(async () => {
    if (!draft) return
    markDataMutation()
    setIsSaving(true)
    setError(null)
    try {
      const nextDraft = {
        ...draft,
        id: draft.id ?? crypto.randomUUID(),
      }
      const savedExpense: Expense = {
        ...nextDraft,
        id: nextDraft.id,
        imageUrl: nextDraft.receiptImagePaths[0] ?? null,
        items: nextDraft.items,
      }
      await ref.read(expensesProvider.notifier).save(
        savedExpense,
        originalImagePaths.current,
        enqueueOfflineMutation,
      )
      setDraft(null)
      navigateView('workspace', 'replace')
      showNotice(queuedMessage || savedMessage)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : unexpectedErrorMessage)
    } finally {
      setIsSaving(false)
    }
  }, [draft, enqueueOfflineMutation, markDataMutation, navigateView, queuedMessage, ref, savedMessage, setDraft, setError, showNotice, unexpectedErrorMessage])

  const cancelEditor = useCallback(() => {
    setDraft(null)
    setError(null)
    navigateView('workspace', 'replace')
  }, [navigateView, setDraft, setError])

  const cancelReview = useCallback(() => {
    setReceiptResult(null)
    navigateView('editor', 'replace')
  }, [navigateView, setReceiptResult])

  return {
    applyReceipt,
    cancelEditor,
    cancelReview,
    draft,
    handleAdd,
    handleEdit,
    handleSave,
    handleScan,
    isSaving,
    isScanning: scanState.isLoading,
    receiptResult,
    setDraft,
    storedImageUrls,
  }
}
