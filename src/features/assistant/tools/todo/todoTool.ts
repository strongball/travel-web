import { tool } from '@langchain/core/tools'
import type { AssistantOperation, ItineraryChangeProposal } from '../../types'
import { todoToolInputSchema } from './todoToolSchema'
import { extractProposedCategories, extractProposedTodos } from './todoOperations'
import {
  proposalIdForRequest,
  proposalRuntimeContext,
  reviewProposal,
  type AssistantProposalToolRuntime,
} from '../proposalToolRuntime'

export const TODO_PROPOSAL_TOOL_NAME = 'propose_todo_list'

/**
 * LangChain standard structured tool for todo list proposals
 */
export const proposeTodoListTool = tool(
  async (input, runtime: AssistantProposalToolRuntime) => {
    const { request } = proposalRuntimeContext(runtime)
    const proposalId = proposalIdForRequest(request)

    const operations: AssistantOperation[] = [
      ...(input.newCategories ?? []).map((name: string): AssistantOperation => ({
        type: 'add_todo_category',
        name,
      })),
      ...input.todos.map((todo: { title: string; category?: string | null }): AssistantOperation => ({
        type: 'add_todo',
        title: todo.title,
        category: todo.category ?? undefined,
      })),
    ]

    const proposal: ItineraryChangeProposal = {
      id: proposalId,
      threadId: request?.threadId ?? '',
      turnId: request?.turnId ?? '',
      itineraryId: request?.itinerary?.id ?? '',
      title: input.title || '待辦清單提案',
      explanation: input.explanation || input.reply || '',
      expectedDayRevisions: request?.dayRevisions ?? {},
      operations,
      beforeDays: [],
      afterDays: [],
      proposedTodos: extractProposedTodos(operations),
      proposedCategories: extractProposedCategories(operations),
      status: 'pending',
      createdAt: new Date().toISOString(),
    }

    return reviewProposal(proposal, runtime)
  },
  {
    name: TODO_PROPOSAL_TOOL_NAME,
    responseFormat: 'content_and_artifact',
    description: '當使用者要求規劃、整理、建議或新增待辦清單（例如行前準備、行李打包、票券預約、購物提醒等）時呼叫此工具。產生的待辦項目會呈現給使用者確認後套用。',
    schema: todoToolInputSchema,
  },
)
