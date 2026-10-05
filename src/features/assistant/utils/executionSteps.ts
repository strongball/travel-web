import { AIMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import type { AssistantExecutionStep, AssistantProgressData } from '../types'
import { formatToolCallLabel } from './conversationUtils'

export function recordExecutionStep(steps: AssistantExecutionStep[], label: string | null, data?: AssistantProgressData) {
  if (!label) return steps
  const now = Date.now()
  const results = data?.results
  if (results) {
    return steps.map((step) => {
      const calls = step.toolCalls
      if (!calls || !calls.some((call) => results.some((result) => result.id === call.id))) return step
      return { ...step, finishedAt: now, results: results.filter((result) => calls.some((call) => call.id === result.id)) }
    })
  }
  return [...steps.map((step, index) => index === steps.length - 1 && !step.finishedAt
    ? { ...step, finishedAt: now } : step), { label, startedAt: now, ...data }]
}

/** Checkpoints retain tool inputs/results even if a failed turn has no saved reply. */
export function restoredExecutionSteps(messages: BaseMessage[]): AssistantExecutionStep[] {
  const results = messages.filter(ToolMessage.isInstance)
  return messages.filter(AIMessage.isInstance).flatMap((message) => (message.tool_calls ?? []).map((call) => ({
    label: formatToolCallLabel(call.name, call.args),
    startedAt: 0,
    toolCalls: [{ id: call.id, name: call.name, args: call.args, label: formatToolCallLabel(call.name, call.args) }],
    results: results.filter((result) => result.tool_call_id === call.id).map((result) => ({
      id: result.tool_call_id, status: result.status,
      content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
    })),
  })))
}
