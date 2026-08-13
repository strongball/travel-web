import { describe, expect, it } from 'vitest'
import { findIncompleteUserMessage } from './assistantConversationRecovery'
import type { AssistantMessage, AssistantMessageRole } from './types'

const message = (
  id: string,
  turnId: string,
  role: AssistantMessageRole,
): AssistantMessage => ({
  id,
  turnId,
  role,
  content: id,
  createdAt: `2026-08-13T00:00:0${id.length}.000Z`,
})

describe('findIncompleteUserMessage', () => {
  it('returns null for an empty conversation', () => {
    expect(findIncompleteUserMessage([])).toBeNull()
  })

  it('returns null when a user message has an assistant response in the same turn', () => {
    const messages = [
      message('user-1', 'turn-1', 'user'),
      message('assistant-1', 'turn-1', 'assistant'),
    ]

    expect(findIncompleteUserMessage(messages)).toBeNull()
  })

  it('returns a trailing user message without an assistant response', () => {
    const orphan = message('user-2', 'turn-2', 'user')
    const messages = [
      message('user-1', 'turn-1', 'user'),
      message('assistant-1', 'turn-1', 'assistant'),
      orphan,
    ]

    expect(findIncompleteUserMessage(messages)).toBe(orphan)
  })

  it('returns the most recent user message when multiple turns are incomplete', () => {
    const latestOrphan = message('user-3', 'turn-3', 'user')
    const messages = [
      message('user-1', 'turn-1', 'user'),
      message('user-2', 'turn-2', 'user'),
      message('assistant-2', 'turn-2', 'assistant'),
      latestOrphan,
    ]

    expect(findIncompleteUserMessage(messages)).toBe(latestOrphan)
  })

  it('matches responses by turn regardless of ordering and ignores assistants from other turns', () => {
    const orphan = message('user-orphan', 'turn-orphan', 'user')
    const messages = [
      message('assistant-complete', 'turn-complete', 'assistant'),
      orphan,
      message('assistant-other', 'turn-other', 'assistant'),
      message('user-complete', 'turn-complete', 'user'),
    ]

    expect(findIncompleteUserMessage(messages)).toBe(orphan)
  })

  it('does not mutate the messages or their ordering', () => {
    const orphan = message('user-2', 'turn-2', 'user')
    const messages: AssistantMessage[] = [
      message('user-1', 'turn-1', 'user'),
      message('assistant-1', 'turn-1', 'assistant'),
      orphan,
    ]
    const snapshot = structuredClone(messages)
    messages.forEach(Object.freeze)
    Object.freeze(messages)

    expect(findIncompleteUserMessage(messages)).toBe(orphan)
    expect(messages).toEqual(snapshot)
  })
})
