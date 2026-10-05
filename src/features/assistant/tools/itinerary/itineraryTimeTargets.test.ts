import { describe, expect, it } from 'vitest'
import type { Itinerary } from '../../../../types/database'
import { emptyAttraction } from '../../../travel/travelWorkspaceUtils'
import type { AssistantOperation } from '../../types'
import { applyItineraryOperations } from './itineraryOperations'
import { calculateItineraryTimeChecks } from './itineraryTimeTargets'
import type { ItineraryTimeTarget } from './itineraryToolSchema'

const itinerary: Itinerary = {
  id: 'trip', title: '旅行', ownerId: 'user', currency: 'TWD',
  days: [{
    id: 'day', itineraryId: 'trip', date: '2026-10-04',
    startTime: '2026-10-04T09:00:00', revision: 0,
    attractions: [
      { ...emptyAttraction('day'), id: 'visit', name: '景點', duration: 480 },
      { ...emptyAttraction('day'), id: 'dinner', name: '晚餐', travelTime: 30 },
    ],
  }],
}

const checks = (operations: AssistantOperation[], timeTargets: ItineraryTimeTarget[]) => calculateItineraryTimeChecks({
  afterDays: applyItineraryOperations(itinerary, operations), operations, timeTargets,
})

describe('continuous itinerary time information', () => {
  it('reports a missed dinner time without rejecting the proposal', () => {
    expect(checks([], [{ attractionId: 'dinner', startTime: '18:30' }])).toMatchObject([
      { actualStartTime: '17:30', differenceMinutes: -60 },
    ])
  })
  it.each([74, 90, 166])('reports arrival windows without enforcing a tolerance (%i)', (duration) => {
    expect(checks([{ type: 'update_attraction', attractionId: 'visit', changes: { duration } }],
      [{ attractionId: 'dinner', startTime: '11:00', endTime: '12:00' }])[0].actualStartTime).toBeDefined()
  })
  it('resolves new targets and reports multiple times', () => {
    expect(checks([{ type: 'add_attraction', dayId: 'day', attraction: {
      ...emptyAttraction('day'), id: 'shop', name: '商店', travelTime: 30,
    } }], [{ attractionId: 'visit', startTime: '09:00' }, { addOperationIndex: 0, startTime: '18:30' }])).toHaveLength(2)
  })
  it('only rejects invalid references and malformed tool inputs', () => {
    expect(() => checks([], [{ attractionId: 'missing', startTime: '18:30' }])).toThrow('找不到')
    expect(() => checks([], [{ addOperationIndex: 0, startTime: '18:30' }])).toThrow('新增景點操作')
    expect(() => checks([], [{ attractionId: 'dinner', startTime: '24:30' }])).toThrow()
  })
  it('does not impose a departure-time validation', () => {
    expect(checks([{ type: 'set_day_start_time', dayId: 'day', startTime: '10:00' }],
      [{ attractionId: 'dinner', startTime: '18:30' }])[0].actualStartTime).toBe('18:30')
  })
  it('does not infer targets or introduce gaps when no targets are supplied', () => {
    expect(checks([], [])).toEqual([])
    const days = applyItineraryOperations(itinerary, [{ type: 'update_attraction', attractionId: 'visit', changes: { duration: 480 } }])
    expect(days[0].attractions[1].startTime).toBe('2026-10-04T17:30:00')
    expect(days[0].attractions).toHaveLength(2)
  })
  it('reports a next-day arrival without wrapping it to a matching morning', () => {
    expect(checks([{ type: 'update_attraction', attractionId: 'visit', changes: { duration: 1440 } }],
      [{ attractionId: 'dinner', startTime: '09:30' }])[0]).toMatchObject({ actualStartTime: '33:30', differenceMinutes: 1440 })
  })
})
