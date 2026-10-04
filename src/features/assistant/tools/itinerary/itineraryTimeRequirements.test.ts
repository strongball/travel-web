import { AIMessage, ToolMessage } from '@langchain/core/messages'
import { describe, expect, it } from 'vitest'
import { requestedActivityTimes, validateRequiredItineraryTimeTargets } from './itineraryTimeRequirements'
import type { AssistantOperation } from '../../types'

const operations: AssistantOperation[] = [{ type: 'update_attraction', attractionId: 'dinner', changes: { duration: 60 } }]
const previous = (times: string[]) => new AIMessage({ content: '', tool_calls: [{ id: 'proposal', name: 'propose_itinerary_edit', args: {
  timeTargets: times.map((startTime, index) => ({ attractionId: `a-${index}`, startTime })),
}, type: 'tool_call' }] })

describe('required itinerary times', () => {
  it('interprets dinner, morning, noon and ambiguous clock expressions', () => {
    expect(requestedActivityTimes('早餐 9:00，午餐 12:00，晚餐 6:30')).toEqual([['09:00'], ['12:00'], ['18:30']])
    expect(requestedActivityTimes('晚上 6點半')).toEqual([['18:30']])
    expect(requestedActivityTimes('6:30')).toEqual([['06:30', '18:30']])
    expect(requestedActivityTimes('9:00 出發，晚餐 18:30')).toEqual([['18:30']])
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
