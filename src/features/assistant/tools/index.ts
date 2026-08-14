import type { AssistantModelResult } from '../types'
import {
  assistantModelResultSchema,
  formatAssistantSchemaError,
} from '../api/assistantSchemas'
import { parseAssistantOperations } from '../api/assistantOperations'
import {
  PROPOSAL_TOOL_NAME,
  proposeItineraryEditTool,
  applyItineraryOperations,
  changedDays,
  enrichAppliedProposalPlaces,
  placeEnrichmentCandidates,
  ItineraryProposalView,
} from './itinerary'
import {
  TODO_PROPOSAL_TOOL_NAME,
  proposeTodoListTool,
  extractProposedTodos,
  extractProposedCategories,
  applyTodoProposal,
  TodoProposalView,
} from './todo'

export {
  PROPOSAL_TOOL_NAME,
  proposeItineraryEditTool,
  applyItineraryOperations,
  changedDays,
  enrichAppliedProposalPlaces,
  placeEnrichmentCandidates,
  ItineraryProposalView,
  TODO_PROPOSAL_TOOL_NAME,
  proposeTodoListTool,
  extractProposedTodos,
  extractProposedCategories,
  applyTodoProposal,
  TodoProposalView,
}

/** LangChain tools used by ChatGoogleGenerativeAI.bindTools. */
export const langchainAssistantTools = [proposeItineraryEditTool, proposeTodoListTool]

export async function executeAssistantToolCall(name: string, args: Record<string, unknown>): Promise<AssistantModelResult> {
  if (name === PROPOSAL_TOOL_NAME) {
    return await proposeItineraryEditTool.invoke(args as never)
  }
  if (name === TODO_PROPOSAL_TOOL_NAME) {
    return await proposeTodoListTool.invoke(args as never)
  }
  throw new Error(`不支援的工具：${name}`)
}

export function parseAssistantModelResult(value: unknown): AssistantModelResult {
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
