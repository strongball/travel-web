import { Command } from '@langchain/langgraph/web'
import { tool } from '@langchain/core/tools'
import type {
  AssistantMessage,
  AssistantOperation,
  AssistantTurnRequest,
  ItineraryChangeProposal,
} from '../../types'
import { todoToolInputSchema } from './todoToolSchema'

export const TODO_PROPOSAL_TOOL_NAME = 'propose_todo_list'

/**
 * LangChain standard structured tool for todo list proposals
 */
export const proposeTodoListTool = tool(
  async (input, config) => {
    const request = (config.configurable?.request ?? (config as any)?.state?.request) as AssistantTurnRequest | undefined
    const savePending = config.configurable?.savePending as ((proposal: ItineraryChangeProposal) => Promise<void>) | undefined

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
      id: crypto.randomUUID(),
      threadId: request?.threadId ?? '',
      turnId: request?.turnId ?? '',
      itineraryId: request?.itinerary?.id ?? '',
      title: input.title || '待辦清單提案',
      explanation: input.explanation || input.reply || '',
      expectedDayRevisions: request?.dayRevisions ?? {},
      operations,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }

    if (savePending) {
      await savePending(proposal)
    }

    const assistantMessage: AssistantMessage = {
      id: crypto.randomUUID(),
      turnId: request?.turnId ?? '',
      role: 'assistant',
      content: input.explanation || input.reply || '我已為您準備好待辦清單，請確認是否套用：',
      createdAt: new Date().toISOString(),
      proposal,
    }

    return new Command({
      update: {
        pendingProposal: proposal,
        assistantMessage,
      },
    })
  },
  {
    name: TODO_PROPOSAL_TOOL_NAME,
    description: '當使用者要求規劃、整理、建議或新增待辦清單（例如行前準備、行李打包、票券預約、購物提醒等）時呼叫此工具。產生的待辦項目會呈現給使用者確認後套用。',
    schema: todoToolInputSchema,
  },
)
