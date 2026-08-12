import { MemorySaver } from '@langchain/langgraph/web'
import { describe, expect, it } from 'vitest'
import type { Itinerary } from '../../types/database'
import {
  createAssistantGraph,
  parseAssistantOperations,
  recentAssistantMessages,
  shouldSummarizeMessages,
  validateAssistantOperations,
} from './assistantGraph'
import type {
  AssistantMessage,
  AssistantModel,
  AssistantProposalPersistence,
  AssistantTurnRequest,
} from './types'

const itinerary: Itinerary = {
  id: 'trip-1',
  title: 'Tokyo',
  ownerId: 'user-1',
  currency: 'JPY',
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

const persistence = (): AssistantProposalPersistence & {
  saved: string[]
  rejected: string[]
  applied: string[]
} => {
  const result = {
    saved: [] as string[],
    rejected: [] as string[],
    applied: [] as string[],
    async savePending(proposal: { id: string }) { result.saved.push(proposal.id) },
    async reject(proposalId: string) { result.rejected.push(proposalId) },
    async apply(proposal: { id: string }) {
      result.applied.push(proposal.id)
      return 'applied' as const
    },
  }
  return result
}

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
    }])).toThrow('unknown attraction')
    expect(() => parseAssistantOperations([{ type: 'delete_trip' }])).toThrow('Unsupported')
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

describe('createAssistantGraph', () => {
  it('completes a regular turn without an interrupt', async () => {
    const model: AssistantModel = {
      respond: async () => ({ reply: '第一天目前從九點開始。' }),
      summarize: async () => 'summary',
    }
    const graph = createAssistantGraph(new MemorySaver(), {
      model,
      proposals: persistence(),
      summaryMessageThreshold: 100,
    })
    const result = await graph.sendTurn({ ...request(), text: '第一天幾點開始？' })
    expect(result.interrupt).toBeNull()
    expect(result.state.messages.map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(result.state.assistantMessage?.content).toBe('第一天目前從九點開始。')
  })

  it('rehydrates canonical summary and messages when rebuilding a thread', async () => {
    const model: AssistantModel = {
      respond: async (modelRequest) => ({
        reply: `${modelRequest.summary}:${modelRequest.messages[0]?.content}`,
      }),
      summarize: async () => 'summary',
    }
    const graph = createAssistantGraph(new MemorySaver(), {
      model,
      proposals: persistence(),
      summaryMessageThreshold: 100,
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
    expect(result.state.summary).toBe('偏好日本料理')
    expect(result.state.messages[0]).toEqual(prior)
    expect(result.state.assistantMessage?.content).toBe('偏好日本料理:想吃壽司')
  })

  it('returns the saved result when the same turn is retried', async () => {
    let calls = 0
    const model: AssistantModel = {
      respond: async () => { calls += 1; return { reply: '只回覆一次' } },
      summarize: async () => 'summary',
    }
    const graph = createAssistantGraph(new MemorySaver(), {
      model,
      proposals: persistence(),
      summaryMessageThreshold: 100,
    })
    const turn = request()
    const first = await graph.sendTurn(turn)
    const retried = await graph.sendTurn(turn)
    expect(calls).toBe(1)
    expect(retried.state.assistantMessage?.id).toBe(first.state.assistantMessage?.id)
    expect(retried.state.messages.filter((message) => message.turnId === turn.turnId)).toHaveLength(2)
  })

  it('manually summarizes the saved thread and keeps the recent window', async () => {
    const model: AssistantModel = {
      respond: async () => ({ reply: '收到。' }),
      summarize: async () => '使用者正在安排東京行程。',
    }
    const graph = createAssistantGraph(new MemorySaver(), {
      model,
      proposals: persistence(),
      recentMessageCount: 1,
      summaryMessageThreshold: 100,
    })
    const turn = request()
    await graph.sendTurn({ ...turn, text: '我要安排東京。' })
    const summarized = await graph.summarizeThread(turn.threadId)
    expect(summarized.summary).toBe('使用者正在安排東京行程。')
    expect(summarized.messages).toHaveLength(1)
    expect((await graph.getState(turn.threadId))?.summary).toBe(summarized.summary)
  })

  it('persists, interrupts, and applies an approved proposal exactly once', async () => {
    const model: AssistantModel = {
      respond: async () => ({
        reply: '我準備把第一天改成十點開始。',
        proposal: {
          title: '延後第一天開始時間',
          explanation: '09:00 改成 10:00',
          operations: [{ type: 'set_day_start_time', dayId: 'day-1', startTime: '10:00' }],
        },
      }),
      summarize: async () => 'summary',
    }
    const proposals = persistence()
    const graph = createAssistantGraph(new MemorySaver(), {
      model,
      proposals,
      summaryMessageThreshold: 100,
    })
    const turn = request()
    const pending = await graph.sendTurn(turn)
    expect(pending.interrupt?.kind).toBe('itinerary_proposal')
    expect(proposals.saved).toHaveLength(1)
    expect(proposals.applied).toHaveLength(0)

    const completed = await graph.resumeProposal(turn.threadId, true)
    expect(completed.state.proposalStatus).toBe('applied')
    expect(proposals.applied).toEqual(proposals.saved)
  })

  it('rejects without applying a proposal', async () => {
    let summarized = 0
    const model: AssistantModel = {
      respond: async () => ({
        reply: '已準備變更。',
        proposal: {
          title: '變更',
          explanation: '延後開始',
          operations: [{ type: 'set_day_start_time', dayId: 'day-1', startTime: '10:00' }],
        },
      }),
      summarize: async () => { summarized += 1; return 'summary' },
    }
    const proposals = persistence()
    const graph = createAssistantGraph(new MemorySaver(), { model, proposals })
    const turn = request()
    await graph.sendTurn(turn)
    const completed = await graph.resumeProposal(turn.threadId, false)
    expect(completed.state.proposalStatus).toBe('rejected')
    expect(proposals.rejected).toEqual(proposals.saved)
    expect(proposals.applied).toHaveLength(0)
    expect(summarized).toBe(0)
  })
})
