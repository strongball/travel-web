import { RiverContainer } from '@stball/react-river'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  AssistantMessage,
  AssistantPendingToolCall,
  AssistantProposal,
} from '../types'
import type {
  AssistantChatService,
  ChatStreamEvent,
} from '../services'
import { userIdProvider } from '../../../providers/authProviders'
import {
  assistantConversationsProvider,
  type AssistantConversationSnapshot,
} from './assistantConversationsProvider'
import { assistantChatServiceProvider } from './assistantChatServiceProvider'

const message = (
  role: AssistantMessage['role'],
  turnId: string,
  content: string,
): AssistantMessage => ({
  id: `${role}-${turnId}`,
  turnId,
  role,
  content,
  createdAt: `2026-08-22T00:0${role === 'user' ? '1' : '2'}:00.000Z`,
})

const proposal = (): AssistantProposal => ({
  id: 'turn-t1',
  threadId: 'thread-1',
  turnId: 'turn-t1',
  itineraryId: 'trip-1',
  title: '調整行程',
  explanation: '',
  status: 'pending',
  createdAt: '2026-08-22T00:00:00Z',
  expectedDayRevisions: {},
  beforeDays: [],
  afterDays: [],
  proposedTodos: [],
  proposedCategories: [],
})

const pendingToolCall = (): AssistantPendingToolCall => ({
  id: 'tool-1',
  name: 'propose_itinerary_edit',
  proposal: proposal(),
})

let container: RiverContainer
let mockService: AssistantChatService

beforeEach(() => {
  mockService = {
    fetchHistory: vi.fn().mockResolvedValue({ messages: [], pendingToolCall: null }),
    sendStream: vi.fn().mockResolvedValue(undefined),
    resumeProposal: vi.fn().mockResolvedValue(undefined),
    summarize: vi.fn().mockResolvedValue(undefined),
  }
})

afterEach(() => {
  container?.dispose()
})

const createTestProvider = () => {
  container = new RiverContainer({
    overrides: [
      { original: userIdProvider, create: () => 'user-1' },
      { original: assistantChatServiceProvider('trip-1'), create: () => mockService },
    ],
  })
  const provider = assistantConversationsProvider({ itineraryId: 'trip-1', threadId: 'thread-1' })
  const notifier = container.read(provider.notifier)
  return { provider, notifier }
}

describe('AssistantConversationNotifier', () => {
  it('loads history and restores paused tool call on build', async () => {
    const user = message('user', 'turn-1', '問題')
    const toolCall = pendingToolCall()
    mockService.fetchHistory = vi.fn().mockResolvedValue({
      messages: [user],
      pendingToolCall: toolCall,
    })

    const { provider } = createTestProvider()
    await container.read(provider.promise)

    const snapshot = container.read(provider).data as AssistantConversationSnapshot
    expect(snapshot.messages).toEqual([user])
    expect(snapshot.turn?.phase).toBe('paused')
    expect(snapshot.turn?.pendingToolCall).toEqual(toolCall)
  })

  it('send streams text deltas and commits assistant message', async () => {
    const { provider, notifier } = createTestProvider()
    await container.read(provider.promise)

    const assistantMsg = message('assistant', 'turn-1', '完整回答')

    mockService.sendStream = vi.fn().mockImplementation(async (_req, _hist, onEvent) => {
      onEvent({ type: 'progress', label: '思考中…' } as ChatStreamEvent)
      onEvent({ type: 'content', text: '完整', turnId: 'turn-1' } as ChatStreamEvent)
      onEvent({ type: 'content', text: '回答', turnId: 'turn-1' } as ChatStreamEvent)
      onEvent({ type: 'message', message: assistantMsg } as ChatStreamEvent)
    })

    await notifier.send({
      threadId: 'thread-1',
      turnId: 'turn-1',
      text: '你好',
      itinerary: {} as any,
      dayRevisions: {},
    })

    const snapshot = container.read(provider).data as AssistantConversationSnapshot
    expect(snapshot.messages).toHaveLength(2)
    expect(snapshot.messages[0].role).toBe('user')
    expect(snapshot.messages[1]).toEqual(assistantMsg)
    expect(snapshot.turn).toBeNull()
  })

  it('handles error during stream gracefully and allows dismissal', async () => {
    const { provider, notifier } = createTestProvider()
    await container.read(provider.promise)

    mockService.sendStream = vi.fn().mockRejectedValue(new Error('網路錯誤'))

    await notifier.send({
      threadId: 'thread-1',
      turnId: 'turn-1',
      text: '你好',
      itinerary: {} as any,
      dayRevisions: {},
    })

    let snapshot = container.read(provider).data as AssistantConversationSnapshot
    expect(snapshot.turn?.phase).toBe('error')
    expect(snapshot.turn?.error).toBe('網路錯誤')

    notifier.dismissFailure()
    snapshot = container.read(provider).data as AssistantConversationSnapshot
    expect(snapshot.turn).toBeNull()
  })
})

