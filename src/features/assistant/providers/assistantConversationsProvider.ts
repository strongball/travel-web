import {
  AsyncNotifier,
  asyncData,
  asyncNotifierProviderFamily,
} from '@stball/react-river'

import type {
  AssistantMessage,
  AssistantPendingToolCall,
  AssistantQuestionDecision,
  AssistantTurnRequest,
  AssistantUserDecision,
} from '../types'
import { assistantChatServiceProvider } from './assistantChatServiceProvider'
import type { AssistantChatService, ChatStreamEvent } from '../services/assistantChatService'
import { userIdProvider } from '../../../providers/authProviders'
import type { AssistantTurnContext } from '../services/assistantTurnFlow'
import { dayRevisions } from '../utils/conversationUtils'

export type AssistantTurnOverlay = {
  phase: 'running' | 'paused' | 'error'
  streaming: AssistantMessage | null
  pendingToolCall: AssistantPendingToolCall | null
  progressLabel: string | null
  error: string | null
  canRetry?: boolean
}

export type AssistantConversationSnapshot = {
  messages: AssistantMessage[]
  turn: AssistantTurnOverlay | null
}

export type AssistantConversationKey = {
  itineraryId: string
  threadId: string
}

const IDLE_CONVERSATION: AssistantConversationSnapshot = {
  messages: [],
  turn: null,
}

/**
 * 專注於對話狀態管理的 River Notifier：
 * 所有底層 Checkpoint 恢復、持久化、圖狀態執行皆委託 AssistantChatService 處理。
 */
export class AssistantConversationNotifier extends AsyncNotifier<AssistantConversationSnapshot> {
  private activeTurn: Promise<void> | null = null
  private abortController: AbortController | null = null
  private retryAction: ((context: AssistantTurnContext) => Promise<void>) | null = null
  private readonly itineraryId: string
  private readonly threadId: string

  constructor({ itineraryId, threadId }: AssistantConversationKey) {
    super()
    this.itineraryId = itineraryId
    this.threadId = threadId
  }

  async build(): Promise<AssistantConversationSnapshot> {
    this.ref.onDispose(() => this.abortController?.abort())
    const userId = this.ref.watch(userIdProvider)
    if (!userId || !this.threadId) return IDLE_CONVERSATION

    const service = this.ref.watch(assistantChatServiceProvider(this.itineraryId))
    const { messages, pendingToolCall } = await service.fetchHistory(this.threadId)

    const currentTurn = this.state.data?.turn
    const restored = currentTurn?.phase === 'running' || currentTurn?.phase === 'error'
      ? currentTurn
      : pendingToolCall
      ? {
          phase: 'paused' as const,
          streaming: null,
          pendingToolCall,
          progressLabel: null,
          error: null,
        }
      : null

    return { messages, turn: restored }
  }

