import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { SupabaseAssistantCheckpointer } from '../../lib/assistantCheckpointer'
import {
  applyAssistantOperations,
  createAssistantThread,
  deleteAssistantThread,
  listAssistantMessages,
  listAssistantThreads,
  renameAssistantThread,
  saveAssistantMessage,
  updateAssistantThreadSummary,
  type AssistantThread,
  type StoredAssistantProposal,
} from '../../lib/repositories/assistantRepository'
import { supabase } from '../../lib/supabase'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import type { Itinerary, TodoItem } from '../../types/database'
import {
  createAssistantGraph,
  findIncompleteUserMessage,
} from './graph'
import {
  enrichAppliedProposalPlaces,
} from './tools'
import {
  getThinkingBudget,
  type ReasoningEffort,
} from './models'
import { useAssistantComposerState } from './hooks/useAssistantComposerState'
import {
  dayRevisions,
  friendlyError,
  isRecoverableGraphStateError,
  progressLabels,
  rememberedThread,
  rememberThread,
  visibleProgressLabel,
} from './assistantConversationUtils'
import type {
  AssistantAttachment,
  AssistantMessage,
  AssistantPendingToolCall,
  AssistantProgressPhase,
  AssistantProposal,
  AssistantStreamEvent,
  AssistantTurnRequest,
} from './types'

type RetryRequest = { thread: AssistantThread; request: AssistantTurnRequest }
type ThreadSelection = 'fallback' | 'none' | 'preserve'

export type AssistantConversationController = {
  threads: AssistantThread[]
  threadId: string | null
  currentThread: AssistantThread | null
  messages: AssistantMessage[]
  streamingMessage: AssistantMessage | null
  pendingToolCall: AssistantPendingToolCall | null
  text: string
  loading: boolean
  conversationLoading: boolean
  creatingThread: boolean
  deletingThreadId: string | null
  sending: boolean
  online: boolean
  rejectingProposalId: string | null
  progressLabel: string | null
  error: string | null
  notice: string | null
  hasPendingProposal: boolean
  canRetry: boolean
  selectedModel: string
  setSelectedModel: (modelId: string) => void
  reasoningEffort: ReasoningEffort
  setReasoningEffort: (effort: ReasoningEffort) => void
  attachments: AssistantAttachment[]
  addAttachments: (files: File[]) => Promise<void>
  removeAttachment: (id: string) => void
  clearAttachments: () => void
  setText: (text: string) => void
  clearError: () => void
  clearNotice: () => void
  selectThread: (threadId: string) => void
  showThreadList: () => void
  createThread: () => Promise<void>
  renameThread: (threadId: string, title: string) => Promise<void>
  deleteThread: (threadId: string) => Promise<void>
  send: (event: FormEvent) => Promise<void>
  retryLastTurn: () => Promise<void>
  decideProposal: (proposal: StoredAssistantProposal, approved: boolean) => Promise<void>
  manualSummarize: () => Promise<void>
  registerFocusComposer: (fn: () => void) => void
  focusComposer: () => void
}

