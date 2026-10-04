import { AIMessage, type ToolCall } from '@langchain/core/messages'
import type { AssistantGraphNodeState } from './graphState'

export type AssistantGraphRoute =
  | 'execute_tools'
  | 'finalize_response'

export function getLatestAssistantToolCalls(state: AssistantGraphNodeState): ToolCall[] {
  const lastAiMessage = state.modelMessages.findLast((message) => AIMessage.isInstance(message)) as AIMessage | undefined
  return lastAiMessage?.tool_calls ?? []
}

export function routeAfterRespond(state: AssistantGraphNodeState): AssistantGraphRoute {
  const toolCalls = getLatestAssistantToolCalls(state)
  if (toolCalls.length === 0) return 'finalize_response'

  // ToolNode returns unknown names and invalid arguments to the model for correction.
  return 'execute_tools'
}
