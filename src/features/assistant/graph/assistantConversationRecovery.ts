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

  const latestUserMessage = messages.findLast((message) => message.role === 'user')
  return latestUserMessage && !completedTurnIds.has(latestUserMessage.turnId)
    ? latestUserMessage
    : null
}
