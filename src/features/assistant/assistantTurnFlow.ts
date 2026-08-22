import type { Itinerary, TodoItem } from '../../types/database'
import { dayRevisions } from './assistantConversationUtils'
import type {
  AssistantAttachment,
  AssistantGraphState,
  AssistantMessage,
  AssistantTurnRequest,
} from './types'

export const DEFAULT_THREAD_TITLE = '新對話'

export type AssistantTurnContext = {
  itinerary: Itinerary
  todos: TodoItem[]
  todoCategories: string[]
}

/**
 * Checkpoint 中已完成、但 canonical 紀錄缺漏的 assistant 訊息(需回存)。
 */
export const findRecoveredAssistantMessages = (
  canonicalMessages: AssistantMessage[],
  graphState: AssistantGraphState | null,
): AssistantMessage[] => {
  const canonicalAssistantTurnIds = new Set(
    canonicalMessages
      .filter((message) => message.role === 'assistant')
      .map((message) => message.turnId),
  )
  return (graphState?.messages ?? [])
    .filter((message) => message.role === 'assistant')
    .filter((message) => !canonicalAssistantTurnIds.has(message.turnId))
}

export const buildUserMessage = (
  turnId: string,
  content: string,
  attachments: AssistantAttachment[],
): AssistantMessage => ({
  id: crypto.randomUUID(),
  turnId,
  role: 'user',
  content,
  createdAt: new Date().toISOString(),
  attachments: attachments.length > 0 ? [...attachments] : null,
})

export const buildTurnRequest = ({
  threadId,
  turnId,
  text,
  createdAt,
  context,
  selectedModel,
  reasoningEffort,
  thinkingBudget,
  attachments,
}: {
  threadId: string
  turnId: string
  text: string
  createdAt?: string
  context: AssistantTurnContext
  selectedModel?: string
  reasoningEffort?: string
  thinkingBudget?: number
  attachments?: AssistantAttachment[] | null
}): AssistantTurnRequest => ({
  threadId,
  turnId,
  text,
  itinerary: context.itinerary,
  todos: context.todos,
  todoCategories: context.todoCategories,
  dayRevisions: dayRevisions(context.itinerary),
  createdAt,
  selectedModel,
  reasoningEffort,
  thinkingBudget,
  attachments: attachments && attachments.length > 0 ? attachments : null,
})

/** 新對話尚未命名時,以訊息內容或第一個附件名稱產生標題;已命名則回傳 null。 */
export const nextThreadTitle = (
  currentTitle: string,
  content: string,
  attachments: AssistantAttachment[],
): string | null => {
  if (currentTitle !== DEFAULT_THREAD_TITLE) return null
  const source = content || attachments[0]?.name || DEFAULT_THREAD_TITLE
  return source.slice(0, 36)
}
