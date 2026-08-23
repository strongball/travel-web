import {
  AsyncNotifier,
  asyncData,
  asyncNotifierProviderFamily,
} from '@stball/react-river'

import {
  listAssistantMessages,
  saveAssistantMessage,
} from '../lib/repositories/assistantRepository'
import type {
  AssistantGraphState,
  AssistantMessage,
  AssistantPendingToolCall,
  AssistantProposalStatus,
  AssistantTurnRequest,
  AssistantUserDecision,
} from '../features/assistant/types'
import { isRecoverableGraphStateError, visibleProgressLabel } from '../features/assistant/assistantConversationUtils'
import { findRecoveredAssistantMessages } from '../features/assistant/assistantTurnFlow'
import { assistantRuntimeProvider } from './assistantRuntimeProvider'
import { userIdProvider } from './authProviders'

const messageKey = (message: AssistantMessage) => `${message.turnId}:${message.role}`

const orderedMessages = (messages: AssistantMessage[]) =>
  [...messages].sort((first, second) => first.createdAt.localeCompare(second.createdAt))

/** 對話處理中的單一狀態:有值就渲染「正在進行」的內容(提案卡或生成文字)。 */
export type AssistantTurnOverlay = {
  phase: 'running' | 'paused' | 'error'
  streaming: AssistantMessage | null
  pendingToolCall: AssistantPendingToolCall | null
  progressLabel: string | null
  error: string | null
}

export type AssistantConversationSnapshot = {
  /** canonical 對話紀錄(持久化來源)。 */
  messages: AssistantMessage[]
  /** 處理中狀態;null 代表閒置,只渲染 messages。 */
  turn: AssistantTurnOverlay | null
}

export type AssistantConversationKey = {
  itineraryId: string
  threadId: string
}

const EMPTY_TURN: AssistantTurnOverlay = {
  phase: 'running',
  streaming: null,
  pendingToolCall: null,
  progressLabel: null,
  error: null,
}

const IDLE_CONVERSATION: AssistantConversationSnapshot = {
  messages: [],
  turn: null,
}

const restoredTurn = (
  current: AssistantTurnOverlay | null,
  graphState: AssistantGraphState | null,
): AssistantTurnOverlay | null => {
  if (current?.phase === 'running') return current
  const pendingToolCall = graphState?.pendingToolCall ?? null
  if (pendingToolCall) {
    return {
      ...(current ?? EMPTY_TURN),
      phase: 'paused',
      streaming: null,
      pendingToolCall,
    }
  }
  return current?.phase === 'paused' ? null : current
}

/**
 * 單一 thread 的對話 provider:canonical messages 加上處理中的暫態。
 * 暫態不持久化;build() 重載時會保留進行中的 turn。
 */
export class AssistantConversationNotifier extends AsyncNotifier<AssistantConversationSnapshot> {
  private loadGeneration = 0
  private activeTurn: Promise<void> | null = null
  private readonly itineraryId: string
  private readonly threadId: string

  constructor({ itineraryId, threadId }: AssistantConversationKey) {
    super()
    this.itineraryId = itineraryId
    this.threadId = threadId
  }

  async build(): Promise<AssistantConversationSnapshot> {
    const generation = ++this.loadGeneration
    const userId = this.ref.watch(userIdProvider)
    if (!userId || !this.threadId) return IDLE_CONVERSATION
    const runtime = this.ref.watch(assistantRuntimeProvider(this.itineraryId))
    const [messages, graphState] = await Promise.all([
      listAssistantMessages(this.threadId),
      runtime.runner.getState(this.threadId),
    ])
    const current = this.state.data
    if (generation !== this.loadGeneration && current) return current

    const recovered = findRecoveredAssistantMessages(messages, graphState)
    if (recovered.length > 0) {
      try {
        await Promise.all(recovered.map((message) => saveAssistantMessage(this.threadId, message)))
      } catch {
        runtime.onNotice('已從對話進度恢復助理回覆，但暫時無法同步至對話紀錄。')
      }
    }
    const latest = this.state.data
    if (generation !== this.loadGeneration && latest) return latest

    return {
      messages: orderedMessages([...messages, ...recovered]),
      turn: restoredTurn(current?.turn ?? null, graphState),
    }
  }

  private async save(message: AssistantMessage): Promise<void> {
    this.upsertMessage(message)
    await saveAssistantMessage(this.threadId, message)
  }

