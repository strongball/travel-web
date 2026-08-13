import { describe, expect, it } from 'vitest'
import type { TripDay } from '../../types/database'
import { placeEnrichmentCandidates } from './assistantPlaceEnrichment'

const day = (attractions: TripDay['attractions']): TripDay => ({
  id: 'day-1', itineraryId: 'trip-1', date: '2026-10-11', startTime: null, revision: 1, attractions,
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
  transportMode: 'walking',
  travelTime: 10,
  placeId,
  locationName: name,
})

describe('placeEnrichmentCandidates', () => {
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
