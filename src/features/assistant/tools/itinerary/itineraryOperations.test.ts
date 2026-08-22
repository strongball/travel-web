import { describe, expect, it } from 'vitest'
import type { Itinerary, TripDay } from '../../../../types/database'
import {
  applyItineraryOperations,
  changedDays,
  placeEnrichmentCandidates,
} from './itineraryOperations'

const itinerary: Itinerary = {
  id: 'trip-1',
  title: '東京',
  ownerId: 'user-1',
  currency: 'JPY',
  days: [
    {
      id: 'day-1',
      itineraryId: 'trip-1',
      date: '2026-08-12',
      startTime: '2026-08-12T09:00:00',
      revision: 3,
      attractions: [
        {
          id: 'a-1',
          dayId: 'day-1',
          name: '淺草寺',
          description: '',
          startTime: '2026-08-12T09:00:00',
          endTime: '2026-08-12T10:00:00',
          cost: 0,
          latitude: 35.7,
          longitude: 139.79,
          duration: 60,
          transportMode: 'transit',
          travelTime: null,
          placeId: 'place-1',
          locationName: '淺草寺',
        },
      ],
    },
    {
      id: 'day-2',
      itineraryId: 'trip-1',
      date: '2026-08-13',
      startTime: '2026-08-13T10:00:00',
      revision: 1,
      attractions: [],
    },
  ],
}

describe('applyItineraryOperations', () => {
  it('moves an attraction and recalculates the destination time', () => {
    const result = applyItineraryOperations(itinerary, [
      { type: 'move_attraction', attractionId: 'a-1', targetDayId: 'day-2', index: 0 },
    ])
    expect(result[0].attractions).toEqual([])
    expect(result[1].attractions[0]).toMatchObject({
      id: 'a-1',
      dayId: 'day-2',
      startTime: '2026-08-13T10:00:00',
      endTime: '2026-08-13T11:00:00',
    })
    expect(changedDays(itinerary.days ?? [], result).map((day) => day.id)).toEqual(['day-1', 'day-2'])
  })
})

describe('placeEnrichmentCandidates', () => {
  const day = (attractions: TripDay['attractions']): TripDay => ({
    id: 'day-1',
    itineraryId: 'trip-1',
    date: '2026-10-11',
    startTime: null,
    revision: 1,
    attractions,
  })

  const attraction = (id: string, name: string, placeId: string | null = null) => ({
    id,
    dayId: 'day-1',
    name,
    description: '',
    startTime: null,
    endTime: null,
    cost: 0,
    latitude: placeId ? 34.6687 : null,
    longitude: placeId ? 135.5013 : null,
    duration: 60,
    transportMode: 'walking' as const,
    travelTime: 10,
    placeId,
    locationName: name,
  })

  it('only returns newly added or renamed places with missing Google metadata', () => {
    const unchanged = attraction('old', '大阪城')
    const renamedBefore = attraction('renamed', '難波')
    const renamedAfter = attraction('renamed', '道頓堀')
    const complete = attraction('complete', '通天閣', 'place-1')
    const added = attraction('added', '黑門市場')
    const result = placeEnrichmentCandidates({
      beforeDays: [day([unchanged, renamedBefore])],
      afterDays: [day([unchanged, renamedAfter, complete, added])],
    })
    expect(result.map((item) => item.id)).toEqual(['renamed', 'added'])
  })
})
