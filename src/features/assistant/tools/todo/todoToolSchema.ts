import { z } from 'zod'

/** Gemini/LangChain-compatible input schema for todo proposals. */
export const todoToolInputSchema = z.object({
  reply: z.string(),
  title: z.string().nullable().optional(),
  explanation: z.string().nullable().optional(),
  todos: z.array(z.object({
    title: z.string(),
    category: z.string().nullable().optional(),
  })).min(1),
  newCategories: z.array(z.string()).optional(),
})
