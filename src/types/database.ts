import type { ExpenseItem } from './receipt'

export type Itinerary = {
  id: string
  title: string
  ownerId: string
  currency: string
}

export type Expense = {
  id: string
  itineraryId: string
  attractionId: string | null
  title: string
  amount: number
  date: string
  currency: string
  note: string
  imageUrl: string | null
  receiptImagePaths: string[]
  receiptSourceLocale: string | null
  receiptTargetLocale: string | null
  receiptScannedAt: string | null
  items: ExpenseItem[]
}

export type ExpenseDraft = Omit<Expense, 'id' | 'items'> & {
  id?: string
  items: ExpenseItem[]
  imageFiles: File[]
}

export const emptyExpenseDraft = (itineraryId = ''): ExpenseDraft => ({
  itineraryId,
  attractionId: null,
  title: '',
  amount: 0,
  date: new Date().toISOString().slice(0, 10),
  currency: 'TWD',
  note: '',
  imageUrl: null,
  receiptImagePaths: [],
  receiptSourceLocale: null,
  receiptTargetLocale: null,
  receiptScannedAt: null,
  items: [],
  imageFiles: [],
})
