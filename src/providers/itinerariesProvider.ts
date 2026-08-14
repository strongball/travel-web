import {
  AsyncNotifier,
  asyncData,
  asyncError,
  asyncLoading,
  asyncNotifierProvider,
} from '@stball/react-river'

import { fetchItineraries } from '../lib/expensesApi'
import {
  applyPendingMutations,
  listMutations,
  loadSnapshot,
  type OfflineMutation,
} from '../lib/offlineStore'
import type { Itinerary } from '../types/database'
import { userIdProvider } from './authProviders'

export class ItinerariesNotifier extends AsyncNotifier<Itinerary[]> {
  async build(): Promise<Itinerary[]> {
    const userId = this.ref.watch(userIdProvider)
    if (!userId) return []
    try {
      const raw = await fetchItineraries()
      const pending = await listMutations(userId).catch(() => [])
      const applied = applyPendingMutations(
        { itineraries: raw, expenses: [], todos: [] },
        pending,
      )
      return applied.itineraries
    } catch (err) {
      const snapshot = await loadSnapshot(userId).catch(() => null)
      if (snapshot?.itineraries) return snapshot.itineraries
      throw err
    }
  }

  async save(
    itinerary: Itinerary,
    enqueue: (m: OfflineMutation) => Promise<void>,
  ): Promise<void> {
    const current = this.state.data ?? []
    const exists = current.some((item) => item.id === itinerary.id)
    const next = exists
      ? current.map((item) => (item.id === itinerary.id ? itinerary : item))
      : [itinerary, ...current]
    this.state = asyncData(next)
    await enqueue({
      operation: 'saveItinerary',
      entityId: itinerary.id,
      payload: itinerary,
    })
  }

  async delete(
    id: string,
    enqueue: (m: OfflineMutation) => Promise<void>,
  ): Promise<void> {
    const current = this.state.data ?? []
    const next = current.filter((item) => item.id !== id)
    this.state = asyncData(next)
    await enqueue({
      operation: 'deleteItinerary',
      entityId: id,
      payload: { id },
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
      const raw = await fetchItineraries()
      const pending = await listMutations(userId).catch(() => [])
      const applied = applyPendingMutations(
        { itineraries: raw, expenses: [], todos: [] },
        pending,
      )
      this.state = asyncData(applied.itineraries)
    } catch (err) {
      const snapshot = await loadSnapshot(userId).catch(() => null)
      if (snapshot?.itineraries) {
        this.state = asyncData(snapshot.itineraries)
      } else {
        this.state = asyncError(err, this.state.data)
      }
    }
  }
}

export const itinerariesProvider = asyncNotifierProvider(
  () => new ItinerariesNotifier(),
  { name: 'itineraries' },
)
