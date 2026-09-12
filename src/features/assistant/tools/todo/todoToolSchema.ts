import { z } from 'zod'

const operationType = <T extends string>(value: T) => z.enum([value])
const nonEmptyTextSchema = z.string().trim().min(1)

export const addTodoOperationSchema = z.object({
  type: operationType('add_todo'),
  title: nonEmptyTextSchema,
  category: nonEmptyTextSchema.optional(),
})

export const addTodoCategoryOperationSchema = z.object({
  type: operationType('add_todo_category'),
  name: nonEmptyTextSchema,
})

export const todoOperationSchema = z.union([
  addTodoOperationSchema,
  addTodoCategoryOperationSchema,
])

/** Gemini/LangChain-compatible input schema for todo proposals. */
export const todoToolInputSchema = z.object({
  reply: z.string().optional().describe('對使用者的簡短說明或回覆'),
  title: z.string().optional().describe('提案標題'),
  explanation: z.string().optional().describe('提案詳細說明'),
  todos: z.array(z.object({
    title: z.string().describe('待辦事項名稱'),
    category: z.string().optional().describe('分類名稱'),
  })).min(1).describe('待辦事項清單'),
  newCategories: z.array(z.string()).optional().describe('新建立的待辦分類名稱清單'),
})
