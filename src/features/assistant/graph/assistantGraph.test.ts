import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { MemorySaver } from '@langchain/langgraph/web'
import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Itinerary } from '../../../types/database'

const assistantGraphMocks = vi.hoisted(() => ({
  invokeAssistantModel: vi.fn(),
  summarizeWithGemini: vi.fn(),
}))

vi.mock('../services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services')>()),
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
import { routeAfterRespond } from './routing'
import type {
  AssistantMessage,
  AssistantProposal,
  AssistantProposalExecution,
  AssistantTurnRequest,
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

  it('routes continuing tool to execute_tools', () => {
    const continuingCall = { id: '1', name: 'lookup_weather', args: {}, type: 'tool_call' as const }
    expect(routeAfterRespond(stateWithAiMessage([continuingCall], 0))).toBe('execute_tools')
  })

  it('finalizes direct text responses when no tool calls exist', () => {
    expect(routeAfterRespond(stateWithAiMessage([], 0))).toBe('finalize_response')
  })

  it('routes unsupported tools through ToolNode error feedback', () => {
    const unsupportedCall = { id: '1', name: 'unsupported_tool', args: {}, type: 'tool_call' as const }
    expect(routeAfterRespond(stateWithAiMessage([unsupportedCall], 0))).toBe('execute_tools')
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

  it('forwards streamed text deltas while preserving the completed message', async () => {
    assistantGraphMocks.invokeAssistantModel.mockImplementation(async (
      _messages: BaseMessage[],
      onTextDelta?: (text: string) => void,
    ) => {
      onTextDelta?.('第一段')
      onTextDelta?.('第二段')
      return new AIMessage({ content: '第一段第二段' })
    })
    const graph = createAssistantGraph(new MemorySaver(), {
      proposals: persistence(),
    })
    const events: Array<{ type: string; turnId: string; text: string }> = []
    const turn = request()
    const result = await graph.sendTurn(turn, undefined, (event) => events.push(event))

    expect(events).toEqual([
      { type: 'assistant_text_delta', turnId: turn.turnId, text: '第一段' },
      { type: 'assistant_text_delta', turnId: turn.turnId, text: '第二段' },
    ])
    expect(result.assistantMessage?.content).toBe('第一段第二段')
    expect((await graph.getState(turn.threadId))?.assistantMessage?.content).toBe('第一段第二段')
  })

  it('shows a missed time target as proposal information without a correction loop', async () => {
    const proposalResponse = (duration: number) => new AIMessage({
      content: '',
      tool_calls: [{ id: `target-${duration}`, name: 'propose_itinerary_edit', type: 'tool_call', args: {
        operations: [
          { type: 'update_attraction', attractionId: 'place-1', changes: { duration } },
          { type: 'add_attraction', dayId: 'day-1', name: '晚餐', duration: 60, travelTime: 30 },
        ],
        timeTargets: [{ addOperationIndex: 1, startTime: '18:30' }],
      } }],
    })
    assistantGraphMocks.invokeAssistantModel.mockResolvedValueOnce(proposalResponse(480))
      .mockResolvedValueOnce(proposalResponse(540))
    const graph = createAssistantGraph(new MemorySaver(), { proposals: persistence() })
    const result = await graph.sendTurn({ ...request(), text: '晚餐訂在 6:30' })
    expect(assistantGraphMocks.invokeAssistantModel).toHaveBeenCalledOnce()
    const proposed = result.pendingToolCall?.proposal
    expect(proposed?.afterDays[0].attractions[1].startTime).toBe('2026-09-01T17:30:00')
    expect(proposed?.timeChecks?.[0].differenceMinutes).toBe(-60)
    expect(proposed?.afterDays[0].startTime).toBe(itinerary.days![0].startTime)
    expect(proposed?.afterDays[0].attractions).toHaveLength(2)
    expect(proposed).not.toHaveProperty('timeTargets')
  })

  it('does not reject a proposal for missing inferred time targets', async () => {
    assistantGraphMocks.invokeAssistantModel.mockResolvedValueOnce(new AIMessage({ content: '', tool_calls: [{
      id: 'plan', name: 'propose_itinerary_edit', type: 'tool_call',
      args: { operations: [{ type: 'update_attraction', attractionId: 'place-1', changes: { duration: 120 } }] },
    }] }))
    const graph = createAssistantGraph(new MemorySaver(), { proposals: persistence() })
    const result = await graph.sendTurn({ ...request(), text: '早上逛市場，11點-12點到商店，晚餐18:30' })
    expect(result.pendingToolCall?.kind).toBe('proposal')
    expect(assistantGraphMocks.invokeAssistantModel).toHaveBeenCalledOnce()
  })

  it('continues a failed reply after approval without applying the proposal again', async () => {
    assistantGraphMocks.invokeAssistantModel.mockResolvedValueOnce(new AIMessage({ content: '', tool_calls: [{
      id: 'retry-proposal', name: 'propose_itinerary_edit', type: 'tool_call', args: {
        operations: [{ type: 'set_day_start_time', dayId: 'day-1', startTime: '10:00' }],
      },
    }] })).mockRejectedValueOnce(new Error('reply interrupted'))
      .mockResolvedValueOnce(new AIMessage({ content: '已完成調整' }))
    const apply = vi.fn().mockResolvedValue('applied')
    const graph = createAssistantGraph(new MemorySaver(), { proposals: { apply } })
    const req = request()
    await graph.sendTurn(req)
    await expect(graph.resumeTurn(req.threadId, { approved: true })).rejects.toThrow('reply interrupted')
    // A fresh runtime after reload must continue from the same checkpoint as well.
    const result = await graph.sendTurn(req)
    expect(apply).toHaveBeenCalledOnce()
    expect(result.assistantMessage?.proposal?.status).toBe('applied')
    expect(result.assistantMessage?.content).toBe('已完成調整')
    expect((await graph.resumeTurn(req.threadId, { approved: true })).assistantMessage).toEqual(result.assistantMessage)
    expect(apply).toHaveBeenCalledOnce()
  })

  it('keeps proposal persistence errors in the existing tool feedback flow', async () => {
    assistantGraphMocks.invokeAssistantModel.mockResolvedValueOnce(new AIMessage({ content: '', tool_calls: [{
      id: 'retry-save', name: 'propose_itinerary_edit', type: 'tool_call', args: {
        operations: [{ type: 'set_day_start_time', dayId: 'day-1', startTime: '10:00' }],
      },
    }] })).mockResolvedValueOnce(new AIMessage({ content: '暫時無法儲存' }))
    const apply = vi.fn().mockRejectedValue(new Error('database offline'))
    const graph = createAssistantGraph(new MemorySaver(), { proposals: { apply } })
    const req = request()
    await graph.sendTurn(req)
    const result = await graph.resumeTurn(req.threadId, { approved: true })
    expect(apply).toHaveBeenCalledOnce()
    const modelMessages = assistantGraphMocks.invokeAssistantModel.mock.calls[1][0] as BaseMessage[]
    expect(modelMessages.find((item) => ToolMessage.isInstance(item))?.content).toContain('database offline')
    expect(result.assistantMessage?.content).toBe('暫時無法儲存')
  })

  it('rejects invalid tool calls instead of treating partial text as a completed reply', async () => {
    assistantGraphMocks.invokeAssistantModel.mockResolvedValueOnce(new AIMessage({
      content: '尚未完成', invalid_tool_calls: [{ name: 'propose_itinerary_edit', args: '{', id: 'invalid', error: 'invalid JSON' }],
    }))
    const graph = createAssistantGraph(new MemorySaver(), { proposals: persistence() })
    const req = request()
    await expect(graph.sendTurn(req)).rejects.toThrow('無法解析的工具參數')
    expect((await graph.getState(req.threadId))?.assistantMessage).toBeNull()
  })

  it('does not persist partial streamed text when the model stream fails and can retry', async () => {
    assistantGraphMocks.invokeAssistantModel
      .mockImplementationOnce(async (
        _messages: BaseMessage[],
        onTextDelta?: (text: string) => void,
      ) => {
        onTextDelta?.('半成品')
        throw new Error('stream interrupted')
      })
      .mockImplementationOnce(async (
        _messages: BaseMessage[],
        onTextDelta?: (text: string) => void,
      ) => {
        onTextDelta?.('重試成功')
        return new AIMessage({ content: '重試成功' })
      })

    const graph = createAssistantGraph(new MemorySaver(), {
      proposals: persistence(),
    })
    const turn = request()
    const firstEvents: string[] = []

    await expect(graph.sendTurn(turn, undefined, (event) => firstEvents.push(event.text)))
      .rejects.toThrow('stream interrupted')
    const failedState = await graph.getState(turn.threadId)
    expect(firstEvents).toEqual(['半成品'])
    expect(failedState?.messages.map((message) => message.role)).toEqual(['user'])
    expect(failedState?.assistantMessage).toBeNull()

    const retryEvents: string[] = []
    const retried = await graph.sendTurn(turn, undefined, (event) => retryEvents.push(event.text))
    expect(retryEvents).toEqual(['重試成功'])
    expect(retried.assistantMessage?.content).toBe('重試成功')
    expect(retried.messages.map((message) => message.role)).toEqual(['user', 'assistant'])
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
      const systemMessage = messages.find((m) => SystemMessage.isInstance(m)) ?? messages[0]
      const userMessage = messages.findLast((m) => HumanMessage.isInstance(m)) ?? messages.at(-1)
      events.push(`respond:${String(systemMessage?.content).includes('先前內容摘要')}`)
      expect(String(userMessage?.content)).toContain('這次的新問題')
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
      .mockImplementationOnce(async (
        _messages: BaseMessage[],
        onTextDelta?: (text: string) => void,
      ) => {
        onTextDelta?.('好的，')
        onTextDelta?.('已為您將第一天調整為十點出發！')
        return new AIMessage({ content: '好的，已為您將第一天調整為十點出發！' })
      })

    let applied = false
    const graph = createAssistantGraph(new MemorySaver(), {
      proposals: {
        apply: async () => { applied = true; return 'applied' },
      },
    })

    const req = request()
    const proposalEvents: string[] = []
    const paused = await graph.sendTurn(req, undefined, (event) => proposalEvents.push(event.text))
    expect(assistantGraphMocks.invokeAssistantModel).toHaveBeenCalledTimes(1)
    expect(proposalEvents).toEqual([])
    expect(paused.assistantMessage).toBeNull()
    expect(paused.messages).toHaveLength(1)
    expect(paused.messages[0]?.role).toBe('user')
    expect(paused.pendingToolCall?.id).toBe('proposal-call')
    expect(paused.pendingToolCall?.name).toBe('propose_itinerary_edit')
    expect(paused.pendingToolCall?.proposal?.status).toBe('pending')
    expect(paused.pendingToolCall?.proposal?.id).toBe(req.turnId)
    expect(paused.pendingToolCall?.proposal?.expectedDayRevisions).toEqual({ 'day-1': 3 })
    expect(paused.pendingToolCall?.proposal).not.toHaveProperty('operations')

    const resumeEvents: string[] = []
    const resumed = await graph.resumeTurn(
      req.threadId,
      { approved: true },
      undefined,
      (event) => resumeEvents.push(event.text),
    )
    expect(assistantGraphMocks.invokeAssistantModel).toHaveBeenCalledTimes(2)
    expect(applied).toBe(true)
    expect(resumeEvents).toEqual(['好的，', '已為您將第一天調整為十點出發！'])
    const resumedModelMessages = assistantGraphMocks.invokeAssistantModel.mock.calls[1][0] as BaseMessage[]
    const toolMessage = resumedModelMessages.find((message) => ToolMessage.isInstance(message)) as ToolMessage
    expect(JSON.parse(toolMessage.content as string).proposal).toBeUndefined()
    expect((toolMessage.artifact as { proposal: AssistantProposal }).proposal.status).toBe('applied')
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
    expect(paused.pendingToolCall?.proposal?.status).toBe('pending')
    expect(paused.pendingToolCall?.proposal?.id).toBe(req.turnId)
    const resumed = await graph.resumeTurn(req.threadId, { approved: false, feedback: '我想自己整理' })
    expect(resumed.assistantMessage?.proposal?.status).toBe('rejected')
    expect(resumed.assistantMessage?.content).toBe('好的，我先不套用這份清單。')
    const rejection = (assistantGraphMocks.invokeAssistantModel.mock.calls[1][0] as BaseMessage[]).find(ToolMessage.isInstance)
    expect(JSON.parse(String(rejection?.content))).toMatchObject({
      status: 'rejected',
      feedback: '我想自己整理',
      rejectedProposal: { title: '行前準備', proposedTodos: [{ title: '購買交通卡' }] },
    })
  })

  it('continues a rejected proposal with feedback and preserves its context in the next conversation turn', async () => {
    const proposalCall = (title: string) => new AIMessage({ content: '', tool_calls: [{
      id: 'todo-review', name: 'propose_todo_list', type: 'tool_call',
      args: { title: '行前準備', explanation: '交通準備', todos: [{ title }] },
    }] })
    assistantGraphMocks.invokeAssistantModel
      .mockResolvedValueOnce(proposalCall('購買交通卡'))
      .mockResolvedValueOnce(proposalCall('預約機場接送'))
      .mockResolvedValueOnce(new AIMessage({ content: '想調整哪部分？' }))
      .mockResolvedValueOnce(new AIMessage({ content: '可以保留剛才的接送安排。' }))
    const apply = vi.fn().mockResolvedValue('applied')
    const graph = createAssistantGraph(new MemorySaver(), { proposals: { apply } })
    const req = { ...request(), text: '幫我列出交通待辦' }
    await graph.sendTurn(req)
    const refined = await graph.resumeTurn(req.threadId, { approved: false, feedback: '不要交通卡，改預約機場接送' })
    expect(refined.pendingToolCall?.proposal?.proposedTodos[0].title).toBe('預約機場接送')
    const correctionMessages = assistantGraphMocks.invokeAssistantModel.mock.calls[1][0] as BaseMessage[]
    const rejection = JSON.parse(String(correctionMessages.find(ToolMessage.isInstance)?.content))
    expect(rejection.feedback).toBe('不要交通卡，改預約機場接送')
    expect(rejection.rejectedProposal.proposedTodos[0].title).toBe('購買交通卡')
    expect(rejection.nextStep).toContain('再單獨提出新提案')
    expect(correctionMessages.find(AIMessage.isInstance)?.tool_calls?.[0].args.todos).toEqual([{ title: '購買交通卡' }])
    await graph.resumeTurn(req.threadId, { approved: false })
    const secondRejection = JSON.parse(String((assistantGraphMocks.invokeAssistantModel.mock.calls[2][0] as BaseMessage[])
      .filter(ToolMessage.isInstance).at(-1)?.content))
    expect(secondRejection.nextStep).toContain('詢問使用者想調整哪部分')
    await graph.sendTurn({ ...req, turnId: crypto.randomUUID(), text: '剛才的接送先保留' })
    const history = assistantGraphMocks.invokeAssistantModel.mock.calls[3][0] as BaseMessage[]
    expect(String(history.find(AIMessage.isInstance)?.content)).toContain('預約機場接送')
    expect(String(history.find(AIMessage.isInstance)?.content)).toContain('"status":"rejected"')
    expect(apply).not.toHaveBeenCalled()
  })

  it('surfaces an empty post-approval model response instead of masking it', async () => {
    assistantGraphMocks.invokeAssistantModel
      .mockResolvedValueOnce(new AIMessage({
        content: '我準備調整第一天的開始時間。',
        tool_calls: [{
          id: 'proposal-call-empty-response',
          name: 'propose_itinerary_edit',
          args: {
            title: '開始時間調整',
            explanation: '將第一天改為 09:00 開始。',
            operations: [{ type: 'set_day_start_time', dayId: 'day-1', startTime: '09:00' }],
          },
          type: 'tool_call',
        }],
      }))
      .mockResolvedValueOnce(new AIMessage({ content: '' }))

    const graph = createAssistantGraph(new MemorySaver(), {
      proposals: persistence(),
    })
    const req = request()

    await graph.sendTurn(req)
    await expect(graph.resumeTurn(req.threadId, { approved: true }))
      .rejects.toThrow('模型回傳了空的文字內容')
  })

  it('pauses on ask_clarifying_question and resumes with user answer', async () => {
    assistantGraphMocks.invokeAssistantModel
      .mockResolvedValueOnce(new AIMessage({
        tool_calls: [{
          id: 'question-call-1',
          name: 'ask_clarifying_question',
          args: {
            question: '這趟旅行比較偏好哪種步調？',
            options: [
              { id: '1', label: '☕ 悠閒慢活', description: '每天 1~2 個景點' },
              { id: '2', label: '🏃 緊湊充實', description: '熱門地標打卡' },
            ],
            multiple: false,
            allowCustomInput: true,
          },
          type: 'tool_call',
        }],
      }))
      .mockResolvedValueOnce(new AIMessage({
        content: '了解！既然偏好悠閒步調，我為您安排寬鬆的散步路線。',
      }))

    const graph = createAssistantGraph(new MemorySaver(), {
      proposals: persistence(),
    })

    const req = request()
    const paused = await graph.sendTurn({ ...req, text: '推薦行程' })

    expect(paused.assistantMessage).toBeNull()
    expect(paused.pendingToolCall?.id).toBe('question-call-1')
    expect(paused.pendingToolCall?.name).toBe('ask_clarifying_question')
    expect(paused.pendingToolCall?.kind).toBe('question')
    if (paused.pendingToolCall?.kind === 'question') {
      expect(paused.pendingToolCall.questionData.question).toBe('這趟旅行比較偏好哪種步調？')
      expect(paused.pendingToolCall.questionData.options).toHaveLength(2)
    }

    const resumed = await graph.resumeTurn(req.threadId, {
      selectedOptions: ['☕ 悠閒慢活'],
      answer: '☕ 悠閒慢活',
    })

    expect(resumed.assistantMessage?.content).toBe('了解！既然偏好悠閒步調，我為您安排寬鬆的散步路線。')
    expect(resumed.assistantMessage?.clarifyingQuestion).toEqual({
      question: '這趟旅行比較偏好哪種步調？',
      answer: '☕ 悠閒慢活',
      options: [
        { id: '1', label: '☕ 悠閒慢活', description: '每天 1~2 個景點' },
        { id: '2', label: '🏃 緊湊充實', description: '熱門地標打卡' },
      ],
    })
  })

  it('allows model to propose an itinerary edit after user answers clarifying question', async () => {
    assistantGraphMocks.invokeAssistantModel
      .mockResolvedValueOnce(new AIMessage({
        content: '',
        tool_calls: [{
          id: 'question-call-2',
          name: 'ask_clarifying_question',
          args: {
            question: '預算傾向？',
            options: [
              { id: '1', label: '經濟實惠' },
              { id: '2', label: '豪華享受' },
            ],
          },
          type: 'tool_call',
        }],
      }))
      .mockResolvedValueOnce(new AIMessage({
        content: '好的，正在為您安排經濟實惠的行程：',
        tool_calls: [{
          id: 'proposal-call-chained',
          name: 'propose_itinerary_edit',
          args: {
            title: '推薦平價行程',
            operations: [{
              type: 'add_attraction',
              dayId: 'day-1',
              attraction: {
                id: 'attr-budget',
                name: '免費觀景台',
                cost: 0,
                duration: 60,
              },
            }],
          },
          type: 'tool_call',
        }],
      }))
      .mockResolvedValueOnce(new AIMessage({
        content: '已成功為您更新平價行程！',
      }))

    const graph = createAssistantGraph(new MemorySaver(), {
      proposals: persistence(),
    })

    const req = request()
    const pausedForQuestion = await graph.sendTurn({ ...req, text: '推薦行程' })

    expect(pausedForQuestion.pendingToolCall?.kind).toBe('question')

    // Resume question: model now calls propose_itinerary_edit
    const pausedForProposal = await graph.resumeTurn(req.threadId, {
      selectedOptions: ['經濟實惠'],
      answer: '經濟實惠',
    })

    expect(pausedForProposal.pendingToolCall?.kind).toBe('proposal')
    expect(pausedForProposal.pendingToolCall?.name).toBe('propose_itinerary_edit')
    expect(pausedForProposal.pendingToolCall?.proposal?.title).toBe('推薦平價行程')

    // Resume proposal: user approves
    const finalized = await graph.resumeTurn(req.threadId, {
      approved: true,
    })

    expect(finalized.assistantMessage?.content).toBe('已成功為您更新平價行程！')
    expect(finalized.assistantMessage?.proposal?.status).toBe('applied')
  })


  it('aborts sendTurn when signal is aborted', async () => {
    const controller = new AbortController()
    assistantGraphMocks.invokeAssistantModel.mockImplementation(async (_msgs, _onDelta, _model, _budget, signal) => {
      if (signal?.aborted) {
        const error = new Error('Aborted')
        error.name = 'AbortError'
        throw error
      }
      return new AIMessage({ content: '完成' })
    })

    const graph = createAssistantGraph(new MemorySaver(), {
      proposals: persistence(),
    })

    controller.abort()
    const req = request()
    const result = await graph.sendTurn(req, undefined, undefined, controller.signal)
    expect(result.assistantMessage).toBeFalsy()
  })
  it('retains image and PDF contents for a follow-up turn', async () => {
    const graph = createAssistantGraph(new MemorySaver(), { proposals: persistence() })
    const first = { ...request(), text: '請看附件', attachments: [
      { id: 'image', name: '地圖.png', mimeType: 'image/png', size: 3, dataUrl: 'data:image/png;base64,YWJj' },
      { id: 'pdf', name: '預約.pdf', mimeType: 'application/pdf', size: 3, dataUrl: 'data:application/pdf;base64,YWJj' },
    ] }
    await graph.sendTurn(first)
    await graph.sendTurn({ ...first, turnId: crypto.randomUUID(), text: '附件上寫了什麼？', attachments: null })
    const messages = assistantGraphMocks.invokeAssistantModel.mock.calls[1][0] as BaseMessage[]
    const original = messages.filter((message) => HumanMessage.isInstance(message))[0]
    expect(original.content).toEqual(expect.arrayContaining([
      { type: 'image_url', image_url: { url: first.attachments[0].dataUrl } },
      { type: 'media', mimeType: 'application/pdf', data: 'YWJj' },
    ]))
  })

  it('returns unknown tool names and invalid parameter types to the model for correction', async () => {
    assistantGraphMocks.invokeAssistantModel.mockResolvedValueOnce(new AIMessage({ content: '', tool_calls: [
      { id: 'unknown', name: 'nonexistent_tool', args: {}, type: 'tool_call' },
      { id: 'bad-args', name: 'view_itinerary', args: { dayNumbers: 'one' }, type: 'tool_call' },
    ] })).mockResolvedValueOnce(new AIMessage({ content: '', tool_calls: [
      { id: 'corrected', name: 'view_itinerary', args: { dayNumbers: [1] }, type: 'tool_call' },
    ] })).mockResolvedValueOnce(new AIMessage({ content: '已讀取第一天行程' }))
    const graph = createAssistantGraph(new MemorySaver(), { proposals: persistence() })
    const result = await graph.sendTurn(request())
    const feedback = (assistantGraphMocks.invokeAssistantModel.mock.calls[1][0] as BaseMessage[]).filter(ToolMessage.isInstance)
    expect(feedback).toHaveLength(2)
    expect(feedback.every((message) => message.status === 'error')).toBe(true)
    expect(result.assistantMessage?.content).toBe('已讀取第一天行程')
  })

  it('does not execute a batch containing multiple interactive tools', async () => {
    const proposalCall = (id: string) => ({ id, name: 'propose_itinerary_edit', args: { operations: [{ type: 'set_day_start_time', dayId: 'day-1', startTime: '10:00' }] }, type: 'tool_call' as const })
    assistantGraphMocks.invokeAssistantModel.mockResolvedValueOnce(new AIMessage({ content: '', tool_calls: [proposalCall('one'), proposalCall('two')] }))
      .mockResolvedValueOnce(new AIMessage({ content: '', tool_calls: [proposalCall('only')] }))
      .mockResolvedValueOnce(new AIMessage({ content: '已完成' }))
    const apply = vi.fn().mockResolvedValue('applied')
    const graph = createAssistantGraph(new MemorySaver(), { proposals: { apply } })
    const req = request()
    const paused = await graph.sendTurn(req)
    const feedback = (assistantGraphMocks.invokeAssistantModel.mock.calls[1][0] as BaseMessage[]).filter(ToolMessage.isInstance)
    expect(feedback).toHaveLength(2)
    expect(feedback.every((message) => String(message.content).includes('本批工具尚未執行'))).toBe(true)
    expect(paused.pendingToolCall?.id).toBe('only')
    expect(apply).not.toHaveBeenCalled()
    await graph.resumeTurn(req.threadId, { approved: true })
    expect(apply).toHaveBeenCalledOnce()
  })

  it('replaces reused tool IDs so a corrected call is not silently skipped', async () => {
    assistantGraphMocks.invokeAssistantModel.mockResolvedValueOnce(new AIMessage({ content: '', tool_calls: [
      { id: 'reused', name: 'view_itinerary', args: { dayNumbers: 'one' }, type: 'tool_call' },
    ] })).mockResolvedValueOnce(new AIMessage({ content: '', tool_calls: [
      { id: 'reused', name: 'view_itinerary', args: { dayNumbers: [1] }, type: 'tool_call' },
    ] })).mockResolvedValueOnce(new AIMessage({ content: '已讀取' }))
    const graph = createAssistantGraph(new MemorySaver(), { proposals: persistence() })
    await graph.sendTurn(request())
    const feedback = (assistantGraphMocks.invokeAssistantModel.mock.calls[2][0] as BaseMessage[]).filter(ToolMessage.isInstance)
    expect(feedback).toHaveLength(2)
    expect(feedback[0].tool_call_id).not.toBe(feedback[1].tool_call_id)
    expect(String(feedback[1].content)).toContain('淺草寺')
  })

  it('regenerates an empty reply after an applied proposal on manual retry', async () => {
    assistantGraphMocks.invokeAssistantModel.mockResolvedValueOnce(new AIMessage({ content: '', tool_calls: [
      { id: 'apply-empty', name: 'propose_itinerary_edit', args: { operations: [{ type: 'set_day_start_time', dayId: 'day-1', startTime: '10:00' }] }, type: 'tool_call' },
    ] })).mockResolvedValueOnce(new AIMessage({ content: '' })).mockResolvedValueOnce(new AIMessage({ content: '已套用，重新產生回覆成功' }))
    const apply = vi.fn().mockResolvedValue('applied')
    const graph = createAssistantGraph(new MemorySaver(), { proposals: { apply } })
    const req = request()
    await graph.sendTurn(req)
    await expect(graph.resumeTurn(req.threadId, { approved: true })).rejects.toThrow('空的文字')
    const recovered = await graph.sendTurn(req)
    expect(recovered.assistantMessage?.content).toContain('重新產生回覆成功')
    expect(recovered.assistantMessage?.proposal?.status).toBe('applied')
    expect(apply).toHaveBeenCalledOnce()
  })

  it.each([1, 3, 7])('shows day %i lookup progress and corrects an incomplete reorder', async (dayNumber) => {
    const req = request()
    req.text = `幫我調整第 ${dayNumber} 天順序`
    req.itinerary = { ...itinerary, days: Array.from({ length: 7 }, (_, index) => ({
      ...itinerary.days![0], id: `actual-day-${index + 1}`,
      attractions: ['first', 'second'].map((suffix) => ({
        ...itinerary.days![0].attractions[0], id: `place-${index + 1}-${suffix}`, dayId: `actual-day-${index + 1}`,
      })),
    })) }
    const reorderCall = (ids: string[]) => new AIMessage({ content: '', tool_calls: [{
      id: 'reorder', name: 'propose_itinerary_edit', type: 'tool_call',
      args: { operations: [{ type: 'reorder_attractions', dayId: `day-${dayNumber}`, attractionIds: ids }] },
    }] })
    assistantGraphMocks.invokeAssistantModel
      .mockResolvedValueOnce(new AIMessage({ content: '', tool_calls: [{ id: 'read', name: 'view_itinerary', args: { dayNumbers: [dayNumber] }, type: 'tool_call' }] }))
      .mockResolvedValueOnce(reorderCall([`place-${dayNumber}-second`]))
      .mockResolvedValueOnce(reorderCall([`place-${dayNumber}-second`, `place-${dayNumber}-first`]))
    const progress = vi.fn()
    const graph = createAssistantGraph(new MemorySaver(), { proposals: persistence() })
    const result = await graph.sendTurn(req, progress)
    expect(progress).toHaveBeenCalledWith('executing_tools', `正在檢視第 ${dayNumber} 天行程（第 1 輪）`, expect.objectContaining({ toolCalls: expect.any(Array) }))
    expect(progress).toHaveBeenCalledWith('validating_response', '正在準備提案與計算排程時間…')
    expect(progress).toHaveBeenCalledWith('generating_response', '工具回報問題，正在修正安排（第 2 輪）')
    const feedback = (assistantGraphMocks.invokeAssistantModel.mock.calls[2][0] as BaseMessage[]).filter(ToolMessage.isInstance)
    expect(String(feedback.at(-1)?.content)).toContain(`place-${dayNumber}-first`)
    const proposal = result.pendingToolCall?.kind === 'proposal' ? result.pendingToolCall.proposal : undefined
    expect(proposal?.afterDays.map((day) => day.id)).toEqual([`actual-day-${dayNumber}`])
    expect(proposal?.afterDays[0].attractions.map((place) => place.id)).toEqual([`place-${dayNumber}-second`, `place-${dayNumber}-first`])
  })

  it('does not accumulate the tool limit across user-requested proposal refinements', async () => {
    assistantGraphMocks.invokeAssistantModel.mockResolvedValue(new AIMessage({ content: '', tool_calls: [{
      id: 'refine', name: 'propose_itinerary_edit', type: 'tool_call',
      args: { operations: [{ type: 'set_day_start_time', dayId: 'day-1', startTime: '10:00' }] },
    }] }))
    const apply = vi.fn().mockResolvedValue('applied')
    const graph = createAssistantGraph(new MemorySaver(), { proposals: { apply } })
    const req = request()
    await graph.sendTurn(req)
    for (let index = 0; index < 12; index++) {
      const result = await graph.resumeTurn(req.threadId, { approved: false, feedback: '請再修改安排' })
      expect(result.pendingToolCall?.kind).toBe('proposal')
    }
    assistantGraphMocks.invokeAssistantModel.mockResolvedValueOnce(new AIMessage({ content: '已套用' }))
    await graph.resumeTurn(req.threadId, { approved: true })
    expect(apply).toHaveBeenCalledOnce()
  })

  it.each([false, true])('finishes arrival-window planning in two or three calls (correction: %s)', async (correction) => {
    const req = request()
    req.text = '早上去市場，大概11點-12點到商店'
    const draft = { operations: [
      { type: 'update_attraction', attractionId: 'place-1', changes: { duration: 120 } },
      { type: 'add_attraction', dayId: 'day-1', name: '商店', travelTime: 30, duration: 60 },
    ], timeTargets: [{ addOperationIndex: 1, startTime: '11:30' }] }
    const proposal = (args: object) => new AIMessage({ content: '', tool_calls: [{ id: 'plan', name: 'propose_itinerary_edit', type: 'tool_call', args }] })
    assistantGraphMocks.invokeAssistantModel.mockResolvedValueOnce(new AIMessage({ content: '', tool_calls: [{ id: 'read', name: 'view_itinerary', args: {}, type: 'tool_call' }] }))
    if (correction) assistantGraphMocks.invokeAssistantModel.mockResolvedValueOnce(proposal({ ...draft, timeTargets: [{ startTime: '11:00' }, { startTime: '00:00' }] }))
    assistantGraphMocks.invokeAssistantModel.mockResolvedValueOnce(proposal(draft))
    const graph = createAssistantGraph(new MemorySaver(), { proposals: persistence() })
    const result = await graph.sendTurn(req)
    expect(assistantGraphMocks.invokeAssistantModel).toHaveBeenCalledTimes(correction ? 3 : 2)
    const proposed = result.pendingToolCall?.kind === 'proposal' ? result.pendingToolCall.proposal : undefined
    expect(proposed?.timeChecks).toEqual([{ attractionId: expect.any(String), name: '商店', targetStartTime: '11:30', actualStartTime: '11:30', differenceMinutes: 0 }])
    expect(proposed?.afterDays[0].startTime).toBe(itinerary.days![0].startTime)
    expect(proposed?.afterDays[0].attractions).toHaveLength(2)
  })

  it('allows a final reply after successful tools exhaust the budget', async () => {
    for (let index = 0; index < 10; index++) {
      assistantGraphMocks.invokeAssistantModel.mockResolvedValueOnce(new AIMessage({ content: '', tool_calls: [{
        id: `query-${index}`, name: 'view_itinerary', args: {}, type: 'tool_call',
      }] }))
    }
    assistantGraphMocks.invokeAssistantModel.mockResolvedValueOnce(new AIMessage({ content: '根據已讀取的行程，建議縮短停留時間。' }))
    const graph = createAssistantGraph(new MemorySaver(), { proposals: persistence() })
    const result = await graph.sendTurn(request())
    expect(result.assistantMessage?.content).toContain('建議縮短')
    expect(assistantGraphMocks.invokeAssistantModel.mock.calls[10][5]).toEqual({ allowTools: false })
    const model = new ChatGoogleGenerativeAI({ model: 'gemini-2.0-flash', apiKey: 'test' })
    const messages = assistantGraphMocks.invokeAssistantModel.mock.calls[10][0] as BaseMessage[]
    const wireRequest = (model as unknown as { _buildGenerateContentRequest: (messages: BaseMessage[], options: object) => { tools?: unknown[] } })._buildGenerateContentRequest(messages, {})
    expect(wireRequest.tools).toBeUndefined()
  })

  it('resets the correction budget on manual retry without replaying an applied proposal', async () => {
    const proposal = new AIMessage({ content: '', tool_calls: [{ id: 'applied', name: 'propose_itinerary_edit', type: 'tool_call', args: { operations: [{ type: 'set_day_start_time', dayId: 'day-1', startTime: '10:00' }] } }] })
    const invalid = (id: string) => new AIMessage({ content: '', tool_calls: [{ id, name: 'view_itinerary', type: 'tool_call', args: { dayNumbers: 'bad' } }] })
    assistantGraphMocks.invokeAssistantModel.mockResolvedValueOnce(proposal)
      .mockResolvedValueOnce(invalid('one')).mockResolvedValueOnce(invalid('two'))
      .mockRejectedValueOnce(new Error('API disconnected'))
      .mockResolvedValueOnce(new AIMessage({ content: '套用结果已保留，回覆已恢復。' }))
    const apply = vi.fn().mockResolvedValue('applied')
    const graph = createAssistantGraph(new MemorySaver(), { proposals: { apply } })
    const req = request()
    await graph.sendTurn(req)
    await expect(graph.resumeTurn(req.threadId, { approved: true })).rejects.toThrow('API disconnected')
    await graph.sendTurn(req)
    expect(assistantGraphMocks.invokeAssistantModel.mock.calls[4][5]).toEqual({ allowTools: true })
    expect(apply).toHaveBeenCalledOnce()
  })

  it('ends repeated validation failures with a clear reply after two corrections', async () => {
    for (let index = 0; index < 2; index++) assistantGraphMocks.invokeAssistantModel.mockResolvedValueOnce(new AIMessage({ content: '', tool_calls: [{ id: `invalid-${index}`, name: 'view_itinerary', args: { dayNumbers: 'bad' }, type: 'tool_call' }] }))
    assistantGraphMocks.invokeAssistantModel.mockResolvedValueOnce(new AIMessage({ content: '目前無法確認指定日期，請提供要調整的日期。' }))
    const result = await createAssistantGraph(new MemorySaver(), { proposals: persistence() }).sendTurn(request())
    expect(result.assistantMessage?.content).toContain('請提供')
    expect(assistantGraphMocks.invokeAssistantModel).toHaveBeenCalledTimes(3)
    expect(assistantGraphMocks.invokeAssistantModel.mock.calls[2][5]).toEqual({ allowTools: false })
  })

  it('stops repeated tool failures with a retryable error instead of exhausting graph recursion', async () => {
    assistantGraphMocks.invokeAssistantModel.mockResolvedValue(new AIMessage({ content: '', tool_calls: [
      { id: 'loop', name: 'view_itinerary', args: { dayNumbers: 'bad' }, type: 'tool_call' },
    ] }))
    const graph = createAssistantGraph(new MemorySaver(), { proposals: persistence() })
    const req = request()
    await expect(graph.sendTurn(req)).rejects.toThrow('工具處理輪數已達上限')
    expect(assistantGraphMocks.invokeAssistantModel).toHaveBeenCalledTimes(3)
    assistantGraphMocks.invokeAssistantModel.mockResolvedValueOnce(new AIMessage({ content: '重試成功' }))
    expect((await graph.sendTurn(req)).assistantMessage?.content).toBe('重試成功')
  })

  it('does not allow summarization to overwrite a pending interactive checkpoint', async () => {
    assistantGraphMocks.invokeAssistantModel.mockResolvedValueOnce(new AIMessage({ content: '', tool_calls: [
      { id: 'pending-summary', name: 'propose_itinerary_edit', args: { operations: [{ type: 'set_day_start_time', dayId: 'day-1', startTime: '10:00' }] }, type: 'tool_call' },
    ] }))
    const graph = createAssistantGraph(new MemorySaver(), { proposals: persistence() })
    const req = request()
    await graph.sendTurn(req)
    await expect(graph.summarizeThread(req.threadId)).rejects.toThrow('請先完成目前回合')
    expect((await graph.getState(req.threadId))?.pendingToolCall?.id).toBe('pending-summary')
    expect(assistantGraphMocks.summarizeWithGemini).not.toHaveBeenCalled()
  })

  it('does not let null arguments in a failed proposal poison subsequent valid proposals', async () => {
    assistantGraphMocks.invokeAssistantModel.mockResolvedValueOnce(new AIMessage({ content: '', tool_calls: [
      { id: 'null-args', name: 'propose_itinerary_edit', args: null as unknown as Record<string, unknown>, type: 'tool_call' },
    ] })).mockResolvedValueOnce(new AIMessage({ content: '', tool_calls: [
      { id: 'valid-args', name: 'propose_itinerary_edit', args: { operations: [{ type: 'set_day_start_time', dayId: 'day-1', startTime: '10:00' }] }, type: 'tool_call' },
    ] }))
    const graph = createAssistantGraph(new MemorySaver(), { proposals: persistence() })
    expect((await graph.sendTurn(request())).pendingToolCall?.id).toBe('valid-args')
    expect(assistantGraphMocks.invokeAssistantModel).toHaveBeenCalledTimes(2)
  })

})
