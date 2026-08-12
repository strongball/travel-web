import { describe, expect, it } from 'vitest'

import type { Attraction, Itinerary, TripDay } from '../../types/database'
import { daysForRange, recalculateDayTimes } from './travelWorkspaceUtils'

const itinerary = (days: TripDay[] = []): Itinerary => ({
  id: 'trip-1',
  title: 'Tokyo',
  ownerId: 'user-1',
  currency: 'JPY',
  days,
})

const day = (date: string): TripDay => ({
  id: `day-${date}`,
  itineraryId: 'trip-1',
  date,
  startTime: `${date}T09:00:00`,
  attractions: [],
})

const attraction = (
  id: string,
  duration: number,
  travelTime: number | null,
): Attraction => ({
  id,
  dayId: 'day-2026-08-12',
  name: id,
  description: '',
  startTime: null,
  endTime: null,
  cost: 0,
  latitude: null,
  longitude: null,
  duration,
  transportMode: 'transit',
  travelTime,
  placeId: null,
  locationName: null,
})

describe('daysForRange', () => {
  it('creates every calendar day and preserves an existing day', () => {
    const existing = day('2026-08-13')

    const result = daysForRange(
      itinerary([existing]),
      '2026-08-12',
      '2026-08-14',
    )

    expect(result.map((item) => item.date)).toEqual([
      '2026-08-12',
      '2026-08-13',
      '2026-08-14',
    ])
    expect(result[1]).toBe(existing)
    expect(result[0]).toMatchObject({
      itineraryId: 'trip-1',
      startTime: '2026-08-12T09:00:00',
      attractions: [],
    })
  })

  it('keeps the current days when the range is invalid', () => {
    const existing = [day('2026-08-13')]

    expect(daysForRange(itinerary(existing), '2026-08-14', '2026-08-12')).toBe(
      existing,
    )
  })
})

describe('recalculateDayTimes', () => {
  it('adds travel and visit durations in sequence', () => {
    const first = attraction('first', 60, 15)
    const second = attraction('second', 30, 10)
    const sourceDay = day('2026-08-12')

    const result = recalculateDayTimes(sourceDay, [first, second])

    expect(result.attractions).toMatchObject([
      {
        id: 'first',
        startTime: '2026-08-12T09:15:00',
        endTime: '2026-08-12T10:15:00',
      },
      {
        id: 'second',
        startTime: '2026-08-12T10:25:00',
        endTime: '2026-08-12T10:55:00',
      },
    ])
    expect(first.startTime).toBeNull()
    expect(sourceDay.attractions).toEqual([])
  })
})
