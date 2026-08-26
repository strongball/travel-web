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
    expect(mocks.saveAssistantMessage).toHaveBeenCalledWith('thread-1', assistant)
    expect(events).toEqual([
      { type: 'progress', label: '正在根據行程與對話產生回覆…' },
      { type: 'content', text: '回答', turnId: 'turn-1' },
      { type: 'content', text: '內容', turnId: 'turn-1' },
      { type: 'progress', label: null },
      { type: 'message', message: assistant },
    ])
  })
})
