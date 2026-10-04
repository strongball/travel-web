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
    resumeQuestion: vi.fn().mockResolvedValue(undefined),
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

  it('resumes clarifying question answer through resumeQuestion', async () => {
    const { notifier } = createTestProvider()
    const answer = { selectedOptions: ['☕ 悠閒慢活'], answer: '☕ 悠閒慢活' }
    await notifier.resumeQuestion(answer)

    expect(mockService.resumeQuestion).toHaveBeenCalledWith('thread-1', answer, expect.any(Function), expect.any(AbortSignal))
  })

  it('retries the original turn with fresh context and no duplicate or partial messages', async () => {
    const { provider, notifier } = createTestProvider()
    await container.read(provider.promise)
    const attachments = [{ id: 'file', name: 'notes.txt', mimeType: 'text/plain', size: 6, text: '晚餐' }]
    const request = {
      threadId: 'thread-1', turnId: 'retry-turn', text: '晚餐 6:30',
      itinerary: { id: 'trip-1', title: '旅行', ownerId: 'user', currency: 'TWD' },
      dayRevisions: {}, attachments, selectedModel: 'original-model', thinkingBudget: 2000,
    }
    mockService.sendStream = vi.fn().mockImplementationOnce(async (_req, _history, onEvent) => {
      onEvent({ type: 'content', text: '半成品', turnId: request.turnId })
      throw new Error('stream failed')
    }).mockImplementationOnce(async (_req, _history, onEvent) => {
      expect(container.read(provider).data?.turn?.streaming).toBeNull()
      onEvent({ type: 'message', message: message('assistant', request.turnId, '完成') })
    })
    await notifier.send(request)
    expect(container.read(provider).data?.turn?.canRetry).toBe(true)
    const context = {
      itinerary: { ...request.itinerary, title: '最新行程' }, todos: [], todoCategories: [],
    }
    await notifier.retry(context)
    expect(mockService.sendStream).toHaveBeenLastCalledWith(
      expect.objectContaining({ ...request, ...context }), expect.any(Array), expect.any(Function), expect.any(AbortSignal),
    )
    const messages = container.read(provider).data!.messages
    expect(messages.map((item) => item.content)).toEqual(['晚餐 6:30', '完成'])
    expect(messages[0].attachments).toEqual(attachments)
    expect(container.read(provider).data?.turn).toBeNull()
  })

  it('deduplicates retry clicks and stops offering retry after cancellation', async () => {
    const { provider, notifier } = createTestProvider()
    await container.read(provider.promise)
    mockService.sendStream = vi.fn().mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(() => new Promise(() => {}))
    const context = { itinerary: { id: 'trip-1', title: '', ownerId: 'user', currency: 'TWD' }, todos: [], todoCategories: [] }
    await notifier.send({ ...context, threadId: 'thread-1', turnId: 'turn', text: 'hello', dayRevisions: {} })
    void notifier.retry(context)
    void notifier.retry(context)
    expect(mockService.sendStream).toHaveBeenCalledTimes(2)
    notifier.cancel()
    await notifier.retry(context)
    expect(mockService.sendStream).toHaveBeenCalledTimes(2)
    expect(container.read(provider).data?.turn).toBeNull()
  })

  it('retries a failed proposal continuation instead of sending a new user message', async () => {
    const { notifier, provider } = createTestProvider()
    await container.read(provider.promise)
    mockService.resumeProposal = vi.fn().mockRejectedValueOnce(new Error('reply failed')).mockResolvedValueOnce(undefined)
    await notifier.resumeProposal({ approved: true })
    await notifier.retry({ itinerary: { id: 'trip-1', title: '', ownerId: 'user', currency: 'TWD' }, todos: [], todoCategories: [] })
    expect(mockService.resumeProposal).toHaveBeenCalledTimes(2)
    expect(mockService.sendStream).not.toHaveBeenCalled()
    expect(container.read(provider).data?.turn).toBeNull()
  })

  it('cancels an in-flight turn and resets turn state to null', async () => {
    const { notifier, provider } = createTestProvider()
    await container.read(provider.promise)
    let abortSignalPassed: AbortSignal | undefined
    mockService.sendStream = vi.fn().mockImplementation(async (_req, _msgs, _onEvent, signal) => {
      abortSignalPassed = signal
      return new Promise(() => {})
    })

    void notifier.send({
      threadId: 'thread-1',
      turnId: 'turn-cancel',
      text: '規劃行程',
      createdAt: '2026-09-21T00:00:00.000Z',
      itinerary: { id: 'itinerary-1', title: '東京自由行', ownerId: 'user-1', currency: 'JPY', startDate: '2026-05-01', days: [] },
      todoCategories: [],
      todos: [],
      dayRevisions: {},
    })

    let snapshot = container.read(provider).data as AssistantConversationSnapshot
    expect(snapshot.turn?.phase).toBe('running')

    notifier.cancel()

    snapshot = container.read(provider).data as AssistantConversationSnapshot
    expect(snapshot.turn).toBeNull()
    expect(abortSignalPassed?.aborted).toBe(true)
  })
  it('restores retry from a persisted unfinished user message with attachments and model settings', async () => {
    const user = { ...message('user', 'unfinished', '參考預約'),
      attachments: [{ id: 'pdf', name: '預約.pdf', mimeType: 'application/pdf', size: 3, dataUrl: 'data:application/pdf;base64,YWJj' }],
      generationSettings: { selectedModel: 'original-model', reasoningEffort: 'high', thinkingBudget: 1024 },
    }
    mockService.fetchHistory = vi.fn().mockResolvedValue({ messages: [user], pendingToolCall: null, interruptedMessage: user })
    const { provider, notifier } = createTestProvider()
    await container.read(provider.promise)
    expect(container.read(provider).data?.turn).toMatchObject({ phase: 'error', canRetry: true })
    const itinerary = { id: 'trip-1', title: '最新行程', ownerId: 'user-1', currency: 'TWD' }
    await notifier.retry({ itinerary, todos: [], todoCategories: [] })
    expect(mockService.sendStream).toHaveBeenCalledWith(expect.objectContaining({
      turnId: user.turnId, text: user.content, attachments: user.attachments, itinerary,
      ...user.generationSettings,
    }), [user], expect.any(Function), expect.any(AbortSignal))
    expect(container.read(provider).data?.messages).toEqual([user])
  })

  it.each([null, 'stream broken', { message: 'plain object failure' }])('renders non-Error failures without leaving the composer permanently running (%j)', async (failure) => {
    mockService.sendStream = vi.fn().mockRejectedValueOnce(failure)
    const { provider, notifier } = createTestProvider()
    await container.read(provider.promise)
    const itinerary = { id: 'trip-1', title: '', ownerId: 'user', currency: 'TWD' }
    await notifier.send({ threadId: 'thread-1', turnId: 'odd-error', text: '安排旅程', itinerary, dayRevisions: {} })
    expect(container.read(provider).data?.turn).toMatchObject({ phase: 'error', canRetry: true, error: expect.any(String) })
    mockService.sendStream = vi.fn().mockResolvedValueOnce(undefined)
    await notifier.retry({ itinerary, todos: [], todoCategories: [] })
    expect(container.read(provider).data?.turn).toBeNull()
  })

  it('rejects a new send while a cancelled request is settling without adding or accepting its message', async () => {
    const { provider, notifier } = createTestProvider()
    await container.read(provider.promise)
    let finish!: () => void
    mockService.sendStream = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    const request = { threadId: 'thread-1', turnId: 'old', text: '第一則', itinerary: { id: 'trip-1', title: '', ownerId: 'user', currency: 'TWD' }, dayRevisions: {} }
    const pending = notifier.send(request)
    notifier.cancel()
    const accepted = vi.fn()
    await expect(notifier.send({ ...request, turnId: 'new', text: '下一則草稿' }, accepted)).rejects.toThrow('上一個請求仍在結束中')
    expect(accepted).not.toHaveBeenCalled()
    expect(container.read(provider).data?.messages).toHaveLength(1)
    finish()
    await pending
    mockService.sendStream = vi.fn().mockResolvedValue(undefined)
    await notifier.send({ ...request, turnId: 'new', text: '下一則草稿' })
    expect(mockService.sendStream).toHaveBeenCalledOnce()
  })

  it('leaves a pending proposal intact when asked to summarize', async () => {
    const pending = pendingToolCall()
    mockService.fetchHistory = vi.fn().mockResolvedValue({ messages: [message('user', 'paused', '調整')], pendingToolCall: pending })
    const { provider, notifier } = createTestProvider()
    await container.read(provider.promise)
    await notifier.summarize()
    expect(mockService.summarize).not.toHaveBeenCalled()
    expect(container.read(provider).data?.turn?.pendingToolCall).toEqual(pending)
  })

  it('can retry a failed manual summary without clearing or duplicating messages', async () => {
    const user = message('user', 'finished', '行程')
    mockService.fetchHistory = vi.fn().mockResolvedValue({ messages: [user], pendingToolCall: null })
    mockService.summarize = vi.fn().mockRejectedValueOnce(null).mockResolvedValueOnce(undefined)
    const { provider, notifier } = createTestProvider()
    await container.read(provider.promise)
    await notifier.summarize()
    expect(container.read(provider).data?.turn).toMatchObject({ phase: 'error', canRetry: true })
    await notifier.retry({ itinerary: { id: 'trip-1', title: '', ownerId: 'user', currency: 'TWD' }, todos: [], todoCategories: [] })
    expect(mockService.summarize).toHaveBeenCalledTimes(2)
    expect(container.read(provider).data).toMatchObject({ messages: [user], turn: null })
  })

})
