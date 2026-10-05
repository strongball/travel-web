import { describe, expect, it, vi } from 'vitest'
import { createAssistantChatService } from './assistantChatService'
import type { AssistantGraphState, AssistantMessage } from '../types'
import type { AssistantConversationRuntime } from './assistantRuntime'

const mocks = vi.hoisted(() => ({
  listAssistantMessages: vi.fn(),
  saveAssistantMessage: vi.fn(),
}))

vi.mock('../../../lib/repositories/assistantRepository', () => mocks)

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

describe('AssistantChatService', () => {
  it('fetchHistory merges and recovers uncommitted messages from checkpoint', async () => {
    const user = message('user', 'turn-1', '問題')
    const assistant = message('assistant', 'turn-1', '回答')
    mocks.listAssistantMessages.mockResolvedValue([user])

    const runtime = {
      runner: {
        getState: vi.fn().mockResolvedValue({
          messages: [user, assistant],
          pendingToolCall: null,
        } as unknown as AssistantGraphState),
      },
      onNotice: vi.fn(),
    } as unknown as AssistantConversationRuntime

    const service = createAssistantChatService(runtime)
    const result = await service.fetchHistory('thread-1')

    expect(result.messages).toEqual([user, assistant])
    expect(mocks.saveAssistantMessage).toHaveBeenCalledWith('thread-1', assistant)
  })

  it('sendStream saves user message, invokes runner, and emits stream events', async () => {
    mocks.saveAssistantMessage.mockResolvedValue(undefined)
    const assistant = message('assistant', 'turn-1', '回答內容')

    const runtime = {
      runner: {
        sendTurn: vi.fn().mockImplementation(async (_input, onProgress, onStream) => {
          onProgress('generating_response')
          onStream({ turnId: 'turn-1', text: '回答' })
          onStream({ turnId: 'turn-1', text: '內容' })
          return {
            assistantMessage: assistant,
            pendingToolCall: null,
          } as unknown as AssistantGraphState
        }),
      },
      checkpointer: { deleteThread: vi.fn() },
      onNotice: vi.fn(),
    } as unknown as AssistantConversationRuntime

    const service = createAssistantChatService(runtime)
    const events: any[] = []

    await service.sendStream(
      {
        threadId: 'thread-1',
        turnId: 'turn-1',
        text: '用戶問題',
        itinerary: {} as any,
        dayRevisions: {},
      },
      [],
      (event) => events.push(event),
    )

    expect(mocks.saveAssistantMessage).toHaveBeenCalledWith(
      'thread-1',
      expect.objectContaining({ role: 'user', content: '用戶問題' }),
    )
    expect(mocks.saveAssistantMessage).toHaveBeenCalledWith('thread-1', expect.objectContaining({ ...assistant, executionSteps: expect.any(Array), durationMs: expect.any(Number) }))
    expect(events).toEqual([
      { type: 'user_saved' },
      { type: 'progress', label: '正在思考並產生回覆…' },
      { type: 'content', text: '回答', turnId: 'turn-1' },
      { type: 'content', text: '內容', turnId: 'turn-1' },
      { type: 'progress', label: null },
      { type: 'message', message: expect.objectContaining(assistant) },
    ])
  })

  it('reuses the persisted user message when resending the same turn', async () => {
    const user = message('user', 'retry-turn', '晚餐 6:30')
    const runtime = {
      runner: { sendTurn: vi.fn().mockResolvedValue({ assistantMessage: null, pendingToolCall: null }) },
    } as unknown as AssistantConversationRuntime
    await createAssistantChatService(runtime).sendStream({
      threadId: 'thread', turnId: user.turnId, text: user.content,
      itinerary: { id: 'trip', title: '', ownerId: 'user', currency: 'TWD' }, dayRevisions: {},
    }, [user], vi.fn())
    expect(mocks.saveAssistantMessage).toHaveBeenLastCalledWith('thread', user)
  })

  it('recovers a completed checkpoint reply after message synchronization fails', async () => {
    const assistant = message('assistant', 'retry-turn', '行程已套用')
    const runtime = {
      runner: { resumeTurn: vi.fn().mockResolvedValue({ assistantMessage: assistant, pendingToolCall: null }) },
      updateSummary: vi.fn(),
    } as unknown as AssistantConversationRuntime
    const service = createAssistantChatService(runtime)
    mocks.saveAssistantMessage.mockRejectedValueOnce(new Error('sync failed')).mockResolvedValueOnce(undefined)
    const onEvent = vi.fn()
    await expect(service.resumeProposal('thread', { approved: true }, onEvent)).rejects.toThrow('sync failed')
    expect(onEvent).not.toHaveBeenCalled()
    await service.resumeProposal('thread', { approved: true }, onEvent)
    expect(onEvent).toHaveBeenCalledWith({ type: 'message', message: expect.objectContaining(assistant) })
  })
  it('reports unfinished checkpoints after reload but never labels completed replies as retryable', async () => {
    const user = message('user', 'reload-turn', '晚餐 6:30')
    const request = { turnId: user.turnId, threadId: 'thread', text: user.content }
    mocks.listAssistantMessages.mockResolvedValue([user])
    const getState = vi.fn().mockResolvedValue({ messages: [user], request, pendingToolCall: null })
    const service = createAssistantChatService({ runner: { getState }, onNotice: vi.fn() } as unknown as AssistantConversationRuntime)
    expect(await service.fetchHistory('thread')).toMatchObject({ interruptedRequest: request, interruptedMessage: user })
    getState.mockResolvedValue({ messages: [user, message('assistant', user.turnId, '完成')], request: null, pendingToolCall: null })
    const completed = await service.fetchHistory('thread')
    expect(completed.interruptedRequest).toBeUndefined()
    expect(completed.interruptedMessage).toBeUndefined()
  })

})
