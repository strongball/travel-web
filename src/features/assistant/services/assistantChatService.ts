import {
  listAssistantMessages,
  saveAssistantMessage,
} from '../../../lib/repositories/assistantRepository'
import type {
  AssistantGraphState,
  AssistantMessage,
  AssistantPendingToolCall,
  AssistantQuestionDecision,
  AssistantTurnRequest,
  AssistantUserDecision,
} from '../types'
import {
  isRecoverableGraphStateError,
  visibleProgressLabel,
} from '../utils/conversationUtils'
import { findRecoveredAssistantMessages } from './assistantTurnFlow'
import type { AssistantConversationRuntime } from './assistantRuntime'

export type ChatStreamEvent =
  | { type: 'user_saved' }
  | { type: 'progress'; label: string | null }
  | { type: 'content'; text: string; turnId: string }
  | { type: 'proposal'; pendingToolCall: AssistantPendingToolCall }
  | { type: 'message'; message: AssistantMessage }

export interface AssistantChatService {
  fetchHistory: (threadId: string) => Promise<{
    messages: AssistantMessage[]
    pendingToolCall: AssistantPendingToolCall | null
    interruptedRequest?: AssistantTurnRequest
    interruptedMessage?: AssistantMessage
  }>
  sendStream: (
    request: AssistantTurnRequest,
    rehydratedMessages: AssistantMessage[],
    onEvent: (event: ChatStreamEvent) => void,
    signal?: AbortSignal,
  ) => Promise<void>
  resumeProposal: (
    threadId: string,
    decision: AssistantUserDecision,
    onEvent: (event: ChatStreamEvent) => void,
    signal?: AbortSignal,
  ) => Promise<void>
  resumeQuestion: (
    threadId: string,
    answer: AssistantQuestionDecision,
    onEvent: (event: ChatStreamEvent) => void,
    signal?: AbortSignal,
  ) => Promise<void>
  summarize: (threadId: string) => Promise<void>
}

export function createAssistantChatService(runtime: AssistantConversationRuntime): AssistantChatService {
    const resumeTurn = async (
      threadId: string,
      payload: AssistantUserDecision | AssistantQuestionDecision,
      onEvent: (event: ChatStreamEvent) => void,
      signal?: AbortSignal,
    ) => {
      const state = await runtime.runner.resumeTurn(
        threadId,
        payload,
        (phase, detail) => onEvent({ type: 'progress', label: detail ?? visibleProgressLabel(phase) }),
        (event) => onEvent({ type: 'content', text: event.text, turnId: event.turnId }),
        signal,
      )

      if (signal?.aborted) return
      if (state.pendingToolCall) {
        onEvent({ type: 'proposal', pendingToolCall: state.pendingToolCall })
      } else if (state.assistantMessage) {
        await saveAssistantMessage(threadId, state.assistantMessage)
        if (state.summary) await runtime.updateSummary(threadId, state.summary)
        onEvent({ type: 'message', message: state.assistantMessage })
      }
    }

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

        const pendingToolCall = graphState?.pendingToolCall ?? null
        const lastMessage = allMessages.at(-1)
        const interruptedRequest = !pendingToolCall && graphState?.request &&
          !allMessages.some((message) => message.role === 'assistant' && message.turnId === graphState.request?.turnId)
          ? graphState.request : undefined
        const interruptedMessage = !pendingToolCall && lastMessage?.role === 'user' ? lastMessage : undefined
        return {
          messages: allMessages,
          pendingToolCall,
          interruptedRequest,
          interruptedMessage,
        }
      },

      sendStream: async (request, rehydratedMessages, onEvent, signal) => {
        const userMessage: AssistantMessage = rehydratedMessages.find((message) =>
          message.role === 'user' && message.turnId === request.turnId) ?? {
          id: crypto.randomUUID(),
          turnId: request.turnId,
          role: 'user',
          content: request.text.trim(),
          createdAt: request.createdAt ?? new Date().toISOString(),
          attachments: request.attachments ?? null,
          generationSettings: {
            selectedModel: request.selectedModel,
            reasoningEffort: request.reasoningEffort,
            thinkingBudget: request.thinkingBudget,
          },
        }
        await saveAssistantMessage(request.threadId, userMessage)
        onEvent({ type: 'user_saved' })

        if (signal?.aborted) return

        const input = {
          ...request,
          rehydratedMessages,
        }

        let graphState: AssistantGraphState
        try {
          graphState = await runtime.runner.sendTurn(
            input,
            (phase, detail) => onEvent({ type: 'progress', label: detail ?? visibleProgressLabel(phase) }),
            (event) => onEvent({ type: 'content', text: event.text, turnId: event.turnId }),
            signal,
          )
        } catch (error) {
          if (signal?.aborted) return
          if (!isRecoverableGraphStateError(error)) throw error
          await runtime.checkpointer.deleteThread(request.threadId)
          graphState = await runtime.runner.sendTurn(
            input,
            (phase, detail) => onEvent({ type: 'progress', label: detail ?? visibleProgressLabel(phase) }),
            (event) => onEvent({ type: 'content', text: event.text, turnId: event.turnId }),
            signal,
          )
        }

        if (signal?.aborted) return

        onEvent({ type: 'progress', label: null })

        if (graphState.pendingToolCall) {
          onEvent({ type: 'proposal', pendingToolCall: graphState.pendingToolCall })
        } else if (graphState.assistantMessage) {
          await saveAssistantMessage(request.threadId, graphState.assistantMessage)
          onEvent({ type: 'message', message: graphState.assistantMessage })
        }
      },

      resumeProposal: (threadId, decision, onEvent, signal) => resumeTurn(threadId, decision, onEvent, signal),
      resumeQuestion: (threadId, answer, onEvent, signal) => resumeTurn(threadId, answer, onEvent, signal),

      summarize: async (threadId) => {
        const state = await runtime.runner.summarizeThread(threadId)
        await runtime.updateSummary(threadId, state.summary)
      },
    }
}
