import { useAtom, useSetAtom } from 'jotai'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  downloadReceiptFiles,
  signedReceiptUrl,
} from '../../lib/expensesApi'
import type { OfflineMutation } from '../../lib/offlineStore'
import {
  appErrorAtom,
  expenseDraftAtom,
  expensesAtom,
  receiptResultAtom,
} from '../../state/appAtoms'
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
  const [draft, setDraft] = useAtom(expenseDraftAtom)
  const [receiptResult, setReceiptResult] = useAtom(receiptResultAtom)
  const setExpenses = useSetAtom(expensesAtom)
  const setError = useSetAtom(appErrorAtom)
  const [isScanning, setIsScanning] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [storedImageUrls, setStoredImageUrls] = useState<string[]>([])
  const originalImagePaths = useRef<string[]>([])

  useEffect(() => {
    let active = true
    const references = draft?.receiptImagePaths ?? []
    void Promise.all(
      references.map((reference) => signedReceiptUrl(reference).catch(() => '')),
    ).then((urls) => {
      if (active) setStoredImageUrls(urls)
    })
    return () => {
      active = false
    }
  }, [draft?.receiptImagePaths])

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
    setIsScanning(true)
    setError(null)
    try {
      const storedFiles = await downloadReceiptFiles(draft.receiptImagePaths)
      const { compressReceiptImages } = await import('../../lib/receiptImages')
      const images = await compressReceiptImages([
        ...storedFiles,
        ...draft.imageFiles,
      ])
      const { scanReceipt } = await import('../../lib/receiptApi')
      const result = await scanReceipt({
        targetLocale: navigator.language || 'zh-TW',
        currencyHint: draft.currency,
        images,
      })
      setReceiptResult(result)
      navigateView('review')
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : unexpectedErrorMessage)
    } finally {
      setIsScanning(false)
    }
  }, [draft, navigateView, setError, setReceiptResult, unexpectedErrorMessage])

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
      await enqueueOfflineMutation({
        operation: 'saveExpense',
        entityId: nextDraft.id,
        payload: {
          draft: nextDraft,
          originalImagePaths: originalImagePaths.current,
        },
      })
      const savedExpense: Expense = {
        ...nextDraft,
        id: nextDraft.id,
        imageUrl: nextDraft.receiptImagePaths[0] ?? null,
        items: nextDraft.items,
      }
      setExpenses((current) => {
        const exists = current.some((expense) => expense.id === savedExpense.id)
        return exists
          ? current.map((expense) => (expense.id === savedExpense.id ? savedExpense : expense))
          : [savedExpense, ...current]
      })
      setDraft(null)
      navigateView('workspace', 'replace')
      showNotice(queuedMessage || savedMessage)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : unexpectedErrorMessage)
    } finally {
      setIsSaving(false)
    }
  }, [draft, enqueueOfflineMutation, markDataMutation, navigateView, queuedMessage, savedMessage, setDraft, setError, setExpenses, showNotice, unexpectedErrorMessage])

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
    isScanning,
    receiptResult,
    setDraft,
    storedImageUrls,
  }
}
