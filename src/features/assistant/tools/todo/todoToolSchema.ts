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
  reply: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  explanation: z.string().nullable().optional(),
  todos: z.array(z.object({
    title: z.string(),
    category: z.string().nullable().optional(),
  })).min(1),
  newCategories: z.array(z.string()).optional(),
})