  async send(request: AssistantTurnRequest): Promise<void> {
    const service = this.ref.read(assistantChatServiceProvider(this.itineraryId))
    if (!service) return

    if (this.activeTurn) return this.activeTurn

    this.retryAction = (context) => this.send({
      ...request,
      ...context,
      dayRevisions: dayRevisions(context.itinerary),
    })
    this.abortController = new AbortController()
    const signal = this.abortController.signal

    const execute = async () => {
      const current = this.state.data ?? IDLE_CONVERSATION
      const userMessage: AssistantMessage = current.messages.find((message) =>
        message.role === 'user' && message.turnId === request.turnId) ?? {
        id: crypto.randomUUID(),
        turnId: request.turnId,
        role: 'user',
        content: request.text.trim(),
        createdAt: request.createdAt ?? new Date().toISOString(),
        attachments: request.attachments ?? null,
      }

      this.state = asyncData({
        messages: [...current.messages.filter((message) =>
          !(message.role === 'user' && message.turnId === request.turnId)), userMessage],
        turn: {
          phase: 'running',
          streaming: null,
          pendingToolCall: null,
          progressLabel: null,
          error: null,
        },
      })

      try {
        await service.sendStream(request, this.state.data?.messages ?? [], (event) => {
          if (signal.aborted) return
          const cur = this.state.data
          if (!cur) return

          if (event.type === 'progress') {
            this.state = asyncData({
              ...cur,
              turn: cur.turn ? { ...cur.turn, progressLabel: event.label } : null,
            })
          } else if (event.type === 'content') {
            const streaming = cur.turn?.streaming
            const updatedStreaming: AssistantMessage = streaming?.turnId === event.turnId
              ? { ...streaming, content: streaming.content + event.text }
              : {
                  id: `streaming-${event.turnId}`,
                  turnId: event.turnId,
                  role: 'assistant',
                  content: event.text,
                  createdAt: new Date().toISOString(),
                }
            this.state = asyncData({
              ...cur,
              turn: cur.turn ? { ...cur.turn, streaming: updatedStreaming } : null,
            })
          } else if (event.type === 'proposal') {
            this.state = asyncData({
              ...cur,
              turn: {
                phase: 'paused',
                streaming: null,
                pendingToolCall: event.pendingToolCall,
                progressLabel: null,
                error: null,
              },
            })
          } else if (event.type === 'message') {
            const filtered = cur.messages.filter((m) => m.id !== event.message.id)
            this.state = asyncData({
              messages: [...filtered, event.message],
              turn: null,
            })
          }
        }, signal)

        if (signal.aborted) {
          const cur = this.state.data ?? IDLE_CONVERSATION
          this.state = asyncData({ ...cur, turn: null })
          return
        }

        if (this.state.data?.turn?.phase === 'running') {
          this.state = asyncData({ ...this.state.data, turn: null })
        }
      } catch (err: any) {
        if (signal.aborted || err?.name === 'AbortError') {
          const cur = this.state.data ?? IDLE_CONVERSATION
          this.state = asyncData({ ...cur, turn: null })
          return
        }
        const cur = this.state.data ?? IDLE_CONVERSATION
        this.state = asyncData({
          ...cur,
          turn: {
            phase: 'error',
            streaming: null,
            pendingToolCall: null,
            progressLabel: null,
            error: err.message || '助理暫時無法回覆',
            canRetry: true,
          },
        })
      } finally {
        if (signal.aborted || this.state.data?.turn?.phase !== 'error') this.retryAction = null
        this.activeTurn = null
        this.abortController = null
      }
    }

    this.activeTurn = execute()
    return this.activeTurn
  }

