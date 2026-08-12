import type { Attraction, Expense, Itinerary, TripDay } from '../../types/database'
import type { GoogleRoutePoint } from './googleMaps'

export type WorkspaceSection = 'schedule' | 'todos' | 'expenses' | 'overview'
export type WorkspaceView = 'trips' | 'detail'
export type WorkspaceRoute = {
  section: WorkspaceSection
  workspaceView: WorkspaceView
  itineraryId: string | null
}

export const transportOptions = [
  { value: 'driving', label: '開車' },
  { value: 'walking', label: '步行' },
  { value: 'transit', label: '大眾運輸' },
  { value: 'bicycling', label: '單車' },
] as const

export const transportLabel = (mode: string | null) =>
  transportOptions.find((option) => option.value === mode)?.label ?? '大眾運輸'

export const formatDate = (value: string | undefined, locale = 'zh-TW') => {
  if (!value) return '尚未設定日期'
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export const formatAmount = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat('zh-TW', {
      style: 'currency',
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString('zh-TW')}`
  }
}

export const convertExpenseAmount = (
  expense: Expense,
  itineraryCurrency: string,
  exchangeRates?: Record<string, number>,
) => {
  if (expense.currency === itineraryCurrency) return expense.amount
  return expense.amount * (exchangeRates?.[expense.currency] ?? 1)
}

export const emptyDay = (itineraryId: string, date: string): TripDay => ({
  id: crypto.randomUUID(),
  itineraryId,
  date,
  startTime: `${date}T09:00:00`,
  attractions: [],
})

export const daysForRange = (
  itinerary: Itinerary,
  startDate: string,
  endDate: string,
): TripDay[] => {
  const start = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return itinerary.days ?? []
  }
  const existing = new Map((itinerary.days ?? []).map((day) => [day.date.slice(0, 10), day]))
  const result: TripDay[] = []
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = cursor.toISOString().slice(0, 10)
    result.push(existing.get(date) ?? emptyDay(itinerary.id, date))
  }
  return result
}

export const formatItineraryTime = (totalMinutes: number) => {
  const hours = Math.floor(totalMinutes / 60) % 24
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export const recalculateDayTimes = (
  day: TripDay,
  attractions: Attraction[],
): TripDay => {
  const [startHour, startMinute] = (day.startTime?.slice(11, 16) ?? '09:00')
    .split(':')
    .map(Number)
  let currentMinutes =
    (Number.isFinite(startHour) ? startHour : 9) * 60 +
    (Number.isFinite(startMinute) ? startMinute : 0)
  return {
    ...day,
    attractions: attractions.map((attraction) => {
      currentMinutes += attraction.travelTime ?? 0
      const startTime = `${day.date.slice(0, 10)}T${formatItineraryTime(currentMinutes)}:00`
      currentMinutes += Math.max(attraction.duration, 0)
      const endTime = `${day.date.slice(0, 10)}T${formatItineraryTime(currentMinutes)}:00`
      return { ...attraction, startTime, endTime }
    }),
  }
}

export const emptyAttraction = (dayId: string): Attraction => ({
  id: crypto.randomUUID(),
  dayId,
  name: '',
  description: '',
  startTime: null,
  endTime: null,
  cost: 0,
  latitude: null,
  longitude: null,
  duration: 60,
  transportMode: 'transit',
  travelTime: null,
  placeId: null,
  locationName: null,
})

export const attractionMapPoint = (attraction: Attraction) =>
  attraction.latitude !== null && attraction.longitude !== null
    ? { lat: attraction.latitude, lng: attraction.longitude }
    : attraction.locationName?.trim() || attraction.name.trim()

export const hasAttractionMapReference = (attraction: Attraction) =>
  Boolean(
    attraction.placeId ||
      (attraction.latitude !== null && attraction.longitude !== null),
  )

export const attractionRoutePoint = (
  attraction: Attraction,
): GoogleRoutePoint | null => {
  const hasCoords = attraction.latitude !== null && attraction.longitude !== null
  const hasPlaceId = Boolean(attraction.placeId)
  const label = attraction.locationName?.trim() || attraction.name.trim() || null

  if (hasCoords || hasPlaceId || label) {
    return {
      lat: attraction.latitude,
      lng: attraction.longitude,
      placeId: attraction.placeId,
      label,
    }
  }
  return null
}
