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
  AssistantProgressData,
  AssistantExecutionStep,
} from '../types'
import { recordExecutionStep, restoredExecutionSteps } from '../utils/executionSteps'
import {
  isRecoverableGraphStateError,
  visibleProgressLabel,
} from '../utils/conversationUtils'
import { findRecoveredAssistantMessages } from './assistantTurnFlow'
import type { AssistantConversationRuntime } from './assistantRuntime'

export type ChatStreamEvent =
  | { type: 'user_saved' }
  | { type: 'progress'; label: string | null; data?: AssistantProgressData }
  | { type: 'content'; text: string; turnId: string }
  | { type: 'proposal'; pendingToolCall: AssistantPendingToolCall }
  | { type: 'message'; message: AssistantMessage }

export interface AssistantChatService {
  fetchHistory: (threadId: string) => Promise<{
    messages: AssistantMessage[]
    pendingToolCall: AssistantPendingToolCall | null
    interruptedRequest?: AssistantTurnRequest
    interruptedMessage?: AssistantMessage
    executionSteps?: AssistantExecutionStep[]
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
      const startedAt = Date.now()
      let executionSteps: AssistantExecutionStep[] = []
      const state = await runtime.runner.resumeTurn(
        threadId,
        payload,
        (phase, detail, data) => {
          const label = detail ?? visibleProgressLabel(phase)
          executionSteps = recordExecutionStep(executionSteps, label, data)
          onEvent({ type: 'progress', label, data })
        },
        (event) => onEvent({ type: 'content', text: event.text, turnId: event.turnId }),
        signal,
      )

      if (signal?.aborted) return
      if (state.pendingToolCall) {
        onEvent({ type: 'proposal', pendingToolCall: state.pendingToolCall })
      } else if (state.assistantMessage) {
        const message = { ...state.assistantMessage, executionSteps, durationMs: Date.now() - startedAt }
        await saveAssistantMessage(threadId, message)
        if (state.summary) await runtime.updateSummary(threadId, state.summary)
        onEvent({ type: 'message', message })
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
          executionSteps: restoredExecutionSteps(graphState?.modelMessages ?? []),
        }
      },

      sendStream: async (request, rehydratedMessages, onEvent, signal) => {
        const startedAt = Date.now()
        let executionSteps: AssistantExecutionStep[] = []
        const onProgress = (phase: Parameters<import('../types').AssistantProgressListener>[0], detail?: string, data?: AssistantProgressData) => {
          const label = detail ?? visibleProgressLabel(phase)
          executionSteps = recordExecutionStep(executionSteps, label, data)
          onEvent({ type: 'progress', label, data })
        }
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
            onProgress,
            (event) => onEvent({ type: 'content', text: event.text, turnId: event.turnId }),
            signal,
          )
        } catch (error) {
          if (signal?.aborted) return
          if (!isRecoverableGraphStateError(error)) throw error
          await runtime.checkpointer.deleteThread(request.threadId)
          graphState = await runtime.runner.sendTurn(
            input,
            onProgress,
            (event) => onEvent({ type: 'content', text: event.text, turnId: event.turnId }),
            signal,
          )
        }

        if (signal?.aborted) return

        onEvent({ type: 'progress', label: null })

        if (graphState.pendingToolCall) {
          onEvent({ type: 'proposal', pendingToolCall: graphState.pendingToolCall })
        } else if (graphState.assistantMessage) {
          const message = { ...graphState.assistantMessage, executionSteps, durationMs: Date.now() - startedAt }
          await saveAssistantMessage(request.threadId, message)
          onEvent({ type: 'message', message })
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