  async resumeProposal(decision: AssistantUserDecision): Promise<void> {
    if (this.activeTurn) return this.activeTurn
    this.retryAction = () => this.resumeProposal(decision)
    return this.#resumeInterrupt({
      progressLabel: '正在套用…',
      errorMessage: '無法處理行程提案',
      runner: (service, onEvent, signal) => service.resumeProposal(this.threadId, decision, onEvent, signal),
    })
  }

  async resumeQuestion(answer: AssistantQuestionDecision): Promise<void> {
    if (this.activeTurn) return this.activeTurn
    this.retryAction = () => this.resumeQuestion(answer)
    return this.#resumeInterrupt({
      progressLabel: '正在處理您的回答…',
      errorMessage: '無法送出回答',
      runner: (service, onEvent, signal) => service.resumeQuestion(this.threadId, answer, onEvent, signal),
    })
  }

  async #resumeInterrupt(options: {
    progressLabel: string
    errorMessage: string
    runner: (
      service: AssistantChatService,
      onEvent: (event: ChatStreamEvent) => void,
      signal?: AbortSignal,
    ) => Promise<void>
  }): Promise<void> {
    const service = this.ref.read(assistantChatServiceProvider(this.itineraryId))
    if (!service) return

    if (this.activeTurn) return this.activeTurn

    this.abortController = new AbortController()
    const signal = this.abortController.signal

    const execute = async () => {
      const current = this.state.data ?? IDLE_CONVERSATION
      this.state = asyncData({
        ...current,
        turn: {
          phase: 'running',
          streaming: null,
          pendingToolCall: current.turn?.pendingToolCall ?? null,
          progressLabel: options.progressLabel,
          error: null,
        },
      })

      try {
        await options.runner(service, (event) => {
          if (signal.aborted) return
          const cur = this.state.data
          if (!cur) return

          if (event.type === 'progress') {
            this.state = asyncData({
              ...cur,
              turn: cur.turn ? { ...cur.turn, progressLabel: event.label } : null,
            })
          } else if (event.type === 'content') {
            const streaming = cur.turn?.streaming
            const updatedStreaming: AssistantMessage = streaming
              ? { ...streaming, content: streaming.content + event.text }
              : {
                  id: `streaming-${this.threadId}`,
                  turnId: this.threadId,
                  role: 'assistant',
                  content: event.text,
                  createdAt: new Date().toISOString(),
                }
            this.state = asyncData({
              ...cur,
              turn: cur.turn ? { ...cur.turn, streaming: updatedStreaming } : null,
            })
          } else if (event.type === 'proposal') {
            this.state = asyncData({
              ...cur,
              turn: {
                phase: 'paused',
                streaming: null,
                pendingToolCall: event.pendingToolCall,
                progressLabel: null,
                error: null,
              },
            })
          } else if (event.type === 'message') {
            const filtered = cur.messages.filter((m) => m.id !== event.message.id)
            this.state = asyncData({
              messages: [...filtered, event.message],
              turn: null,
            })
          }
        }, signal)

        if (signal.aborted) {
          const cur = this.state.data ?? IDLE_CONVERSATION
          this.state = asyncData({ ...cur, turn: null })
          return
        }

        if (this.state.data?.turn?.phase === 'running') {
          this.state = asyncData({ ...this.state.data, turn: null })
        }
      } catch (err: any) {
        if (signal.aborted || err?.name === 'AbortError') {
          const cur = this.state.data ?? IDLE_CONVERSATION
          this.state = asyncData({ ...cur, turn: null })
          return
        }
        const cur = this.state.data ?? IDLE_CONVERSATION
        this.state = asyncData({
          ...cur,
          turn: {
            phase: 'error',
            streaming: null,
            pendingToolCall: null,
            progressLabel: null,
            error: err.message || options.errorMessage,
            canRetry: true,
          },
        })
      } finally {
        if (signal.aborted || this.state.data?.turn?.phase !== 'error') this.retryAction = null
        this.activeTurn = null
        this.abortController = null
      }
    }

    this.activeTurn = execute()
    return this.activeTurn
  }

  cancel(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    this.retryAction = null
    const current = this.state.data
    if (current?.turn?.phase === 'running') {
      this.state = asyncData({ ...current, turn: null })
    }
  }

  async summarize(): Promise<void> {
    if (this.activeTurn || this.state.data?.turn?.phase === 'running') return
    this.retryAction = () => this.summarize()
    const service = this.ref.read(assistantChatServiceProvider(this.itineraryId))
    if (!service) return

    const current = this.state.data
    if (!current?.messages.length) return

    this.state = asyncData({
      ...current,
      turn: {
        phase: 'running',
        streaming: null,
        pendingToolCall: null,
        progressLabel: '正在壓縮較早的對話內容…',
        error: null,
      },
    })

    try {
      await service.summarize(this.threadId)
      this.retryAction = null
      this.state = asyncData({ ...this.state.data!, turn: null })
    } catch (err: any) {
      this.state = asyncData({
        ...this.state.data!,
        turn: {
          phase: 'error',
          streaming: null,
          pendingToolCall: null,
          progressLabel: null,
          error: err.message || '無法壓縮對話',
          canRetry: true,
        },
      })
    }
  }

  async retry(context: AssistantTurnContext): Promise<void> {
    if (this.state.data?.turn?.phase !== 'error' || !this.retryAction) return
    if (this.activeTurn) return this.activeTurn
    await this.retryAction(context)
  }

  dismissFailure(): void {
    this.retryAction = null
    const current = this.state.data
    if (current?.turn?.phase === 'error') {
      this.state = asyncData({ ...current, turn: null })
    }
  }
}

export const assistantConversationsProvider = asyncNotifierProviderFamily<
  AssistantConversationNotifier,
  AssistantConversationKey
>(
  (key) => new AssistantConversationNotifier(key),
  { name: 'assistantConversations' },
)
