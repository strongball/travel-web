import { MemorySaver } from '@langchain/langgraph/web'
import { AIMessage, type BaseMessage } from '@langchain/core/messages'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Itinerary } from '../../../types/database'

const assistantGraphMocks = vi.hoisted(() => ({
  invokeAssistantModel: vi.fn(),
  summarizeWithGemini: vi.fn(),
}))

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  invokeAssistantModel: assistantGraphMocks.invokeAssistantModel,
  summarizeWithGemini: assistantGraphMocks.summarizeWithGemini,
}))

import {
  createAssistantGraph,
  recentAssistantMessages,
  shouldSummarizeMessages,
} from './assistantGraph'
import type { AssistantGraphNodeState } from './graphState'
import { routeAfterRespond, routeAfterTools } from './routing'
import {
  parseAssistantOperations,
  validateAssistantOperations,
} from '../api'
import type {
  AssistantMessage,
  AssistantProposalPersistence,
  AssistantTurnRequest,
  ItineraryChangeProposal,
} from '../types'

const itinerary: Itinerary = {
  id: 'trip-1',
  title: 'Tokyo',
  ownerId: 'user-1',
  currency: 'JPY',
  startDate: '2026-09-01',
  days: [{
    id: 'day-1',
    itineraryId: 'trip-1',
    date: '2026-09-01',
    startTime: '2026-09-01T09:00:00',
    revision: 0,
    attractions: [{
      id: 'place-1',
      dayId: 'day-1',
      name: '淺草寺',
      description: '',
      startTime: '2026-09-01T09:00:00',
      endTime: '2026-09-01T10:00:00',
      cost: 0,
      latitude: 35.7148,
      longitude: 139.7967,
      duration: 60,
      transportMode: 'transit',
      travelTime: null,
      placeId: 'google-place-1',
      locationName: '淺草寺',
    }],
  }],
}

const request = (): AssistantTurnRequest => ({
  threadId: crypto.randomUUID(),
  turnId: crypto.randomUUID(),
  text: '幫我把第一天改成十點開始',
  itinerary,
  dayRevisions: { 'day-1': 3 },
})

const persistence = (): AssistantProposalPersistence & { saved: ItineraryChangeProposal[] } => {
  const result = {
    saved: [] as ItineraryChangeProposal[],
    async savePending(proposal: ItineraryChangeProposal) { result.saved.push(proposal) },
  }
  return result
}

beforeEach(() => {
  assistantGraphMocks.invokeAssistantModel.mockReset()
  assistantGraphMocks.summarizeWithGemini.mockReset()
  assistantGraphMocks.invokeAssistantModel.mockResolvedValue(new AIMessage({ content: '完成' }))
  assistantGraphMocks.summarizeWithGemini.mockResolvedValue('summary')
})

describe('assistant graph helpers', () => {
  it('parses only supported operations and validates itinerary references', () => {
    const operations = parseAssistantOperations([{
      type: 'set_day_start_time',
      dayId: 'day-1',
      startTime: '10:00',
    }])
    expect(operations).toEqual([{
      type: 'set_day_start_time',
      dayId: 'day-1',
      startTime: '10:00',
    }])
    expect(() => validateAssistantOperations(itinerary, operations)).not.toThrow()
    expect(() => validateAssistantOperations(itinerary, [{
      type: 'remove_attraction',
      attractionId: 'missing',
    }])).toThrow('找不到景點 missing')
    expect(() => parseAssistantOperations([{ type: 'delete_trip' }])).toThrow('Unsupported assistant operation')
  })

  it('allows a new attraction without a Google match', () => {
    expect(() => validateAssistantOperations(itinerary, [{
      type: 'add_attraction',
      dayId: 'day-1',
      attraction: {
        id: 'new-place',
        name: 'Unknown',
        description: '',
        cost: 0,
        latitude: null,
        longitude: null,
        duration: 60,
        transportMode: null,
        travelTime: null,
        placeId: null,
        locationName: null,
      },
    }])).not.toThrow()
  })

  it('uses message and character thresholds and keeps the recent window', () => {
    const messages: AssistantMessage[] = Array.from({ length: 4 }, (_, index) => ({
      id: `${index}`,
      turnId: `${index}`,
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: 'hello',
      createdAt: '2026-08-12T00:00:00.000Z',
    }))
    expect(shouldSummarizeMessages(messages, 4, 1_000)).toBe(true)
    expect(shouldSummarizeMessages(messages, 10, 20)).toBe(true)
    expect(recentAssistantMessages(messages, 2).map((message) => message.id)).toEqual(['2', '3'])
  })
})

