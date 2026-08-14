import { provider, stateProvider } from '@stball/react-river'

import type { ExpenseDraft, Itinerary } from '../types/database'
import { itinerariesProvider } from './itinerariesProvider'

export const selectedItineraryIdProvider = stateProvider<string | null>(
  () => null,
  { name: 'selectedItineraryId' },
)

export const selectedItineraryProvider = provider<Itinerary | null>(
  (ref) => {
    const itinerariesAsync = ref.watch(itinerariesProvider)
    const itineraries = itinerariesAsync.data ?? []
    const selectedId = ref.watch(selectedItineraryIdProvider)
    return itineraries.find((itinerary) => itinerary.id === selectedId) ?? itineraries[0] ?? null
  },
  { name: 'selectedItinerary' },
)

export const expenseDraftProvider = stateProvider<ExpenseDraft | null>(
  () => null,
  { name: 'expenseDraft' },
)

export const appErrorProvider = stateProvider<string | null>(() => null, {
  name: 'appError',
})
