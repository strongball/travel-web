import { describe, expect, it } from 'vitest'
import type { Itinerary } from '../../types/database'
import {
  DEFAULT_THREAD_TITLE,

  buildTurnRequest,
  buildUserMessage,
  findRecoveredAssistantMessages,
  nextThreadTitle,

} from './assistantTurnFlow'
import type {
  AssistantAttachment,
  AssistantGraphState,
  AssistantMessage,
} from './types'

const itinerary: Itinerary = {
  id: 'trip-1',
  title: 'Tokyo',
  ownerId: 'user-1',
  currency: 'JPY',
  days: [
    { id: 'day-1', itineraryId: 'trip-1', date: '2026-08-22', startTime: null, revision: 3, attractions: [] },
    { id: 'day-2', itineraryId: 'trip-1', date: '2026-08-23', startTime: null, revision: 7, attractions: [] },
  ],
}

const context = {
  itinerary,
  todos: [],
  todoCategories: ['交通'],
}

const message = (
  id: string,
  role: 'user' | 'assistant',
  turnId: string,
): AssistantMessage => ({
  id,
  turnId,
  role,
  content: role === 'user' ? '問題' : '回覆',
  createdAt: '2026-08-22T00:00:00Z',
})

const graphState = (
  overrides: Partial<AssistantGraphState> = {},
): AssistantGraphState => ({
  graphVersion: 8,
  summary: '',
  messages: [],
  request: null,
  assistantMessage: null,
  pendingToolCall: null,
  modelMessages: [],
  toolRound: 0,
  ...overrides,
})

describe('findRecoveredAssistantMessages', () => {
  it('returns assistant messages present in the checkpoint but missing from canonical history', () => {
    const user = message('m1', 'user', 'turn-1')
    const recovered = message('m2', 'assistant', 'turn-1')
    expect(
      findRecoveredAssistantMessages([user], graphState({ messages: [user, recovered] })),
    ).toEqual([recovered])
  })

  it('returns nothing when canonical history already has every assistant turn', () => {
    const user = message('m1', 'user', 'turn-1')
    const reply = message('m2', 'assistant', 'turn-1')
    expect(
      findRecoveredAssistantMessages([user, reply], graphState({ messages: [user, reply] })),
    ).toEqual([])
  })

  it('handles a null graph state', () => {
    expect(findRecoveredAssistantMessages([], null)).toEqual([])
  })
})


describe('buildUserMessage', () => {
  it('creates a user message with the given turn id', () => {
    const created = buildUserMessage('turn-1', '請看附件', [])
    expect(created).toMatchObject({
      role: 'user',
      content: '請看附件',
      turnId: 'turn-1',
      attachments: null,
    })
    expect(created.id).toBeTruthy()
    expect(created.createdAt).toBeTruthy()
  })

  it('copies attachments when present', () => {
    const attachment: AssistantAttachment = {
      id: 'a1',
      name: 'plan.txt',
      mimeType: 'text/plain',
      size: 4,
      textContent: 'plan',
    }
    const attachments = [attachment]
    const created = buildUserMessage('turn-1', '請看附件', attachments)
    expect(created.attachments).toEqual([attachment])
    expect(created.attachments).not.toBe(attachments)
  })
})

describe('buildTurnRequest', () => {
  it('derives day revisions from the current itinerary and normalizes attachments', () => {
    const request = buildTurnRequest({
      threadId: 'thread-1',
      turnId: 'turn-1',
      text: '改第二天',
      createdAt: '2026-08-22T00:00:00Z',
      context,
      selectedModel: 'gemini-2.5-flash',
      reasoningEffort: 'balanced',
      thinkingBudget: 512,
      attachments: [],
    })
    expect(request.dayRevisions).toEqual({ 'day-1': 3, 'day-2': 7 })
    expect(request.attachments).toBeNull()
    expect(request.itinerary).toBe(itinerary)
    expect(request.todoCategories).toEqual(['交通'])
  })

  it('passes attachments through when non-empty', () => {
    const attachment: AssistantAttachment = {
      id: 'a1',
      name: 'plan.txt',
      mimeType: 'text/plain',
      size: 4,
      textContent: 'plan',
    }
    const request = buildTurnRequest({
      threadId: 'thread-1',
      turnId: 'turn-1',
      text: '改第二天',
      context,
      attachments: [attachment],
    })
    expect(request.attachments).toEqual([attachment])
  })
})

describe('nextThreadTitle', () => {
  it('uses the message content for an untitled conversation', () => {
    expect(nextThreadTitle(DEFAULT_THREAD_TITLE, '幫我排第二天', [])).toBe('幫我排第二天')
  })

  it('falls back to the first attachment name when content is empty', () => {
    const attachment: AssistantAttachment = {
      id: 'a1',
      name: 'plan.txt',
      mimeType: 'text/plain',
      size: 4,
    }
    expect(nextThreadTitle(DEFAULT_THREAD_TITLE, '', [attachment])).toBe('plan.txt')
  })

  it('returns null once the thread already has a real title', () => {
    expect(nextThreadTitle('東京行前規劃', '再幫我排一天', [])).toBeNull()
  })

  it('truncates long titles to 36 characters', () => {
    const long = 'x'.repeat(50)
    expect(nextThreadTitle(DEFAULT_THREAD_TITLE, long, [])).toHaveLength(36)
  })
})
