import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssistantMessage } from '../../features/assistant/types'

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('../supabase', () => ({ supabase: supabaseMock }))

import {
  listAssistantMessages,
  listAssistantThreads,
  saveAssistantMessage,
} from './assistantRepository'

beforeEach(() => vi.clearAllMocks())

describe('assistantRepository', () => {
  it('loads only the thread fields used by the conversation UI', async () => {
    const order = vi.fn(async () => ({
      data: [{
        id: 'thread-1',
        title: '東京行程',
        summary: '摘要',
        updated_at: '2026-08-22T00:00:00.000Z',
      }],
      error: null,
    }))
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order,
    }
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    supabaseMock.from.mockReturnValue(query)

    await expect(listAssistantThreads('trip-1')).resolves.toEqual([{
      id: 'thread-1',
      title: '東京行程',
      summary: '摘要',
      updatedAt: '2026-08-22T00:00:00.000Z',
    }])
    expect(query.select).toHaveBeenCalledWith('id,title,summary,updated_at')
  })

  it('round-trips message metadata without adding empty fields', async () => {
    const message: AssistantMessage = {
      id: 'message-1',
      turnId: 'turn-1',
      role: 'user',
      content: '請參考附件',
      createdAt: '2026-08-22T00:00:00.000Z',
      attachments: [{
        id: 'attachment-1',
        name: 'plan.txt',
        mimeType: 'text/plain',
        size: 4,
        textContent: 'plan',
      }],
    }
    const upsert = vi.fn(async () => ({ error: null }))
    supabaseMock.from.mockReturnValueOnce({ upsert })

    await saveAssistantMessage('thread-1', message)

    expect(upsert).toHaveBeenCalledWith({
      id: message.id,
      thread_id: 'thread-1',
      turn_id: message.turnId,
      role: message.role,
      content: message.content,
      metadata: { attachments: message.attachments },
      created_at: message.createdAt,
    }, { onConflict: 'thread_id,turn_id,role' })

    const order = vi.fn(async () => ({
      data: [{
        id: message.id,
        turn_id: message.turnId,
        role: message.role,
        content: message.content,
        metadata: { attachments: message.attachments },
        created_at: message.createdAt,
      }],
      error: null,
    }))
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order,
    }
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    supabaseMock.from.mockReturnValueOnce(query)

    await expect(listAssistantMessages('thread-1')).resolves.toEqual([
      expect.objectContaining({ attachments: message.attachments }),
    ])
    expect(query.select).toHaveBeenCalledWith('id,turn_id,role,content,metadata,created_at')
  })
})
