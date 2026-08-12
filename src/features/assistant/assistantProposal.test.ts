import { describe, expect, it } from 'vitest'
import type { Itinerary } from '../../types/database'
import { applyAssistantOperations, changedDays } from './assistantProposal'

const itinerary: Itinerary = {
  id: 'trip-1', title: '東京', ownerId: 'user-1', currency: 'JPY',
  days: [
    { id: 'day-1', itineraryId: 'trip-1', date: '2026-08-12', startTime: '2026-08-12T09:00:00', revision: 3, attractions: [
      { id: 'a-1', dayId: 'day-1', name: '淺草寺', description: '', startTime: '2026-08-12T09:00:00', endTime: '2026-08-12T10:00:00', cost: 0, latitude: 35.7, longitude: 139.79, duration: 60, transportMode: 'transit', travelTime: null, placeId: 'place-1', locationName: '淺草寺' },
    ] },
    { id: 'day-2', itineraryId: 'trip-1', date: '2026-08-13', startTime: '2026-08-13T10:00:00', revision: 1, attractions: [] },
  ],
}

describe('applyAssistantOperations', () => {
  it('moves an attraction and recalculates the destination time', () => {
    const result = applyAssistantOperations(itinerary, [
      { type: 'move_attraction', attractionId: 'a-1', targetDayId: 'day-2', index: 0 },
    ])
    expect(result[0].attractions).toEqual([])
    expect(result[1].attractions[0]).toMatchObject({
      id: 'a-1', dayId: 'day-2', startTime: '2026-08-13T10:00:00', endTime: '2026-08-13T11:00:00',
    })
    expect(changedDays(itinerary.days ?? [], result).map((day) => day.id)).toEqual(['day-1', 'day-2'])
  })

  it('rejects incomplete reorder operations', () => {
    expect(() => applyAssistantOperations(itinerary, [
      { type: 'reorder_attractions', dayId: 'day-1', attractionIds: [] },
    ])).toThrow('景點排序資料不完整')
  })
})
