import { MemorySaver } from '@langchain/langgraph/web'
import { AIMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
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

vi.mock('../tools', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../tools')>()
  return {
    ...actual,
    isAssistantToolName: (name: string) => name === 'lookup_weather' || actual.isAssistantToolName(name),
  }
})

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
  AssistantProposalExecution,
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

const persistence = (): AssistantProposalExecution => ({
  async apply() { return 'applied' },
})

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
  const stateWithAiMessage = (toolCalls: any[], toolRound: number) => ({
    graphVersion: 8,
    summary: '',
    messages: [],
    request: null,
    assistantMessage: null,
    modelMessages: [
      new AIMessage({
        content: '',
        tool_calls: toolCalls,
      }),
    ],
    toolRound,
  } as AssistantGraphNodeState)

  it('routes continuing tool to execute_tools and stops at the round limit', () => {
    const continuingCall = { id: '1', name: 'lookup_weather', args: {}, type: 'tool_call' as const }
    expect(routeAfterRespond(stateWithAiMessage([continuingCall], 0), 4)).toBe('execute_tools')
    expect(routeAfterTools(stateWithAiMessage([continuingCall], 1), 4)).toBe('respond')
    expect(routeAfterTools(stateWithAiMessage([continuingCall], 4), 4)).toBe('tool_limit')
  })

  it('returns to the model after every tool result', () => {
    expect(routeAfterTools(stateWithAiMessage([], 1), 4)).toBe('respond')
  })

  it('finalizes direct text responses when no tool calls exist', () => {
    expect(routeAfterRespond(stateWithAiMessage([], 0), 4)).toBe('finalize_response')
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
      graphVersion: 8,
    })
    await expect(currentGraph.sendTurn({
      ...firstTurn,
      turnId: crypto.randomUUID(),
      text: '下一個問題',
    })).rejects.toThrow('version 3 cannot resume as version 8')
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

  it('runs a proposal tool, pauses inside the tool, and resumes on user decision', async () => {
    assistantGraphMocks.invokeAssistantModel
      .mockResolvedValueOnce(new AIMessage({
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
      .mockResolvedValueOnce(new AIMessage({
        content: '好的，已為您將第一天調整為十點出發！',
      }))

    let applied = false
    const graph = createAssistantGraph(new MemorySaver(), {
      proposals: {
        apply: async () => { applied = true; return 'applied' },
      },
    })

    const req = request()
    const paused = await graph.sendTurn(req)
    expect(assistantGraphMocks.invokeAssistantModel).toHaveBeenCalledTimes(1)
    expect(paused.assistantMessage).toBeNull()
    expect(paused.messages).toHaveLength(1)
    expect(paused.messages[0]?.role).toBe('user')
    expect(paused.pendingToolCall?.id).toBe('proposal-call')
    expect(paused.pendingToolCall?.name).toBe('propose_itinerary_edit')
    expect(paused.pendingToolCall?.proposal.status).toBe('pending')
    expect(paused.pendingToolCall?.proposal.id).toBe(req.turnId)
    expect(paused.pendingToolCall?.proposal.expectedDayRevisions).toEqual({ 'day-1': 3 })

    const resumed = await graph.resumeTurn(req.threadId, { approved: true })
    expect(assistantGraphMocks.invokeAssistantModel).toHaveBeenCalledTimes(2)
    expect(applied).toBe(true)
    const resumedModelMessages = assistantGraphMocks.invokeAssistantModel.mock.calls[1][0] as BaseMessage[]
    const toolMessage = resumedModelMessages.find((message) => ToolMessage.isInstance(message)) as ToolMessage
    expect(JSON.parse(toolMessage.content as string).proposal).toBeUndefined()
    expect((toolMessage.artifact as { proposal: ItineraryChangeProposal }).proposal.status).toBe('applied')
    expect(resumed.assistantMessage?.content).toBe('好的，已為您將第一天調整為十點出發！')
    expect(resumed.assistantMessage?.proposal?.status).toBe('applied')
  })

  it('resumes a proposal rejection through the graph', async () => {
    assistantGraphMocks.invokeAssistantModel
      .mockResolvedValueOnce(new AIMessage({
        tool_calls: [{
          id: 'proposal-call',
          name: 'propose_todo_list',
          args: {
            reply: '我準備列出行前待辦。',
            title: '行前準備',
            explanation: '整理行前準備清單',
            todos: [{ title: '購買交通卡' }],
          },
          type: 'tool_call',
        }],
      }))
      .mockResolvedValueOnce(new AIMessage({ content: '好的，我先不套用這份清單。' }))

    const graph = createAssistantGraph(new MemorySaver(), {
      proposals: persistence(),
    })

    const req = request()
    const paused = await graph.sendTurn({ ...req, text: '幫我列出待辦' })
    expect(paused.assistantMessage).toBeNull()
    expect(paused.messages).toHaveLength(1)
    expect(paused.messages[0]?.role).toBe('user')
    expect(paused.pendingToolCall?.id).toBe('proposal-call')
    expect(paused.pendingToolCall?.name).toBe('propose_todo_list')
    expect(paused.pendingToolCall?.proposal.status).toBe('pending')
    expect(paused.pendingToolCall?.proposal.id).toBe(req.turnId)
    const resumed = await graph.resumeTurn(req.threadId, { approved: false, feedback: '我想自己整理' })
    expect(resumed.assistantMessage?.proposal?.status).toBe('rejected')
    expect(resumed.assistantMessage?.content).toBe('好的，我先不套用這份清單。')
  })
})
