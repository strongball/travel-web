import { z } from 'zod'
import { tool } from '@langchain/core/tools'
import type { AssistantModelResult, AssistantOperation } from '../../types'

export const TODO_PROPOSAL_TOOL_NAME = 'propose_todo_list'

const nonEmptyTextSchema = z.string().trim().min(1)

export const todoProposalToolArgumentsSchema = z.object({
  reply: nonEmptyTextSchema.describe('對使用者的自然語言回覆說明'),
  title: nonEmptyTextSchema.optional().describe('待辦清單提案標題'),
  explanation: z.string().trim().optional().describe('待辦清單說明'),
  todos: z.array(z.object({
    title: nonEmptyTextSchema.describe('待辦事項名稱'),
    category: nonEmptyTextSchema.optional().describe('所屬分類名稱'),
  })).min(1).describe('建議的待辦事項清單'),
  newCategories: z.array(nonEmptyTextSchema).optional().describe('需要額外新增的分類名稱'),
})

/**
 * LangChain standard structured tool for todo list proposals
 */
export const proposeTodoListTool = tool(
  async (input): Promise<AssistantModelResult> => {
    const operations: AssistantOperation[] = [
      ...(input.newCategories ?? []).map((name: string): AssistantOperation => ({
        type: 'add_todo_category',
        name,
      })),
      ...input.todos.map((todo: { title: string; category?: string }): AssistantOperation => ({
        type: 'add_todo',
        title: todo.title,
        category: todo.category,
      })),
    ]
    return {
      reply: input.reply,
      proposal: {
        title: input.title || '待辦清單提案',
        explanation: input.explanation || input.reply,
        operations,
      },
    }
  },
  {
    name: TODO_PROPOSAL_TOOL_NAME,
    description: '當使用者要求規劃、整理、建議或新增待辦清單（例如行前準備、行李打包、票券預約、購物提醒等）時呼叫此工具。產生的待辦項目會呈現給使用者確認後套用。',
    schema: todoProposalToolArgumentsSchema,
  },
)
