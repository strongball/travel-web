import { AIMessage, ToolMessage } from '@langchain/core/messages'
import { describe, expect, it, vi } from 'vitest'
import { recordExecutionStep, restoredExecutionSteps } from './executionSteps'

describe('execution steps', () => {
  it('retains parameters and attaches results to the matching step without mutating previous state', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    const first = recordExecutionStep([], '讀行程', { toolCalls: [{ id: 'read', name: 'view_itinerary', label: '讀行程', args: { dayNumbers: [3] } }] })
    const next = recordExecutionStep(first, '規劃', undefined)
    const completed = recordExecutionStep(next, '結果', { results: [{ id: 'read', status: 'error', content: '參數錯誤' }] })
    expect(first[0].finishedAt).toBeUndefined()
    expect(completed).toHaveLength(2)
    expect(completed[0].results?.[0].content).toBe('參數錯誤')
    expect(completed[1].results).toBeUndefined()
    expect(recordExecutionStep(completed, null)).toBe(completed)
    vi.restoreAllMocks()
  })
  it('recovers failed tool calls from checkpoints without inventing execution times', () => {
    const steps = restoredExecutionSteps([
      new AIMessage({ content: '', tool_calls: [{ id: 'read', name: 'view_itinerary', args: { dayNumbers: [2] }, type: 'tool_call' }] }),
      new ToolMessage({ tool_call_id: 'read', content: '無效參數', status: 'error' }),
    ])
    expect(steps[0]).toMatchObject({ startedAt: 0, toolCalls: [{ args: { dayNumbers: [2] } }], results: [{ content: '無效參數', status: 'error' }] })
  })
})
