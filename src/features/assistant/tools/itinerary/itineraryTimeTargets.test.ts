import { describe, expect, it } from 'vitest'
import type { Itinerary } from '../../../../types/database'
import { emptyAttraction } from '../../../travel/travelWorkspaceUtils'
import type { AssistantOperation } from '../../types'
import { applyItineraryOperations } from './itineraryOperations'
import { validateItineraryTimeTargets } from './itineraryTimeTargets'
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

const validate = (operations: AssistantOperation[], timeTargets: ItineraryTimeTarget[]) => {
  const afterDays = applyItineraryOperations(itinerary, operations)
  validateItineraryTimeTargets({ beforeDays: itinerary.days!, afterDays, operations, timeTargets })
  return afterDays
}

describe('continuous itinerary time targets', () => {
  it.each([75, 90, 120, 150, 165])('accepts an arrival inside the full window (%i minutes)', (duration) => {
    expect(() => validate([{ type: 'update_attraction', attractionId: 'visit', changes: { duration } }],
      [{ attractionId: 'dinner', startTime: '11:00', endTime: '12:00' }])).not.toThrow()
  })

  it.each([74, 166])('rejects an arrival outside the window (%i minutes)', (duration) => {
    expect(() => validate([{ type: 'update_attraction', attractionId: 'visit', changes: { duration } }],
      [{ attractionId: 'dinner', startTime: '11:00', endTime: '12:00' }])).toThrow('允許區間前後 15 分鐘')
  })

  it('does not constrain departure on unrelated days', () => {
    const otherDay = { ...itinerary.days![0], id: 'other', attractions: [] }
    const beforeDays = [...itinerary.days!, otherDay]
    const afterDays = [...applyItineraryOperations(itinerary, [{ type: 'update_attraction', attractionId: 'visit', changes: { duration: 120 } }]), { ...otherDay, startTime: '2026-10-04T10:00:00' }]
    expect(() => validateItineraryTimeTargets({ beforeDays, afterDays, operations: [], timeTargets: [{ attractionId: 'dinner', startTime: '11:00', endTime: '12:00' }] })).not.toThrow()
  })

  it('rejects a 17:30 dinner with its calculated difference', () => {
    expect(() => validate([
      { type: 'update_attraction', attractionId: 'dinner', changes: { name: '晚餐' } },
    ], [{ attractionId: 'dinner', startTime: '18:30' }]))
      .toThrow('晚餐 目標 18:30，實際開始 17:30，差距 -60 分鐘')
  })

  it.each([525, 540, 555])('accepts the inclusive 15-minute tolerance (%i minutes)', (duration) => {
    const days = validate([
      { type: 'update_attraction', attractionId: 'visit', changes: { duration } },
    ], [{ attractionId: 'dinner', startTime: '18:30' }])
    expect(days[0].startTime).toBe(itinerary.days![0].startTime)
    expect(days[0].attractions).toHaveLength(2)
    expect(days[0].attractions[1].travelTime).toBe(30)
  })

  it('resolves a newly added target by its operations index', () => {
    const days = validate([
      { type: 'remove_attraction', attractionId: 'dinner' },
      { type: 'update_attraction', attractionId: 'visit', changes: { duration: 540 } },
      { type: 'add_attraction', dayId: 'day', attraction: {
        ...emptyAttraction('day'), id: 'new-dinner', name: '新晚餐', travelTime: 30,
      } },
    ], [{ addOperationIndex: 2, startTime: '18:30' }])
    expect(days[0].attractions[1].startTime).toBe('2026-10-04T18:30:00')
  })

  it('checks all targets, rejects missing targets and invalid references', () => {
    expect(() => validate([], [
      { attractionId: 'visit', startTime: '09:00' },
      { attractionId: 'dinner', startTime: '18:30' },
    ])).toThrow('晚餐')
    expect(() => validate([], [{ attractionId: 'missing', startTime: '18:30' }])).toThrow('找不到')
    expect(() => validate([], [{ addOperationIndex: 0, startTime: '18:30' }])).toThrow('新增景點操作')
    expect(() => validate([], [{ attractionId: 'dinner', addOperationIndex: 0, startTime: '18:30' }])).toThrow('擇一')
  })

  it('accepts multiple simultaneous targets after recalculation', () => {
    expect(() => validate([
      { type: 'update_attraction', attractionId: 'visit', changes: { duration: 540 } },
    ], [
      { attractionId: 'visit', startTime: '09:00' },
      { attractionId: 'dinner', startTime: '18:30' },
    ])).not.toThrow()
  })

  it('validates provider inputs at execution time', () => {
    expect(() => validate([], [{ attractionId: 'dinner', startTime: '24:30' }])).toThrow()
    expect(() => validate([], [{ addOperationIndex: -1, startTime: '18:30' }])).toThrow()
    expect(() => validate([], [{ addOperationIndex: 0.5, startTime: '18:30' }])).toThrow()
  })

  it('rejects changing departure time to meet a target', () => {
    expect(() => validate([
      { type: 'set_day_start_time', dayId: 'day', startTime: '10:00' },
    ], [{ attractionId: 'dinner', startTime: '18:30' }])).toThrow('維持當天出發時間')
  })

  it('keeps the original behavior when no targets are provided', () => {
    expect(validate([
      { type: 'set_day_start_time', dayId: 'day', startTime: '10:00' },
    ], [])[0].attractions[1].startTime).toBe('2026-10-04T18:30:00')
  })

  it('does not mistake a next-day arrival for the requested morning', () => {
    expect(() => validate([
      { type: 'update_attraction', attractionId: 'visit', changes: { duration: 1440 } },
    ], [{ attractionId: 'dinner', startTime: '09:30' }])).toThrow('+1440 分鐘')
  })
  it('returns the validated arrival and signed difference for proposal presentation', () => {
    const operations: AssistantOperation[] = [{ type: 'update_attraction', attractionId: 'visit', changes: { duration: 535 } }]
    expect(validateItineraryTimeTargets({ beforeDays: itinerary.days!, afterDays: applyItineraryOperations(itinerary, operations), operations,
      timeTargets: [{ attractionId: 'dinner', startTime: '18:30' }],
    })).toEqual([{ attractionId: 'dinner', name: '晚餐', targetStartTime: '18:30', actualStartTime: '18:25', differenceMinutes: -5 }])
  })

})
