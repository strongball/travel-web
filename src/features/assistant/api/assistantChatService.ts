import {
  listAssistantMessages,
  saveAssistantMessage,
} from '../../../lib/repositories/assistantRepository'
import type {
  AssistantGraphState,
  AssistantMessage,
  AssistantPendingToolCall,
  AssistantTurnRequest,
  AssistantUserDecision,
} from '../types'
import {
  isRecoverableGraphStateError,
  visibleProgressLabel,
} from '../assistantConversationUtils'
import { findRecoveredAssistantMessages } from '../assistantTurnFlow'
import type { AssistantConversationRuntime } from '../assistantRuntime'

export type ChatStreamEvent =
  | { type: 'progress'; label: string | null }
  | { type: 'content'; text: string; turnId: string }
  | { type: 'proposal'; pendingToolCall: AssistantPendingToolCall }
  | { type: 'message'; message: AssistantMessage }

export interface AssistantChatService {
  fetchHistory: (threadId: string) => Promise<{
    messages: AssistantMessage[]
    pendingToolCall: AssistantPendingToolCall | null
  }>
  sendStream: (
    request: AssistantTurnRequest,
    rehydratedMessages: AssistantMessage[],
    onEvent: (event: ChatStreamEvent) => void,
  ) => Promise<void>
  resumeProposal: (
    threadId: string,
    decision: AssistantUserDecision,
    onEvent: (event: ChatStreamEvent) => void,
  ) => Promise<void>
  summarize: (threadId: string) => Promise<void>
}

export function createAssistantChatService(runtime: AssistantConversationRuntime): AssistantChatService {
  return {
    fetchHistory: async (threadId: string) => {
      const [messages, graphState] = await Promise.all([
        listAssistantMessages(threadId),
        runtime.runner.getState(threadId),
      ])

      const recovered = findRecoveredAssistantMessages(messages, graphState)
      if (recovered.length > 0) {
        try {
          await Promise.all(recovered.map((msg) => saveAssistantMessage(threadId, msg)))
        } catch {
          runtime.onNotice('已從對話進度恢復助理回覆，但暫時無法同步至對話紀錄。')
        }
      }

      const allMessages = [...messages, ...recovered].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      )

      return {
        messages: allMessages,
        pendingToolCall: graphState?.pendingToolCall ?? null,
      }
    },

    sendStream: async (request, rehydratedMessages, onEvent) => {
      const userMessage: AssistantMessage = {
        id: crypto.randomUUID(),
        turnId: request.turnId,
        role: 'user',
        content: request.text.trim(),
        createdAt: request.createdAt ?? new Date().toISOString(),
        attachments: request.attachments ?? null,
      }
      await saveAssistantMessage(request.threadId, userMessage)

      const input = {
        ...request,
        rehydratedMessages,
      }

      let graphState: AssistantGraphState
      try {
        graphState = await runtime.runner.sendTurn(
          input,
          (phase) => onEvent({ type: 'progress', label: visibleProgressLabel(phase) }),
          (event) => onEvent({ type: 'content', text: event.text, turnId: event.turnId }),
        )
      } catch (error) {
        if (!isRecoverableGraphStateError(error)) throw error
        await runtime.checkpointer.deleteThread(request.threadId)
        graphState = await runtime.runner.sendTurn(
          input,
          (phase) => onEvent({ type: 'progress', label: visibleProgressLabel(phase) }),
          (event) => onEvent({ type: 'content', text: event.text, turnId: event.turnId }),
        )
      }

      onEvent({ type: 'progress', label: null })

      if (graphState.pendingToolCall) {
        onEvent({ type: 'proposal', pendingToolCall: graphState.pendingToolCall })
      } else if (graphState.assistantMessage) {
        await saveAssistantMessage(request.threadId, graphState.assistantMessage)
        onEvent({ type: 'message', message: graphState.assistantMessage })
      }
    },

    resumeProposal: async (threadId, decision, onEvent) => {
      const state = await runtime.runner.resumeTurn(
        threadId,
        decision,
        (phase) => onEvent({ type: 'progress', label: visibleProgressLabel(phase) }),
        (event) => onEvent({ type: 'content', text: event.text, turnId: event.turnId }),
      )

      if (state.pendingToolCall) {
        onEvent({ type: 'proposal', pendingToolCall: state.pendingToolCall })
      } else if (state.assistantMessage) {
        await saveAssistantMessage(threadId, state.assistantMessage)
        if (state.summary) await runtime.updateSummary(threadId, state.summary)
        onEvent({ type: 'message', message: state.assistantMessage })
      }
    },

    summarize: async (threadId) => {
      const state = await runtime.runner.summarizeThread(threadId)
      await runtime.updateSummary(threadId, state.summary)
    },
  }
}
