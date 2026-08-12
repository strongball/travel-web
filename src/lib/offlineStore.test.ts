import { describe, expect, it } from 'vitest'
import { applyPendingMutations, mutationKey, type StoredMutation } from './offlineStore'
import type { Itinerary, TodoItem } from '../types/database'

const itinerary: Itinerary = {
  id: 'trip-1',
  title: 'Tokyo',
  ownerId: 'user-1',
  currency: 'JPY',
}

const todo: TodoItem = {
  id: 'todo-1',
  itineraryId: itinerary.id,
  title: 'Pack',
  isCompleted: false,
  category: 'Before trip',
  imagePath: null,
  images: [],
}

const stored = (mutation: Omit<StoredMutation, 'key' | 'userId' | 'createdAt' | 'updatedAt'>): StoredMutation => ({
  ...mutation,
  key: `user-1:${mutation.entityId}`,
  userId: 'user-1',
  createdAt: 1,
  updatedAt: 1,
} as StoredMutation)

describe('offline mutations', () => {
  it('uses one key for consecutive changes to the same entity', () => {
    expect(mutationKey('user-1', {
      operation: 'saveItinerary',
      entityId: itinerary.id,
      payload: itinerary,
    })).toBe(mutationKey('user-1', {
      operation: 'deleteItinerary',
      entityId: itinerary.id,
      payload: { id: itinerary.id },
    }))
  })

  it('overlays pending saves and cascading deletes on remote data', () => {
    const saved = applyPendingMutations(
      { itineraries: [], expenses: [], todos: [] },
      [
        stored({ operation: 'saveItinerary', entityId: itinerary.id, payload: itinerary }),
        stored({ operation: 'saveTodo', entityId: todo.id, payload: todo }),
      ],
    )
    expect(saved.itineraries).toEqual([itinerary])
    expect(saved.todos).toEqual([todo])

    const deleted = applyPendingMutations(saved, [
      stored({
        operation: 'deleteItinerary',
        entityId: itinerary.id,
        payload: { id: itinerary.id },
      }),
    ])
    expect(deleted).toEqual({ itineraries: [], expenses: [], todos: [] })
  })
})
