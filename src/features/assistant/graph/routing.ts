import type { ToolCall } from '@langchain/core/messages'
import { isAssistantToolName, shouldContinueAfterAssistantTool } from '../tools'
import type { AssistantGraphNodeState } from './graphState'

export type AssistantToolCallKind = 'continuing' | 'terminal' | null

export type AssistantGraphRoute = 'execute_tools' | 'finalize_response' | 'tool_limit' | 'respond'

export function classifyAssistantToolCalls(toolCalls: readonly ToolCall[]): AssistantToolCallKind {
  if (toolCalls.length === 0) return null

  const unknownCall = toolCalls.find((call) => !isAssistantToolName(call.name))
  if (unknownCall) throw new Error(`不支援的工具：${unknownCall.name}`)

  const hasContinuingTool = toolCalls.some((call) => shouldContinueAfterAssistantTool(call.name))
  const hasTerminalTool = toolCalls.some((call) => !shouldContinueAfterAssistantTool(call.name))
  if (hasContinuingTool && hasTerminalTool) {
    throw new Error('模型不可同時呼叫查詢工具與提案工具')
  }

  return hasTerminalTool ? 'terminal' : 'continuing'
}

export function routeAfterRespond(
  state: AssistantGraphNodeState,
  maxToolRounds: number,
): AssistantGraphRoute {
  if (!state.toolCallKind) return 'finalize_response'
  if (state.toolCallKind === 'continuing' && state.toolRound >= maxToolRounds) return 'tool_limit'
  return 'execute_tools'
}

export function routeAfterTools(
  state: AssistantGraphNodeState,
  maxToolRounds: number,
): AssistantGraphRoute {
  if (state.toolCallKind === 'terminal') return 'finalize_response'
  if (state.toolRound >= maxToolRounds) return 'tool_limit'
  return 'respond'
}
