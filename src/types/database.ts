import type { ExpenseItem } from './receipt'

export type Attraction = {
  id: string
  dayId: string
  name: string
  description: string
  startTime: string | null
  endTime: string | null
  cost: number
  latitude: number | null
  longitude: number | null
  duration: number
  transportMode: string | null
  travelTime: number | null
  placeId: string | null
  locationName: string | null
}

export type TripDay = {
  id: string
  itineraryId: string
  date: string
  startTime: string | null
  attractions: Attraction[]
}

export type Itinerary = {
  id: string
  title: string
  ownerId: string
  currency: string
  startDate?: string
  endDate?: string
  days?: TripDay[]
  exchangeRates?: Record<string, number>
  todoCategories?: string[]
}

export type TodoItem = {
  id: string
  itineraryId: string
  title: string
  isCompleted: boolean
  category: string
  imagePath: string | null
  images: string[]
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
