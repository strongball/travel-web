import { AIMessage, type ToolCall } from '@langchain/core/messages'
import { isAssistantToolName } from '../tools'
import type { AssistantGraphNodeState } from './graphState'

export type AssistantGraphRoute =
  | 'execute_tools'
  | 'finalize_response'
  | 'tool_limit'
  | 'respond'

export function getLatestAssistantToolCalls(state: AssistantGraphNodeState): ToolCall[] {
  const lastAiMessage = state.modelMessages.findLast((message) => AIMessage.isInstance(message)) as AIMessage | undefined
  return lastAiMessage?.tool_calls ?? []
}

export function routeAfterRespond(
  state: AssistantGraphNodeState,
  maxToolRounds: number,
): AssistantGraphRoute {
  const toolCalls = getLatestAssistantToolCalls(state)
  if (toolCalls.length === 0) return 'finalize_response'

  // Validate tool names
  const unknownCall = toolCalls.find((call) => !isAssistantToolName(call.name))
  if (unknownCall) throw new Error(`不支援的工具：${unknownCall.name}`)

  if (state.toolRound >= maxToolRounds) return 'tool_limit'
  return 'execute_tools'
}

export function routeAfterTools(
  state: AssistantGraphNodeState,
  maxToolRounds: number,
): AssistantGraphRoute {
  if (state.toolRound >= maxToolRounds) return 'tool_limit'
  return 'respond'
}