  async send(request: AssistantTurnRequest): Promise<void> {
    const runtime = this.ref.read(assistantRuntimeProvider(this.itineraryId))
    return this.runExclusive(async () => {
      try {
        this.beginTurn()
        await this.save({
          id: crypto.randomUUID(),
          turnId: request.turnId,
          role: 'user',
          content: request.text.trim(),
          createdAt: request.createdAt ?? new Date().toISOString(),
          attachments: request.attachments ?? null,
        })
        const input = {
          ...request,
          rehydratedSummary: request.rehydratedSummary,
          rehydratedMessages: this.state.data?.messages ?? request.rehydratedMessages,
        }
        let graphState: AssistantGraphState
        try {
          graphState = await runtime.runner.sendTurn(
            input,
            (phase) => this.setProgress(visibleProgressLabel(phase)),
            (event) => this.appendDelta(event.turnId, event.text),
          )
        } catch (error) {
          if (!isRecoverableGraphStateError(error)) throw error
          await runtime.checkpointer.deleteThread(this.threadId)
          graphState = await runtime.runner.sendTurn(
            input,
            (phase) => this.setProgress(visibleProgressLabel(phase)),
            (event) => this.appendDelta(event.turnId, event.text),
          )
        }
        this.setProgress(null)
        await this.commitTurn(graphState)
      } catch (error) {
        this.discardStreaming()
        this.fail(error instanceof Error ? error.message : '助理暫時無法回覆')
      } finally {
        this.endTurn()
      }
    })
  }

  async resumeProposal(
    decision: AssistantUserDecision,
  ): Promise<void> {
    const runtime = this.ref.read(assistantRuntimeProvider(this.itineraryId))
    return this.runExclusive(async () => {
      try {
        this.beginTurn()
        const pending = this.state.data?.turn?.pendingToolCall
        if (pending) {
          this.patchPendingProposal(
            pending.proposal.id,
            decision.approved ? 'approved' : 'rejected',
          )
        }
        const state = await runtime.runner.resumeTurn(
          this.threadId,
          decision,
          (phase) => this.setProgress(visibleProgressLabel(phase)),
          (event) => this.appendDelta(event.turnId, event.text),
        )
        await this.commitTurn(state)
        if (!state.pendingToolCall) await runtime.updateSummary(this.threadId, state.summary)
      } catch (error) {
        this.fail(error instanceof Error ? error.message : '無法處理行程提案')
      } finally {
        this.endTurn()
      }
    })
  }

  async summarize(): Promise<void> {
    if (!this.state.data?.messages.length) return
    const runtime = this.ref.read(assistantRuntimeProvider(this.itineraryId))
    return this.runExclusive(async () => {
      try {
        this.beginTurn()
        this.setProgress('正在壓縮較早的對話內容…')
        const state = await runtime.runner.summarizeThread(this.threadId)
        await runtime.updateSummary(this.threadId, state.summary)
      } catch (error) {
        this.fail(error instanceof Error ? error.message : '無法壓縮對話')
      } finally {
        this.endTurn()
      }
    })
  }

  private runExclusive(operation: () => Promise<void>): Promise<void> {
    if (this.activeTurn) return this.activeTurn
    const current = operation()
    this.activeTurn = current
    const clear = () => {
      if (this.activeTurn === current) this.activeTurn = null
    }
    void current.then(clear, clear)
    return current
  }

  // ---- 回合轉移(由 turn actions 呼叫;元件只讀)----

  private beginTurn(): void {
    this.updateSnapshot((current) => ({
      ...current,
      turn: {
        ...EMPTY_TURN,
        pendingToolCall: current.turn?.pendingToolCall ?? null,
      },
    }))
  }

  /**
   * 回合收尾:沒有等待決策的提案時收掉 overlay;
   * 錯誤狀態不在此清除(fail 後仍需顯示錯誤與重試)。
   */
  private endTurn(): void {
    this.updateSnapshot((current) => {
      if (!current.turn) return current
      if (current.turn.phase === 'error') return current
      if (current.turn.pendingToolCall) {
        return { ...current, turn: { ...current.turn, phase: 'paused', streaming: null } }
      }
      return { ...current, turn: null }
    })
  }