describe('assistant graph routing', () => {
  const state = (toolCallKind: AssistantGraphNodeState['toolCallKind'], toolRound: number) => ({
    toolCallKind,
    toolRound,
  } as AssistantGraphNodeState)

  it('returns to respond after a continuing tool and stops at the round limit', () => {
    expect(routeAfterRespond(state('continuing', 0), 4)).toBe('execute_tools')
    expect(routeAfterTools(state('continuing', 1), 4)).toBe('respond')
    expect(routeAfterTools(state('continuing', 4), 4)).toBe('tool_limit')
  })

  it('finalizes direct text and terminal proposal tool calls', () => {
    expect(routeAfterRespond(state(null, 0), 4)).toBe('finalize_response')
    expect(routeAfterTools(state('terminal', 1), 4)).toBe('finalize_response')
  })
})

describe('createAssistantGraph', () => {
  it('completes a regular turn', async () => {
    assistantGraphMocks.invokeAssistantModel.mockResolvedValue(new AIMessage({ content: '第一天目前從九點開始。' }))
    const graph = createAssistantGraph(new MemorySaver(), {
      proposals: persistence(),
    })
    const result = await graph.sendTurn({ ...request(), text: '第一天幾點開始？' })
    expect(result.messages.map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(result.assistantMessage?.content).toBe('第一天目前從九點開始。')
    expect(result.modelMessages).toEqual([])
    expect(result.toolRound).toBe(0)
  })

  it('reports actual graph phases instead of rotating simulated messages', async () => {
    const graph = createAssistantGraph(new MemorySaver(), {
      proposals: persistence(),
    })
    const phases: string[] = []
    await graph.sendTurn(request(), (phase) => phases.push(phase))
    expect(phases).toEqual([
      'checking_context',
      'generating_response',
      'validating_response',
      'saving_checkpoint',
    ])
  })

  it('summarizes previous messages before processing the current user message', async () => {
    const events: string[] = []
    assistantGraphMocks.summarizeWithGemini.mockImplementation(async (_summary: string, messages: AssistantMessage[]) => {
      events.push(`summarize:${messages.map((message) => message.content).join(',')}`)
      expect(messages.some((message) => message.content === '這次的新問題')).toBe(false)
      return '先前內容摘要'
    })
    assistantGraphMocks.invokeAssistantModel.mockImplementation(async (messages: BaseMessage[]) => {
      events.push(`respond:${String(messages[0]?.content).includes('先前內容摘要')}`)
      expect(String(messages[0]?.content)).toContain('這次的新問題')
      return new AIMessage({ content: '完成' })
    })
    const graph = createAssistantGraph(new MemorySaver(), {
      proposals: persistence(),
      summaryMessageThreshold: 1,
      recentMessageCount: 1,
    })
    const prior: AssistantMessage = {
      id: 'prior', turnId: 'prior-turn', role: 'user', content: '之前的偏好', createdAt: '2026-08-11T00:00:00.000Z',
    }
    await graph.sendTurn({
      ...request(),
      text: '這次的新問題',
      rehydratedMessages: [prior],
    })
    expect(events).toEqual(['summarize:之前的偏好', 'respond:true'])
  })

  it('rehydrates canonical summary and messages when rebuilding a thread', async () => {
    assistantGraphMocks.invokeAssistantModel.mockResolvedValue(new AIMessage({ content: '偏好日本料理:想吃壽司' }))
    const graph = createAssistantGraph(new MemorySaver(), {
      proposals: persistence(),
    })
    const turn = request()
    const prior: AssistantMessage = {
      id: 'prior', turnId: 'prior-turn', role: 'user', content: '想吃壽司', createdAt: '2026-08-11T00:00:00.000Z',
    }
    const result = await graph.sendTurn({
      ...turn,
      rehydratedSummary: '偏好日本料理',
      rehydratedMessages: [prior],
    })
    expect(result.summary).toBe('偏好日本料理')
    expect(result.messages[0]).toEqual(prior)
    expect(result.assistantMessage?.content).toBe('偏好日本料理:想吃壽司')
  })

  it('returns the saved result when the same turn is retried', async () => {
    let calls = 0
    assistantGraphMocks.invokeAssistantModel.mockImplementation(async () => {
      calls += 1
      return new AIMessage({ content: '只回覆一次' })
    })
    const graph = createAssistantGraph(new MemorySaver(), {
      proposals: persistence(),
    })
    const turn = request()
    const first = await graph.sendTurn(turn)
    const retried = await graph.sendTurn(turn)
    expect(calls).toBe(1)
    expect(retried.assistantMessage?.id).toBe(first.assistantMessage?.id)
    expect(retried.messages.filter((message) => message.turnId === turn.turnId)).toHaveLength(2)
  })

  it('rejects an older checkpoint so the UI can rebuild from canonical history', async () => {
    const checkpointer = new MemorySaver()
    const oldGraph = createAssistantGraph(checkpointer, {
      proposals: persistence(),
      graphVersion: 3,
    })
    const firstTurn = request()
    await oldGraph.sendTurn(firstTurn)

    const currentGraph = createAssistantGraph(checkpointer, {
      proposals: persistence(),
      graphVersion: 5,
    })
    await expect(currentGraph.sendTurn({
      ...firstTurn,
      turnId: crypto.randomUUID(),
      text: '下一個問題',
    })).rejects.toThrow('version 3 cannot resume as version 5')
  })

  it('manually summarizes the saved thread and keeps the recent window', async () => {
    assistantGraphMocks.summarizeWithGemini.mockResolvedValue('使用者正在安排東京行程。')
    const graph = createAssistantGraph(new MemorySaver(), {
      proposals: persistence(),
      recentMessageCount: 1,
    })
    const turn = request()
    await graph.sendTurn({ ...turn, text: '我要安排東京。' })
    const summarized = await graph.summarizeThread(turn.threadId)
    expect(summarized.summary).toBe('使用者正在安排東京行程。')
    expect(summarized.messages).toHaveLength(1)
    expect((await graph.getState(turn.threadId))?.summary).toBe(summarized.summary)
  })

  it('runs a terminal proposal tool, finalizes it, and does not call the model again', async () => {
    assistantGraphMocks.invokeAssistantModel.mockResolvedValue(new AIMessage({
      tool_calls: [{
        id: 'proposal-call',
        name: 'propose_itinerary_edit',
        args: {
          reply: '我準備把第一天改成十點開始。',
          title: '延後第一天開始時間',
          explanation: '09:00 改成 10:00',
          operations: [{ type: 'set_day_start_time', dayId: 'day-1', startTime: '10:00' }],
        },
        type: 'tool_call',
      }],
    }))
    const proposals = persistence()
    const graph = createAssistantGraph(new MemorySaver(), {
      proposals,
    })
    const completed = await graph.sendTurn(request())
    expect(assistantGraphMocks.invokeAssistantModel).toHaveBeenCalledTimes(1)
    expect(completed.request).toBeNull()
    expect(completed.assistantMessage?.proposal?.status).toBe('pending')
    expect(proposals.saved).toHaveLength(1)
    expect(proposals.saved[0].expectedDayRevisions).toEqual({ 'day-1': 3 })
  })
})
