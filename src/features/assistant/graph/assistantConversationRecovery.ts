import type { AssistantMessage } from '../types'

export function findIncompleteUserMessage(
  messages: AssistantMessage[],
  checkpointCompletedTurnIds: Iterable<string> = [],
): AssistantMessage | null {
  const completedTurnIds = new Set(
    messages
      .filter((message) => message.role === 'assistant')
      .map((message) => message.turnId),
  )
  for (const turnId of checkpointCompletedTurnIds) completedTurnIds.add(turnId)

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === 'user' && !completedTurnIds.has(message.turnId)) return message
  }

  return null
}
