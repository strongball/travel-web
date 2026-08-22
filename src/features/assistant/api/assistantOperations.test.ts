import { describe, expect, it } from 'vitest'
import type { Itinerary } from '../../../types/database'
import {
  parseAssistantOperations,
  validateAssistantOperations,
} from './assistantOperations'

const itinerary: Itinerary = {
  id: 'trip-1',
  title: 'Test trip',
  ownerId: 'user-1',
  currency: 'TWD',
  days: [
    {
      id: 'day-1',
      itineraryId: 'trip-1',
      date: '2026-08-14',
      startTime: '2026-08-14T09:00:00',
      revision: 1,
      attractions: [{
        id: 'a-1',
        dayId: 'day-1',
        name: 'Existing place',
        description: '',
        startTime: null,
        endTime: null,
        cost: 0,
        latitude: null,
        longitude: null,
        duration: 60,
        transportMode: null,
        travelTime: null,
        placeId: null,
        locationName: null,
      }],
    },
    {
      id: 'day-2',
      itineraryId: 'trip-1',
      date: '2026-08-15',
      startTime: '2026-08-15T09:00:00',
      revision: 1,
      attractions: [],
    },
  ],
}

const newAttraction = () => ({
  name: 'New place',
  duration: 60,
  transportMode: null,
  travelTime: null,
  locationName: null,
})

const canonicalAttraction = (id: string) => ({
  id,
  name: 'New place',
  description: '',
  duration: 60,
  transportMode: null,
  travelTime: null,
  locationName: null,
  placeId: null,
  latitude: null,
  longitude: null,
  cost: 0,
})

describe('assistant operation contract', () => {
  it('validates operation branches and supports both flat and nested updates', () => {
    expect(() => parseAssistantOperations([{
      type: 'add_attraction',
      dayId: 'day-1',
      attraction: { ...newAttraction(), duration: 0 },
    }])).toThrow('Unsupported assistant operation')

    const flatResult = parseAssistantOperations([{
      type: 'update_attraction',
      attractionId: 'a-1',
      duration: 120,
    }])
    expect(flatResult[0]).toEqual({
      type: 'update_attraction',
      attractionId: 'a-1',
      changes: { duration: 120 },
    })

    const nestedResult = parseAssistantOperations([{
      type: 'update_attraction',
      attractionId: 'a-1',
      changes: { duration: 90 },
    }])
    expect(nestedResult[0]).toEqual({
      type: 'update_attraction',
      attractionId: 'a-1',
      changes: { duration: 90 },
    })
  })

  it('normalizes and validates HH:mm while rejecting invalid duration, transport, and empty text', () => {
    expect(parseAssistantOperations([{
      type: 'set_day_start_time',
      dayId: 'day-1',
      startTime: ' 09:05 ',
    }])).toEqual([{
      type: 'set_day_start_time',
      dayId: 'day-1',
      startTime: '09:05',
    }])
    expect(() => parseAssistantOperations([{
      type: 'set_day_start_time',
      dayId: 'day-1',
      startTime: '24:00',
    }])).toThrow('Unsupported assistant operation')
    expect(() => parseAssistantOperations([{
      type: 'add_attraction',
      dayId: 'day-1',
      attraction: { ...newAttraction(), transportMode: 'taxi' },
    }])).toThrow('Unsupported assistant operation')
    expect(() => parseAssistantOperations([{
      type: 'add_attraction',
      dayId: 'day-1',
      attraction: { ...newAttraction(), name: '   ' },
    }])).toThrow('Unsupported assistant operation')
    expect(() => parseAssistantOperations([{
      type: 'add_todo',
      title: '   ',
    }])).toThrow('Unsupported assistant operation')
  })
})

describe('validateAssistantOperations', () => {
  it('validates references sequentially, including add-then-update/move/reorder', () => {
    const [add] = parseAssistantOperations([
      { type: 'add_attraction', dayId: 'day-2', attraction: newAttraction() },
    ])
    if (!add || add.type !== 'add_attraction') throw new Error('Expected add operation')
    const operations = [
      add,
      { type: 'update_attraction' as const, attractionId: add.attraction.id, changes: { duration: 90 } },
      { type: 'move_attraction' as const, attractionId: add.attraction.id, targetDayId: 'day-1', index: 0 },
      { type: 'reorder_attractions' as const, dayId: 'day-1', attractionIds: [add.attraction.id, 'a-1'] },
    ]
    expect(() => validateAssistantOperations(itinerary, operations)).not.toThrow()
  })

  it('rejects incomplete reorder, duplicate IDs, and references after removal', () => {
    expect(() => validateAssistantOperations(itinerary, parseAssistantOperations([{
      type: 'reorder_attractions',
      dayId: 'day-1',
      attractionIds: [],
    }]))).toThrow('排序資料不完整')

    expect(() => validateAssistantOperations(itinerary, [{
      type: 'add_attraction',
      dayId: 'day-1',
      attraction: canonicalAttraction('a-1'),
    }])).toThrow('景點 ID 已存在 a-1')

    expect(() => validateAssistantOperations(itinerary, parseAssistantOperations([
      { type: 'remove_attraction', attractionId: 'a-1' },
      { type: 'update_attraction', attractionId: 'a-1', changes: { duration: 90 } },
    ]))).toThrow('找不到景點 a-1')
  })

  it('does not treat todo operations as itinerary references', () => {
    expect(() => validateAssistantOperations(itinerary, parseAssistantOperations([
      { type: 'add_todo_category', name: '行前準備' },
      { type: 'add_todo', title: '確認票券', category: '行前準備' },
    ]))).not.toThrow()
  })
})