  private appendDelta(turnId: string, text: string): void {
    if (!text) return
    this.updateSnapshot((current) => {
      if (!current.turn) return current
      const streaming = current.turn.streaming
      if (streaming?.turnId === turnId) {
        return {
          ...current,
          turn: {
            ...current.turn,
            streaming: { ...streaming, content: streaming.content + text },
          },
        }
      }
      return {
        ...current,
        turn: {
          ...current.turn,
          streaming: {
            id: `streaming-${turnId}`,
            turnId,
            role: 'assistant',
            content: text,
            createdAt: new Date().toISOString(),
          },
        },
      }
    })
  }

  private setProgress(label: string | null): void {
    this.updateSnapshot((current) => {
      if (!current.turn || current.turn.progressLabel === label) return current
      return { ...current, turn: { ...current.turn, progressLabel: label } }
    })
  }

  /**
   * graph 回傳結果的落點:帶 pendingToolCall 時停在 paused;
   * 否則原子完成——訊息進 canonical、overlay 歸 null,單次轉移。
   */
  private async commitTurn(graphState: AssistantGraphState): Promise<AssistantMessage | null> {
    if (graphState.pendingToolCall) {
      this.updateSnapshot((current) => ({
        ...current,
        turn: {
          ...(current.turn ?? EMPTY_TURN),
          phase: 'paused',
          streaming: null,
          pendingToolCall: graphState.pendingToolCall,
        },
      }))
      return null
    }
    if (!graphState.assistantMessage) {
      this.updateSnapshot((current) => (current.turn ? { ...current, turn: null } : current))
      return null
    }
    const message = graphState.assistantMessage
    this.upsertAndEndTurn(message)
    await saveAssistantMessage(this.threadId, message)
    return message
  }

  private discardStreaming(): void {
    this.updateSnapshot((current) => {
      if (!current.turn || current.turn.streaming === null) return current
      return { ...current, turn: { ...current.turn, streaming: null } }
    })
  }

  private patchPendingProposal(proposalId: string, nextStatus: AssistantProposalStatus): void {
    this.updateSnapshot((current) => {
      if (!current.turn || current.turn.pendingToolCall?.proposal.id !== proposalId) {
        return current
      }
      return {
        ...current,
        turn: {
          ...current.turn,
          pendingToolCall: {
            ...current.turn.pendingToolCall,
            proposal: { ...current.turn.pendingToolCall.proposal, status: nextStatus },
          },
        },
      }
    })
  }

  fail(errorMessage: string): void {
    this.updateSnapshot((current) => ({
      ...current,
      turn: {
        ...(current.turn ?? EMPTY_TURN),
        phase: 'error',
        streaming: null,
        error: errorMessage,
      },
    }))
  }

  /** 使用者主動關閉失敗提示;非錯誤狀態時不作用。 */
  dismissFailure(): void {
    this.updateSnapshot((current) => {
      if (!current.turn || current.turn.phase !== 'error') return current
      return { ...current, turn: null }
    })
  }

  // ---- 內部 ----

  private updateSnapshot(
    updater: (current: AssistantConversationSnapshot) => AssistantConversationSnapshot,
  ): void {
    const next = updater(this.state.data ?? IDLE_CONVERSATION)
    if (next !== (this.state.data ?? IDLE_CONVERSATION)) this.commit(next)
  }

  private commit(snapshot: AssistantConversationSnapshot): void {
    this.loadGeneration += 1
    this.state = asyncData(snapshot)
  }

  private upsertMessage(message: AssistantMessage): void {
    this.updateSnapshot((current) => {
      const key = messageKey(message)
      const messages = orderedMessages([
        ...current.messages.filter((item) => messageKey(item) !== key),
        message,
      ])
      return { ...current, messages }
    })
  }

  /** 原子完成:訊息進 canonical、overlay 與待重試請求一併結束,單次轉移。 */
  private upsertAndEndTurn(message: AssistantMessage): void {
    const current = this.state.data ?? IDLE_CONVERSATION
    const key = messageKey(message)
    const messages = orderedMessages([
      ...current.messages.filter((item) => messageKey(item) !== key),
      message,
    ])
    this.commit({ messages, turn: null })
  }
}

export const assistantConversationsProvider = asyncNotifierProviderFamily<
  AssistantConversationNotifier,
  AssistantConversationKey
>(
  (key) => new AssistantConversationNotifier(key),
  { name: 'assistantConversations' },
)
