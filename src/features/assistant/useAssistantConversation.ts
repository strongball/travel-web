import { useRiverRef } from '@stball/react-river'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import type { Itinerary, TodoItem } from '../../types/database'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { assistantConversationsProvider } from '../../providers/assistantConversationsProvider'
import { friendlyError } from './assistantConversationUtils'
import { buildTurnRequest, nextThreadTitle } from './assistantTurnFlow'
import { createAssistantRuntime } from './assistantRuntime'
import { useAssistantComposerState } from './hooks/useAssistantComposerState'
import { useAssistantThreads } from './hooks/useAssistantThreads'
import { getThinkingBudget } from './models'
import type { AssistantProposal } from './types'

export function useAssistantConversation(
  itinerary: Itinerary,
  onItineraryApplied: () => void | Promise<void>,
  todos: TodoItem[] = [],
  todoCategories: string[] = [],
) {
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const riverRef = useRiverRef()
  const online = useOnlineStatus()
  const focusComposerRef = useRef<(() => void) | null>(null)
  const composer = useAssistantComposerState(setError)
  const threads = useAssistantThreads(itinerary.id, setError)
  const {
    threadId,
    currentThread,
    ensureActiveThread,
    updateSummary,
    isDeleting,
  } = threads
  const runtime = useMemo(
    () => createAssistantRuntime(onItineraryApplied, setNotice),
    [onItineraryApplied],
  )
  const conversationRuntime = useMemo(
    () => ({
      ...runtime,
      updateSummary: async (targetId: string, summary: string) => updateSummary(targetId, summary),
      onNotice: setNotice,
    }),
    [runtime, setNotice, updateSummary],
  )

  const notifier = useCallback(
    (threadId: string) => riverRef.read(assistantConversationsProvider(threadId).notifier),
    [riverRef],
  )

  useEffect(() => {
    setError(null)
    if (!threadId) return
    void notifier(threadId).refresh(conversationRuntime)
      .catch((loadError) => setError(friendlyError(loadError, '無法載入對話內容')))
  }, [conversationRuntime, notifier, setError, threadId])

  const send = useCallback(async (event: FormEvent) => {
    event.preventDefault()
    const content = composer.text.trim()
    if ((!content && composer.attachments.length === 0) || !online) return

    setError(null)
    setNotice(null)
    const attachments = [...composer.attachments]
    const title = nextThreadTitle(
      currentThread?.title ?? '新對話',
      content,
      attachments,
    ) ?? undefined
    const thread = await ensureActiveThread(title)
    const turnId = crypto.randomUUID()
    composer.setText('')
    composer.clearAttachments()
    const conversation = notifier(thread.id)
    await conversation.send(buildTurnRequest({
      threadId: thread.id,
      turnId,
      text: content,
      createdAt: new Date().toISOString(),
      context: { itinerary, todos, todoCategories },
      selectedModel: composer.selectedModel,
      reasoningEffort: composer.reasoningEffort,
      thinkingBudget: getThinkingBudget(composer.reasoningEffort),
      attachments,
    }), conversationRuntime)
  }, [composer, conversationRuntime, currentThread, ensureActiveThread, itinerary, notifier, online, setError, setNotice, todoCategories, todos])

  const decideProposal = useCallback(async (proposal: AssistantProposal, approved: boolean) => {
    if (!online || threadId !== proposal.threadId || isDeleting(proposal.threadId)) return
    await notifier(proposal.threadId).resumeProposal({ approved }, conversationRuntime)
    focusComposerRef.current?.()
  }, [conversationRuntime, isDeleting, notifier, online, threadId])

  const manualSummarize = useCallback(async () => {
    if (!threadId || !online) return
    await notifier(threadId).summarize(conversationRuntime)
  }, [conversationRuntime, notifier, online, threadId])

  return {
    itineraryId: itinerary.id,
    threadId,
    online,
    threadList: threads.threads,
    currentThread,
    threadLoading: threads.loading,
    threads: {
      selectThread: threads.selectThread,
      showThreadList: threads.showThreadList,
      createThread: threads.createThread,
      renameThread: threads.renameThread,
      deleteThread: threads.deleteThread,
    },
    selectionStatus: {
      creatingThread: threads.creatingThread,
      deletingThreadId: threads.deletingThreadId,
    },
    composer: {
      text: composer.text,
      setText: composer.setText,
      selectedModel: composer.selectedModel,
      setSelectedModel: composer.setSelectedModel,
      reasoningEffort: composer.reasoningEffort,
      setReasoningEffort: composer.setReasoningEffort,
      attachments: composer.attachments,
      addAttachments: composer.addAttachments,
      removeAttachment: composer.removeAttachment,
    },
    actions: {
      send,
      decideProposal,
      manualSummarize,
      registerFocusComposer: (focus: () => void) => { focusComposerRef.current = focus },
    },
    feedback: {
      error,
      clearError: () => setError(null),
      notice,
      clearNotice: () => setNotice(null),
    },
  }
}

export type AssistantConversationController = ReturnType<typeof useAssistantConversation>
