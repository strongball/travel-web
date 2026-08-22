import { describe, expect, it } from 'vitest'
import { findIncompleteUserMessage } from './assistantConversationRecovery'
import type { AssistantMessage } from '../types'

const message = (
  id: string,
  role: 'user' | 'assistant',
  turnId: string,
): AssistantMessage => ({
  id,
  turnId,
  role,
  content: role === 'user' ? '測試問題' : '測試回覆',
  createdAt: '2026-08-12T00:00:00Z',
})

describe('findIncompleteUserMessage', () => {
  it('returns null for an empty message list', () => {
    expect(findIncompleteUserMessage([])).toBeNull()
  })

  it('returns null when all user messages have completed assistant responses', () => {
    const messages = [
      message('msg-1', 'user', 'turn-1'),
      message('msg-2', 'assistant', 'turn-1'),
      message('msg-3', 'user', 'turn-2'),
      message('msg-4', 'assistant', 'turn-2'),
    ]
    expect(findIncompleteUserMessage(messages)).toBeNull()
  })

  it('returns the orphaned user message when the assistant reply was not saved', () => {
    const orphan = message('msg-3', 'user', 'turn-2')
    const messages = [
      message('msg-1', 'user', 'turn-1'),
      message('msg-2', 'assistant', 'turn-1'),
      orphan,
    ]
    expect(findIncompleteUserMessage(messages)).toBe(orphan)
  })

  it('returns the latest orphan if multiple uncompleted messages exist', () => {
    const olderOrphan = message('msg-1', 'user', 'turn-1')
    const latestOrphan = message('msg-3', 'user', 'turn-2')
    const messages = [
      olderOrphan,
      message('msg-2', 'assistant', 'turn-0'),
      latestOrphan,
    ]
    expect(findIncompleteUserMessage(messages)).toBe(latestOrphan)
  })

  it('handles out-of-order turn ids in the list', () => {
    const orphan = message('msg-orphan', 'user', 'turn-x')
    const messages = [
      message('msg-1', 'user', 'turn-1'),
      orphan,
      message('msg-2', 'assistant', 'turn-1'),
    ]
    expect(findIncompleteUserMessage(messages)).toBe(orphan)
  })

  it('does not get confused by assistant messages without matching user messages', () => {
    const orphan = message('msg-2', 'user', 'turn-2')
    const messages = [
      message('msg-0', 'assistant', 'turn-0'),
      message('msg-1', 'user', 'turn-1'),
      message('msg-1-reply', 'assistant', 'turn-1'),
      orphan,
    ]
    expect(findIncompleteUserMessage(messages)).toBe(orphan)
  })

  it('treats checkpoint-completed turns as complete while canonical history catches up', () => {
    const orphan = message('msg-1', 'user', 'turn-1')

    expect(findIncompleteUserMessage([orphan], ['turn-1'])).toBeNull()
  })
})
