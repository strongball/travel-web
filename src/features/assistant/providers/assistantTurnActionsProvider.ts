import { providerFamily } from '@stball/react-river'

import { friendlyError } from '../utils/conversationUtils'
import {
  buildTurnRequest,
  DEFAULT_THREAD_TITLE,
  nextThreadTitle,
  type AssistantTurnContext,
} from '../services/assistantTurnFlow'
import { getThinkingBudget, type ReasoningEffort } from '../models'
import type { AssistantAttachment, AssistantProposal } from '../types'
import { assistantConversationsProvider } from './assistantConversationsProvider'
import { assistantThreadsProvider } from './assistantThreadsProvider'

const unavailableThreadError = () => new Error('對話正在刪除或已不存在')

/** 只放需要協調 thread 與 conversation 的命令；單一 provider 的 CRUD 直接呼叫 notifier。 */
export const assistantTurnActionsProvider = providerFamily(
  (ref, itineraryId: string) => {
    const threadProvider = assistantThreadsProvider(itineraryId)
    const threadsNotifier = () => ref.read(threadProvider.notifier)
    const conversationProvider = (threadId: string) =>
      assistantConversationsProvider({ itineraryId, threadId })
    const conversationNotifier = (threadId: string) =>
      ref.read(conversationProvider(threadId).notifier)

    const threadAvailable = (threadId: string) => {
      const notifier = threadsNotifier()
      return !notifier.isDeleting(threadId) &&
        Boolean(notifier.state.data?.some((thread) => thread.id === threadId))
    }
    const assertThreadAvailable = (threadId: string) => {
      if (!threadAvailable(threadId)) throw unavailableThreadError()
    }

    return {
      /** 回合進行中或已有刪除時維持目前畫面，回傳是否真的完成刪除。 */
      deleteThread: async (targetId: string): Promise<boolean> => {
        const busy = ref.read(conversationProvider(targetId)).data?.turn?.phase === 'running'
        if (busy) return false
        return threadsNotifier().delete(targetId)
      },

      sendMessage: async (input: {
        threadId: string | null
        text: string
        attachments: AssistantAttachment[]
        context: AssistantTurnContext
        selectedModel?: string
        reasoningEffort?: ReasoningEffort
      }): Promise<string | null> => {
        const content = input.text.trim()
        if (!content && input.attachments.length === 0) return null

        const notifier = threadsNotifier()
        const threads = notifier.state.data ?? await ref.read(threadProvider.promise)
        const currentTitle = threads.find((thread) => thread.id === input.threadId)?.title ?? DEFAULT_THREAD_TITLE
        const title = nextThreadTitle(currentTitle, content, input.attachments) ?? undefined

        let threadId = input.threadId
        if (!threadId || !threads.some((thread) => thread.id === threadId)) {
          try {
            threadId = (await notifier.create()).id
          } catch (error) {
            throw new Error(friendlyError(error, '無法建立新對話'))
          }
        }
        if (title) await notifier.rename(threadId, title).catch(() => {})

        // create/rename 都可能讓出 event loop；開始 turn 前必須重新確認刪除狀態。
        assertThreadAvailable(threadId)
        await conversationNotifier(threadId).send(buildTurnRequest({
          threadId,
          turnId: crypto.randomUUID(),
          text: content,
          createdAt: new Date().toISOString(),
          context: input.context,
          selectedModel: input.selectedModel,
          reasoningEffort: input.reasoningEffort,
          thinkingBudget: getThinkingBudget(input.reasoningEffort),
          attachments: input.attachments,
        }))
        return threadId
      },

      decideProposal: async (input: {
        threadId: string | null
        proposal: AssistantProposal
        approved: boolean
      }): Promise<void> => {
        if (!input.threadId ||
          input.threadId !== input.proposal.threadId ||
          input.proposal.itineraryId !== itineraryId) return
        if (!threadAvailable(input.threadId)) return
        await conversationNotifier(input.threadId).resumeProposal({ approved: input.approved })
      },

      summarize: async (threadId: string): Promise<void> => {
        if (!threadAvailable(threadId)) return
        await conversationNotifier(threadId).summarize()
      },
    }
  },
  { name: 'assistantTurnActions', ssr: false },
)
