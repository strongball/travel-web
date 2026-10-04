import { AIMessage, ToolMessage } from '@langchain/core/messages'
import { describe, expect, it } from 'vitest'
import { requestedActivityTimes, validateRequiredItineraryTimeTargets } from './itineraryTimeRequirements'
import { itineraryTimeTargetsSchema } from './itineraryToolSchema'
import type { AssistantOperation } from '../../types'

const operations: AssistantOperation[] = [{ type: 'update_attraction', attractionId: 'dinner', changes: { duration: 60 } }]
const previous = (times: string[]) => new ToolMessage({ tool_call_id: 'proposal', content: '使用者已檢視提案', artifact: { proposal: {
  timeChecks: times.map((targetStartTime, index) => ({ attractionId: `a-${index}`, targetStartTime, actualStartTime: targetStartTime, name: '活動', differenceMinutes: 0 })),
} } })

describe('required itinerary times', () => {
  it('interprets dinner, morning, noon and ambiguous clock expressions', () => {
    expect(requestedActivityTimes('早餐 9:00，午餐 12:00，晚餐 6:30')).toEqual([['09:00'], ['12:00'], ['18:30']])
    expect(requestedActivityTimes('晚上 6點半')).toEqual([['18:30']])
    expect(requestedActivityTimes('6:30')).toEqual([['06:30', '18:30']])
    expect(requestedActivityTimes('9:00 出發，晚餐 18:30')).toEqual([['18:30']])
  })

  it.each(['上午 11點-12點到商店', '上午 11-12點到商店', '上午 11:00～12:00到商店', '早上去市場，11點至12點到商店'])('recognizes one arrival window: %s', (text) => {
    expect(requestedActivityTimes(text)).toEqual([['11:00', '12:00']])
    expect(validateRequiredItineraryTimeTargets({ text, operations, modelMessages: [], targets: [{ attractionId: 'shop', startTime: '11:30' }] }))
      .toEqual([{ attractionId: 'shop', startTime: '11:00', endTime: '12:00' }])
  })

  it('keeps an explicit long daytime window intact', () => {
    expect(validateRequiredItineraryTimeTargets({ text: '上午9點到23點之間抵達', operations, modelMessages: [], targets: [{ attractionId: 'shop', startTime: '15:00' }] }))
      .toEqual([{ attractionId: 'shop', startTime: '09:00', endTime: '23:00' }])
  })

  it('interprets noon after a morning activity without turning it into midnight', () => {
    expect(requestedActivityTimes('早上去市場，12點到商店')).toEqual([['12:00']])
    expect(requestedActivityTimes('凌晨 12:00')).toEqual([['00:00']])
  })

  it('does not retain invalid target references or duplicate targets from failed calls', () => {
    const invalid = new AIMessage({ content: '', tool_calls: [{ id: 'invalid', name: 'propose_itinerary_edit', type: 'tool_call', args: {
      timeTargets: [{ startTime: '11:00' }, { startTime: '00:00' }],
    } }] })
    expect(itineraryTimeTargetsSchema.safeParse([{ startTime: '11:00' }]).success).toBe(false)
    expect(itineraryTimeTargetsSchema.safeParse([{ attractionId: 'shop', startTime: '11:00' }, { attractionId: 'shop', startTime: '12:00' }]).success).toBe(false)
    expect(() => validateRequiredItineraryTimeTargets({ text: '上午11點-12點到商店', operations, modelMessages: [invalid], targets: [{ attractionId: 'shop', startTime: '11:30' }] })).not.toThrow()
  })

  it('allows a range correction after its endpoints were mistaken for separate targets', () => {
    expect(() => validateRequiredItineraryTimeTargets({ text: '早上去市場，大概11點-12點到商店', operations,
      modelMessages: [previous(['11:00', '00:00'])], targets: [{ attractionId: 'shop', startTime: '11:30' }],
    })).not.toThrow()
  })

  it('does not widen a single appointment into an arbitrary window', () => {
    expect(validateRequiredItineraryTimeTargets({ text: '晚餐18:30', operations, modelMessages: [], targets: [{ attractionId: 'dinner', startTime: '18:30', endTime: '23:00' }] }))
      .toEqual([{ attractionId: 'dinner', startTime: '18:30' }])
  })

  it('keeps a current appointment strict after an earlier window', () => {
    const earlier = new AIMessage({ content: '', tool_calls: [{ id: 'window', name: 'propose_itinerary_edit', type: 'tool_call', args: { timeTargets: [{ attractionId: 'dinner', startTime: '18:00', endTime: '19:00' }] } }] })
    expect(validateRequiredItineraryTimeTargets({ text: '晚餐18:30', operations, modelMessages: [earlier], targets: [{ attractionId: 'dinner', startTime: '18:30' }] })).toEqual([{ attractionId: 'dinner', startTime: '18:30' }])
  })

  it('replaces an earlier window with an explicit refined time', () => {
    const feedback = new ToolMessage({ tool_call_id: 'proposal', content: JSON.stringify({ feedback: '改成下午1:00到' }) })
    expect(() => validateRequiredItineraryTimeTargets({ text: '上午11點-12點到商店', operations, modelMessages: [previous(['11:30']), feedback], targets: [{ attractionId: 'shop', startTime: '13:00' }] })).not.toThrow()
  })

  it('does not keep invented goals from failed model attempts', () => {
    const failed = new AIMessage({ content: '', tool_calls: [{ id: 'failed', name: 'propose_itinerary_edit', type: 'tool_call', args: {
      timeTargets: [{ attractionId: 'other', startTime: '14:00' }],
    } }] })
    expect(() => validateRequiredItineraryTimeTargets({ text: '晚餐18:30', operations, modelMessages: [failed], targets: [{ attractionId: 'dinner', startTime: '18:30' }] })).not.toThrow()
  })

  it('blocks omitted targets on the first attempt and during correction', () => {
    expect(() => validateRequiredItineraryTimeTargets({ text: '晚餐 6:30', operations, modelMessages: [], targets: [] })).toThrow('缺少 18:30')
    expect(() => validateRequiredItineraryTimeTargets({ text: '安排旅程', operations, modelMessages: [previous(['12:00', '18:30'])], targets: [{ attractionId: 'dinner', startTime: '18:30' }] })).toThrow('缺少 12:00')
  })

  it('allows correcting a mistaken morning interpretation of dinner', () => {
    expect(() => validateRequiredItineraryTimeTargets({ text: '晚餐 6:30', operations, modelMessages: [previous(['06:30'])], targets: [{ attractionId: 'dinner', startTime: '18:30' }] })).not.toThrow()
  })

  it('honors an explicit time change in refinement while preserving the other requested meal', () => {
    const feedback = new ToolMessage({ tool_call_id: 'proposal', content: JSON.stringify({ feedback: '晚餐改成 7:00' }) })
    expect(() => validateRequiredItineraryTimeTargets({ text: '午餐 12:00，晚餐 6:30', operations,
      modelMessages: [previous(['12:00', '18:30']), feedback], targets: [
        { attractionId: 'lunch', startTime: '12:00' }, { attractionId: 'dinner', startTime: '19:00' },
      ],
    })).not.toThrow()
  })
  it('preserves a second goal learned earlier even if the current request mentions only dinner', () => {
    expect(() => validateRequiredItineraryTimeTargets({ text: '晚餐 6:30', operations,
      modelMessages: [previous(['12:00', '18:30'])], targets: [{ attractionId: 'dinner', startTime: '18:30' }],
    })).toThrow('缺少 12:00')
  })

})
