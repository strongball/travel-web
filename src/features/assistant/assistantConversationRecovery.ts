import type { AssistantMessage } from './types'

export function findIncompleteUserMessage(
  messages: AssistantMessage[],
): AssistantMessage | null {
  const completedTurnIds = new Set(
    messages
      .filter((message) => message.role === 'assistant')
      .map((message) => message.turnId),
  )

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === 'user' && !completedTurnIds.has(message.turnId)) return message
  }

  return null
}
