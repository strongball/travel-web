import type { AssistantModelResult } from '../types'
import {
  assistantModelResultSchema,
  formatAssistantSchemaError,
  jsonSchemaFor,
} from '../api/assistantSchemas'
import { parseAssistantOperations } from '../api/assistantOperations'
import {
  PROPOSAL_TOOL_NAME,
  proposeItineraryEditTool,
  proposalToolArgumentsSchema,
  applyItineraryOperations,
  changedDays,
  enrichAppliedProposalPlaces,
  placeEnrichmentCandidates,
  ItineraryProposalView,
} from './itinerary'
import {
  TODO_PROPOSAL_TOOL_NAME,
  proposeTodoListTool,
  todoProposalToolArgumentsSchema,
  extractProposedTodos,
  extractProposedCategories,
  applyTodoProposal,
  TodoProposalView,
} from './todo'

export {
  PROPOSAL_TOOL_NAME,
  proposeItineraryEditTool,
  proposalToolArgumentsSchema,
  applyItineraryOperations,
  changedDays,
  enrichAppliedProposalPlaces,
  placeEnrichmentCandidates,
  ItineraryProposalView,
  TODO_PROPOSAL_TOOL_NAME,
  proposeTodoListTool,
  todoProposalToolArgumentsSchema,
  extractProposedTodos,
  extractProposedCategories,
  applyTodoProposal,
  TodoProposalView,
}

export const langchainAssistantTools = [proposeItineraryEditTool, proposeTodoListTool]

export const assistantTools = [{
  functionDeclarations: [
    {
      name: PROPOSAL_TOOL_NAME,
      description: proposeItineraryEditTool.description,
      parametersJsonSchema: jsonSchemaFor(proposalToolArgumentsSchema),
    },
    {
      name: TODO_PROPOSAL_TOOL_NAME,
      description: proposeTodoListTool.description,
      parametersJsonSchema: jsonSchemaFor(todoProposalToolArgumentsSchema),
    },
  ],
}]

export async function executeAssistantToolCall(name: string, args: Record<string, unknown>): Promise<AssistantModelResult> {
  if (name === PROPOSAL_TOOL_NAME) {
    return await proposeItineraryEditTool.invoke(args as never)
  }
  if (name === TODO_PROPOSAL_TOOL_NAME) {
    return await proposeTodoListTool.invoke(args as never)
  }
  throw new Error(`不支援的工具：${name}`)
}

export function parseAssistantFunctionCalls(value: unknown): Promise<AssistantModelResult> | AssistantModelResult {
  if (!Array.isArray(value) || value.length !== 1) {
    throw new Error('必須且只能呼叫一個旅程助理工具')
  }
  const call = value[0] as { name?: string; args?: Record<string, unknown> }
  const name = typeof call?.name === 'string' ? call.name : ''
  const args = (call?.args ?? {}) as Record<string, unknown>
  return executeAssistantToolCall(name, args)
}

export const supportedOperations = new Set([
  'set_day_start_time',
  'add_attraction',
  'update_attraction',
  'remove_attraction',
  'move_attraction',
  'reorder_attractions',
  'add_todo',
  'add_todo_category',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export function assertSupportedOperations(value: unknown) {
  if (!isRecord(value) || !isRecord(value.proposal) || !Array.isArray(value.proposal.operations)) return
  for (const operation of value.proposal.operations) {
    if (isRecord(operation) && typeof operation.type === 'string' && !supportedOperations.has(operation.type)) {
      throw new Error(`不支援的行程修改：${operation.type}`)
    }
  }
}

export function parseAssistantModelResult(value: unknown): AssistantModelResult {
  assertSupportedOperations(value)
  const parsed = assistantModelResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error(`助理回傳格式錯誤：${formatAssistantSchemaError(parsed.error)}`)
  }
  if (!parsed.data.proposal) return { reply: parsed.data.reply }
  return {
    reply: parsed.data.reply,
    proposal: {
      title: parsed.data.proposal.title ?? '行程修改提案',
      explanation: parsed.data.proposal.explanation ?? '',
      operations: parseAssistantOperations(parsed.data.proposal.operations),
    },
  }
}