export function useAssistantConversation(
  itinerary: Itinerary,
  onItineraryApplied: () => void | Promise<void>,
  todos: TodoItem[] = [],
  todoCategories: string[] = [],
): AssistantConversationController {
  const [threads, setThreads] = useState<AssistantThread[]>([])
  const [threadId, setThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [streamingMessage, setStreamingMessage] = useState<AssistantMessage | null>(null)
  const [pendingToolCall, setPendingToolCall] = useState<AssistantPendingToolCall | null>(null)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [conversationLoading, setConversationLoading] = useState(false)
  const [creatingThread, setCreatingThread] = useState(false)
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [progressLabel, setProgressLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [retryRequest, setRetryRequest] = useState<RetryRequest | null>(null)
  const {
    selectedModel,
    setSelectedModel,
    reasoningEffort,
    setReasoningEffort,
    attachments,
    addAttachments,
    removeAttachment,
    clearAttachments,
  } = useAssistantComposerState(setError)

  const activeThreadRef = useRef<string | null>(null)
  const threadsRef = useRef<AssistantThread[]>([])
  const contextRef = useRef({ itinerary, todos, todoCategories })
  contextRef.current = { itinerary, todos, todoCategories }
  // Close the small window where two events can start before React rerenders.
  const sendingRef = useRef(false)
  const creatingThreadRef = useRef(false)
  const deletingThreadRef = useRef<string | null>(null)
  const threadsLoadRef = useRef(0)
  const conversationLoadRef = useRef(0)
  const online = useOnlineStatus()
  const focusComposerRef = useRef<(() => void) | null>(null)
  const threadStorageKey = `assistant-active-thread:${itinerary.id}`

  const registerFocusComposer = useCallback((fn: () => void) => {
    focusComposerRef.current = fn
  }, [])
  const focusComposer = useCallback(() => {
    focusComposerRef.current?.()
  }, [])

  const currentThread = threads.find((thread) => thread.id === threadId) ?? null
  const hasPendingProposal = pendingToolCall !== null
  const showProgress = useCallback((id: string, phase: AssistantProgressPhase) => {
    if (activeThreadRef.current === id) {
      setProgressLabel(visibleProgressLabel(phase))
    }
  }, [])

  const appendStreamingText = useCallback((threadId: string, event: AssistantStreamEvent) => {
    if (activeThreadRef.current !== threadId || !event.text) return
    setStreamingMessage((current) => {
      if (current?.turnId === event.turnId) {
        return { ...current, content: current.content + event.text }
      }
      return {
        id: `streaming-${event.turnId}`,
        turnId: event.turnId,
        role: 'assistant',
        content: event.text,
        createdAt: new Date().toISOString(),
      }
    })
  }, [])

  const resetConversationView = useCallback((nextThreadId: string | null) => {
    conversationLoadRef.current += 1
    setMessages([])
    setStreamingMessage(null)
    setPendingToolCall(null)
    setRetryRequest(null)
    setProgressLabel(null)
    setConversationLoading(nextThreadId !== null)
  }, [])

  const activateThread = useCallback((nextThreadId: string | null, forceReset = false) => {
    if (forceReset || activeThreadRef.current !== nextThreadId) {
      resetConversationView(nextThreadId)
    }
    activeThreadRef.current = nextThreadId
    setThreadId(nextThreadId)
    rememberThread(threadStorageKey, nextThreadId)
  }, [resetConversationView, threadStorageKey])

  const selectThread = useCallback((nextThreadId: string) => {
    activateThread(nextThreadId)
  }, [activateThread])

  const showThreadList = useCallback(() => {
    activateThread(null, true)
  }, [activateThread])

  const refreshThreads = useCallback(async (
    preferredId?: string,
    selection: ThreadSelection = 'fallback',
  ) => {
    const loadId = ++threadsLoadRef.current
    let next: AssistantThread[]
    try {
      next = await listAssistantThreads(itinerary.id)
    } catch (loadError) {
      if (loadId !== threadsLoadRef.current) return threadsRef.current
      throw loadError
    }
    if (loadId !== threadsLoadRef.current) return next
    const current = activeThreadRef.current
    const remembered = rememberedThread(threadStorageKey)
    let nextThreadId: string | null = null
    if (selection === 'preserve') {
      nextThreadId = current && next.some((item) => item.id === current) ? current : null
    } else if (selection === 'fallback') {
      nextThreadId = preferredId ??
        (current && next.some((item) => item.id === current) ? current : null) ??
        (remembered && next.some((item) => item.id === remembered) ? remembered : null) ??
        next[0]?.id ?? null
    }
    threadsRef.current = next
    setThreads(next)
    activateThread(nextThreadId)
    return next
  }, [activateThread, itinerary.id, threadStorageKey])

  useEffect(() => {
    let active = true
    setLoading(true)
    void refreshThreads().catch((loadError) => {
      if (active) setError(loadError instanceof Error ? loadError.message : '無法載入助理對話')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [refreshThreads])

  const proposalExecution = useMemo(() => ({
    apply: async (proposal: AssistantProposal) => {
      const status = await applyAssistantOperations(proposal.threadId, proposal)
      if (status === 'applied') {
        if (proposal.afterDays.length > 0) {
          const enrichment = await enrichAppliedProposalPlaces(proposal)
          if (enrichment.failed > 0) {
            setNotice(`行程已套用；${enrichment.failed} 個景點暫時無法取得 Google 地點資料，可稍後手動補上。`)
          }
        }
        await onItineraryApplied()
      }
      return status
    },
  }), [onItineraryApplied])

  const checkpointer = useMemo(() => new SupabaseAssistantCheckpointer(supabase), [])
  const runner = useMemo(() => createAssistantGraph(checkpointer, {
    proposals: proposalExecution,
  }), [checkpointer, proposalExecution])

  const refreshConversation = useCallback(async (id: string, showLoading = true) => {
    if (activeThreadRef.current !== id) return
    const loadId = ++conversationLoadRef.current
    if (showLoading) setConversationLoading(true)
    try {
      const [nextMessages, graphState] = await Promise.all([
        listAssistantMessages(id),
        runner.getState(id),
      ])
      if (activeThreadRef.current !== id || loadId !== conversationLoadRef.current) return
      const canonicalAssistantTurnIds = new Set(nextMessages
        .filter((message) => message.role === 'assistant')
        .map((message) => message.turnId))
      const recoveredAssistantMessages = (graphState?.messages ?? []).filter((message) =>
        message.role === 'assistant' && !canonicalAssistantTurnIds.has(message.turnId))
      const visibleMessages = [...nextMessages, ...recoveredAssistantMessages]
        .sort((first, second) => first.createdAt.localeCompare(second.createdAt))
      setMessages(visibleMessages)
      setStreamingMessage(null)
      setPendingToolCall(graphState?.pendingToolCall ?? null)

      const completedTurnIds = (graphState?.messages ?? [])
        .filter((message) => message.role === 'assistant')
        .map((message) => message.turnId)
      const incompleteMessage = findIncompleteUserMessage(nextMessages, completedTurnIds)
      const thread = threadsRef.current.find((item) => item.id === id)
      if (!incompleteMessage || !thread || graphState?.pendingToolCall) {
        setRetryRequest(null)
      } else {
        const currentContext = contextRef.current
        setRetryRequest({
          thread,
          request: {
            threadId: id,
            turnId: incompleteMessage.turnId,
            text: incompleteMessage.content,
            itinerary: currentContext.itinerary,
            todos: currentContext.todos,
            todoCategories: currentContext.todoCategories,
            dayRevisions: dayRevisions(currentContext.itinerary),
            createdAt: incompleteMessage.createdAt,
            attachments: incompleteMessage.attachments ?? null,
          },
        })
      }

      if (recoveredAssistantMessages.length > 0) {
        try {
          await Promise.all(recoveredAssistantMessages.map((message) =>
            saveAssistantMessage(id, message)))
        } catch {
          if (activeThreadRef.current === id && loadId === conversationLoadRef.current) {
            setNotice('已從對話進度恢復助理回覆，但暫時無法同步至對話紀錄。')
          }
        }
      }
    } catch (loadError) {
      if (activeThreadRef.current === id && loadId === conversationLoadRef.current) {
        throw loadError
      }
    } finally {
      if (showLoading && activeThreadRef.current === id && loadId === conversationLoadRef.current) {
        setConversationLoading(false)
      }
    }
  }, [runner])

  useEffect(() => {
    setError(null)
    if (!threadId) return
    void refreshConversation(threadId).catch((loadError) => {
      if (activeThreadRef.current === threadId) {
        setError(loadError instanceof Error ? loadError.message : '無法載入對話內容')
      }
    })
  }, [refreshConversation, threadId])

  const createThreadRecord = useCallback(async () => {
    const { data } = await supabase.auth.getUser()
    if (!data.user) throw new Error('請先登入')
    const thread = await createAssistantThread(itinerary.id, data.user.id)
    await refreshThreads(thread.id)
    return thread
  }, [itinerary.id, refreshThreads])

  const createThread = useCallback(async () => {
    if (creatingThreadRef.current) return
    creatingThreadRef.current = true
    setCreatingThread(true)
    setError(null)
    try {
      await createThreadRecord()
    } catch (value) {
      setError(friendlyError(value, '無法建立新對話'))
    } finally {
      creatingThreadRef.current = false
      setCreatingThread(false)
    }
  }, [createThreadRecord])

  const renameThread = useCallback(async (id: string, title: string) => {
    setError(null)
    try {
      await renameAssistantThread(id, title)
      await refreshThreads(undefined, 'preserve')
    } catch (value) {
      setError(friendlyError(value, '無法重新命名對話'))
    }
  }, [refreshThreads])

  const deleteThread = useCallback(async (id: string) => {
    if (deletingThreadRef.current) return
    deletingThreadRef.current = id
    setDeletingThreadId(id)
    setError(null)
    try {
      await deleteAssistantThread(id)
      await refreshThreads(undefined, 'none')
    } catch (value) {
      setError(friendlyError(value, '無法刪除對話'))
    } finally {
      deletingThreadRef.current = null
      setDeletingThreadId(null)
    }
  }, [refreshThreads])

  const saveCompletedMessage = useCallback(async (
    targetThreadId: string,
    assistantMessage: AssistantMessage,
  ) => {
    if (activeThreadRef.current === targetThreadId) {
      setStreamingMessage(null)
      setMessages((current) => {
        const existing = current.findIndex((message) =>
          message.turnId === assistantMessage.turnId && message.role === 'assistant')
        return existing < 0
          ? [...current, assistantMessage]
          : current.map((message, index) => index === existing ? assistantMessage : message)
      })
    }
    await saveAssistantMessage(targetThreadId, assistantMessage)
  }, [])

  const updateThreadSummaryCache = useCallback((targetThreadId: string, summary: string) => {
    const existing = threadsRef.current.find((thread) => thread.id === targetThreadId)
    if (existing?.summary === summary) return
    const nextThreads = threadsRef.current.map((thread) =>
      thread.id === targetThreadId ? { ...thread, summary } : thread)
    threadsRef.current = nextThreads
    setThreads(nextThreads)
  }, [])

  const runAssistantTurn = useCallback(async (
    thread: AssistantThread,
    request: AssistantTurnRequest,
  ) => {
    const input = {
      ...request,
      rehydratedSummary: thread.summary,
      rehydratedMessages: messages,
    }
    if (activeThreadRef.current === thread.id) setStreamingMessage(null)
    const onProgress = (phase: AssistantProgressPhase) => showProgress(thread.id, phase)
    const onStream = (event: AssistantStreamEvent) => appendStreamingText(thread.id, event)
    let state: Awaited<ReturnType<typeof runner.sendTurn>>
    try {
      try {
        state = await runner.sendTurn(input, onProgress, onStream)
      } catch (graphError) {
        if (!isRecoverableGraphStateError(graphError)) throw graphError
        await checkpointer.deleteThread(thread.id)
        state = await runner.sendTurn(input, onProgress, onStream)
      }
      if (activeThreadRef.current === thread.id) {
        setProgressLabel(null)
        setPendingToolCall(state.pendingToolCall)
      }
      if (state.pendingToolCall) {
        if (activeThreadRef.current === thread.id) setStreamingMessage(null)
        return
      }
      if (state.assistantMessage) {
        await saveCompletedMessage(thread.id, state.assistantMessage)
      }
      if (state.summary !== thread.summary) {
        updateThreadSummaryCache(thread.id, state.summary)
        thread.summary = state.summary
        void updateAssistantThreadSummary(thread.id, state.summary).catch(() => {
          if (activeThreadRef.current === thread.id) {
            setNotice('回覆已儲存，但對話摘要暫時無法同步。')
          }
        })
      }
    } catch (error) {
      if (activeThreadRef.current === thread.id) setStreamingMessage(null)
      throw error
    }
  }, [appendStreamingText, checkpointer, messages, runner, saveCompletedMessage, showProgress, updateThreadSummaryCache])

  const send = useCallback(async (event: FormEvent) => {
    event.preventDefault()
    const content = text.trim()
    if ((!content && attachments.length === 0) || sending || sendingRef.current || hasPendingProposal || !online) return
    setProgressLabel(null)
    setStreamingMessage(null)
    sendingRef.current = true
    setSending(true)
    setError(null)
    setNotice(null)
    let attempt: RetryRequest | null = null
    let targetThreadId = currentThread?.id ?? null
    const currentAttachments = [...attachments]
    try {
      const thread = currentThread ?? await createThreadRecord()
      targetThreadId = thread.id
      const turnId = crypto.randomUUID()
      const userMessage: AssistantMessage = {
        id: crypto.randomUUID(),
        turnId,
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
        attachments: currentAttachments.length > 0 ? currentAttachments : null,
      }
      if (activeThreadRef.current === thread.id) {
        setText('')
        clearAttachments()
        setMessages((current) => [...current, userMessage])
      }
      await saveAssistantMessage(thread.id, userMessage)
      const request: AssistantTurnRequest = {
        threadId: thread.id,
        turnId,
        text: content,
        itinerary,
        todos,
        todoCategories,
        dayRevisions: dayRevisions(itinerary),
        createdAt: userMessage.createdAt,
        selectedModel,
        reasoningEffort,
        thinkingBudget: getThinkingBudget(reasoningEffort),
        attachments: currentAttachments.length > 0 ? currentAttachments : null,
      }
      attempt = { thread, request }
      if (thread.title === '新對話') {
        const titleSource = content || currentAttachments[0]?.name || '新對話'
        const nextTitle = titleSource.slice(0, 36)
        thread.title = nextTitle
        const nextThreads = threadsRef.current.map((item) =>
          item.id === thread.id ? { ...item, title: nextTitle } : item)
        threadsRef.current = nextThreads
        setThreads(nextThreads)
        void renameAssistantThread(thread.id, nextTitle)
      }
      await runAssistantTurn(thread, request)
      if (activeThreadRef.current === thread.id) setRetryRequest(null)
    } catch (sendError) {
      if (activeThreadRef.current === targetThreadId) {
        setStreamingMessage(null)
        setError(friendlyError(sendError, '助理暫時無法回覆'))
        if (attempt) setRetryRequest(attempt)
      }
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }, [attachments, clearAttachments, createThreadRecord, currentThread, hasPendingProposal, itinerary, online, reasoningEffort, runAssistantTurn, selectedModel, sending, text, todoCategories, todos])

  const retryLastTurn = useCallback(async () => {
    if (!retryRequest || retryRequest.thread.id !== activeThreadRef.current ||
      sending || sendingRef.current || !online) return
    setProgressLabel(null)
    setStreamingMessage(null)
    sendingRef.current = true
    setSending(true)
    setError(null)
    try {
      const retry = retryRequest
      await runAssistantTurn(retry.thread, {
        ...retry.request,
        selectedModel,
        reasoningEffort,
        thinkingBudget: getThinkingBudget(reasoningEffort),
      })
      await refreshConversation(retry.thread.id, false)
      setRetryRequest((current) => current?.thread.id === retry.thread.id &&
        current.request.turnId === retry.request.turnId
        ? null
        : current)
    } catch (retryError) {
      if (activeThreadRef.current === retryRequest.thread.id) {
        setStreamingMessage(null)
        setError(friendlyError(retryError, '助理暫時無法回覆'))
      }
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }, [online, reasoningEffort, refreshConversation, retryRequest, runAssistantTurn, selectedModel, sending])

  const decideProposal = useCallback(async (proposal: StoredAssistantProposal, approved: boolean) => {
    if (!online || sendingRef.current || activeThreadRef.current !== proposal.threadId) return
    sendingRef.current = true
    setError(null)

    setSending(true)
    setStreamingMessage(null)
    if (approved) setProgressLabel(progressLabels.applying_proposal)

    const nextStatus = approved ? 'approved' as const : 'rejected' as const
    setPendingToolCall((current) => current?.proposal.id === proposal.id
      ? { ...current, proposal: { ...current.proposal, status: nextStatus } }
      : current)

    let completedTurnId: string | null = null
    try {
      const state = await runner.resumeTurn(
        proposal.threadId,
        { approved },
        (phase) => showProgress(proposal.threadId, phase),
        (event) => appendStreamingText(proposal.threadId, event),
      )
      if (activeThreadRef.current === proposal.threadId) {
        setPendingToolCall(state.pendingToolCall)
      }
      if (state.pendingToolCall) {
        if (activeThreadRef.current === proposal.threadId) setStreamingMessage(null)
        return
      }
      if (state.assistantMessage) {
        const assistantMessage = state.assistantMessage
        completedTurnId = assistantMessage.turnId
        await saveCompletedMessage(proposal.threadId, assistantMessage)
      }
      const storedSummary = threadsRef.current.find((thread) => thread.id === proposal.threadId)?.summary
      if (storedSummary !== state.summary) {
        await updateAssistantThreadSummary(proposal.threadId, state.summary)
        updateThreadSummaryCache(proposal.threadId, state.summary)
      }
      await refreshConversation(proposal.threadId, false)
      await refreshThreads(undefined, 'preserve')
      if (completedTurnId) {
        setRetryRequest((current) => current?.thread.id === proposal.threadId &&
          current.request.turnId === completedTurnId
          ? null
          : current)
      }
      if (activeThreadRef.current === proposal.threadId) focusComposer()
    } catch (decisionError) {
      if (activeThreadRef.current === proposal.threadId) {
        setStreamingMessage(null)
        setError(friendlyError(decisionError, approved ? '無法套用行程提案' : '無法拒絕行程提案'))
      }
      await refreshConversation(proposal.threadId, false).catch(() => {})
    } finally {
      sendingRef.current = false
      setSending(false)
      if (activeThreadRef.current === proposal.threadId) setProgressLabel(null)
    }
  }, [appendStreamingText, focusComposer, online, refreshConversation, refreshThreads, runner, saveCompletedMessage, showProgress, updateThreadSummaryCache])

  const manualSummarize = useCallback(async () => {
    if (!threadId || messages.length === 0 || sending || sendingRef.current || !online) return
    sendingRef.current = true
    setProgressLabel('正在壓縮較早的對話內容…')
    setSending(true)
    setError(null)
    const targetThreadId = threadId
    try {
      const state = await runner.summarizeThread(targetThreadId)
      const storedSummary = threadsRef.current.find((thread) => thread.id === targetThreadId)?.summary
      if (storedSummary !== state.summary) {
        await updateAssistantThreadSummary(targetThreadId, state.summary)
        updateThreadSummaryCache(targetThreadId, state.summary)
      }
      await refreshThreads(undefined, 'preserve')
    } catch (summaryError) {
      if (activeThreadRef.current === targetThreadId) {
        setError(friendlyError(summaryError, '無法壓縮對話'))
      }
    } finally {
      sendingRef.current = false
      setSending(false)
      if (activeThreadRef.current === targetThreadId) setProgressLabel(null)
    }
  }, [messages.length, online, refreshThreads, runner, sending, threadId, updateThreadSummaryCache])

  return {
    threads,
    threadId,
    currentThread,
    messages,
    streamingMessage,
    pendingToolCall,
    text,
    loading,
    conversationLoading,
    creatingThread,
    deletingThreadId,
    sending,
    online,
    rejectingProposalId: null,
    progressLabel,
    error,
    notice,
    hasPendingProposal,
    canRetry: retryRequest?.thread.id === threadId,
    selectedModel,
    setSelectedModel,
    reasoningEffort,
    setReasoningEffort,
    attachments,
    addAttachments,
    removeAttachment,
    clearAttachments,
    setText,
    clearError: () => setError(null),
    clearNotice: () => setNotice(null),
    selectThread,
    showThreadList,
    createThread,
    renameThread,
    deleteThread,
    send,
    retryLastTurn,
    decideProposal,
    manualSummarize,
    registerFocusComposer,
    focusComposer,
  }
}
