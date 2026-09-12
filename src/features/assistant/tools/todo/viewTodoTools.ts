import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { AssistantProposalToolRuntime } from '../proposalToolRuntime'

export const VIEW_TODO_CATEGORIES_TOOL_NAME = 'view_todo_categories'
export const VIEW_TODO_LIST_TOOL_NAME = 'view_todo_list'

/**
 * 查詢目前行程已建立的所有待辦分類清單與統計
 */
export const viewTodoCategoriesTool = tool(
  async (_input: Record<string, never>, runtime: AssistantProposalToolRuntime) => {
    const request = runtime.state?.request
    const categories = request?.todoCategories ?? []
    const todos = request?.todos ?? []

    if (categories.length === 0 && todos.length === 0) {
      return '目前尚無建立任何待辦事項與分類。預設可用分類建議為：行前準備、旅途中、其他。'
    }

    const totalCount = todos.length
    const completedCount = todos.filter((t) => t.isCompleted).length
    const pendingCount = totalCount - completedCount

    const lines: string[] = [
      `【目前待辦分類概況】（共 ${totalCount} 項待辦，待完成 ${pendingCount} 項，已完成 ${completedCount} 項）`,
    ]

    // 彙整所有出現過的分類（包含 todoCategories 以及 todos 內自行標註的 category）
    const allCategories = [...new Set([...categories, ...todos.map((t) => t.category)].filter(Boolean))]

    allCategories.forEach((cat, idx) => {
      const catTodos = todos.filter((t) => t.category === cat)
      const catCompleted = catTodos.filter((t) => t.isCompleted).length
      const catPending = catTodos.length - catCompleted
      lines.push(
        `${idx + 1}. 【${cat}】（共 ${catTodos.length} 項，待完成 ${catPending} 項，已完成 ${catCompleted} 項）`,
      )
    })

    return lines.join('\n')
  },
  {
    name: VIEW_TODO_CATEGORIES_TOOL_NAME,
    description: '當需要查詢目前行程有哪些待辦分類（例如行前準備、行李打包等）以及各分類的項目數量統計時使用。',
    schema: z.object({}),
  },
)

export const viewTodoListInputSchema = z.object({
  category: z
    .string()
    .optional()
    .describe('欲查看的特定分類名稱（例如「行前準備」）。若未指定則列出所有分類的待辦事項。'),
  status: z
    .enum(['all', 'pending', 'completed'])
    .optional()
    .default('all')
    .describe('待辦狀態篩選：未完成 (pending)、已完成 (completed) 或全部 (all)。預設為 all。'),
})

export type ViewTodoListInput = z.infer<typeof viewTodoListInputSchema>

/**
 * 依分類或狀態按需查詢具體待辦事項清單
 */
export const viewTodoListTool = tool(
  async (input: ViewTodoListInput, runtime: AssistantProposalToolRuntime) => {
    const request = runtime.state?.request
    const todos = request?.todos ?? []

    if (todos.length === 0) {
      return '目前尚無任何待辦事項。'
    }

    let filtered = todos
    if (input.category) {
      const targetCategory = input.category.trim()
      filtered = filtered.filter((t) => t.category === targetCategory)
      if (filtered.length === 0) {
        return `在分類【${targetCategory}】中查無任何待辦事項。`
      }
    }

    const status = input.status || 'all'
    if (status === 'pending') {
      filtered = filtered.filter((t) => !t.isCompleted)
    } else if (status === 'completed') {
      filtered = filtered.filter((t) => t.isCompleted)
    }

    if (filtered.length === 0) {
      return `查無符合條件的待辦事項（篩選狀態: ${status}）。`
    }

    const titleParts = ['【待辦事項清單】']
    if (input.category) titleParts.push(`分類: ${input.category}`)
    if (status !== 'all') titleParts.push(`狀態: ${status === 'pending' ? '未完成' : '已完成'}`)
    titleParts.push(`（共 ${filtered.length} 項）`)

    const lines: string[] = [titleParts.join(' - ')]
    filtered.forEach((item, idx) => {
      const statusMark = item.isCompleted ? '[已完成]' : '[未完成]'
      lines.push(`${idx + 1}. ${statusMark} ${item.title}（分類：${item.category}）`)
    })

    return lines.join('\n')
  },
  {
    name: VIEW_TODO_LIST_TOOL_NAME,
    description: '當需要查看具體的待辦清單內容時使用，可指定分類名稱或完成狀態進行篩選。',
    schema: viewTodoListInputSchema,
  },
)
