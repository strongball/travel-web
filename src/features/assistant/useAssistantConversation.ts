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
  AssistantGraphVersionError,
  createAssistantGraph,
  findIncompleteUserMessage,
} from './graph'
import {
  enrichAppliedProposalPlaces,
} from './tools'
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_REASONING_EFFORT,
  getThinkingBudget,
  type ReasoningEffort,
} from './models'
import type {
  AssistantAttachment,
  AssistantMessage,
  AssistantPendingToolCall,
  AssistantProgressPhase,
  AssistantProposal,
  AssistantStreamEvent,
  AssistantTurnRequest,
} from './types'

const progressLabels: Record<AssistantProgressPhase, string> = {
  checking_context: '正在確認是否需要整理前文…',
  summarizing_context: '正在整理先前對話…',
  generating_response: '正在根據行程與對話產生回覆…',
  validating_response: '正在驗證回覆與時間安排…',
  applying_proposal: '正在套用行程修改…',
  saving_checkpoint: '正在儲存對話進度…',
  saving_response: '正在儲存助理回覆…',
  syncing_conversation: '正在更新對話畫面…',
}

const hiddenProgressPhases = new Set<AssistantProgressPhase>([
  'checking_context',
  'saving_checkpoint',
  'saving_response',
  'syncing_conversation',
])

const visibleProgressLabel = (phase: AssistantProgressPhase) =>
  hiddenProgressPhases.has(phase) ? null : progressLabels[phase]

const friendlyError = (value: unknown, fallback: string) => {
  const errorRecord = value && typeof value === 'object'
    ? value as { code?: unknown; message?: unknown }
    : null
  if (errorRecord?.code === '40001') return '行程已被其他分頁或裝置修改，請重新載入後再產生提案。'
  if (errorRecord?.code === 'P0002') return '這個行程提案已不存在，請重新產生提案。'
  if (errorRecord?.code === '22023') return '行程提案包含不合法的景點資料，請重新描述要調整的景點。'
  const raw = value instanceof Error
    ? value.message
    : typeof value === 'string'
      ? value
      : typeof errorRecord?.message === 'string'
        ? errorRecord.message
        : fallback
  try {
    const parsed = JSON.parse(raw) as { error?: { code?: number; message?: string } }
    if (parsed.error?.code === 429) return 'AI 服務額度已用完，請補充 Gemini API 額度後再重試。這則訊息已保留，不會重複送出。'
    if (parsed.error?.message) return parsed.error.message
  } catch {
    // The error is already plain text.
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('prepayment credits')) {
    return 'AI 服務額度已用完，請補充 Gemini API 額度後再重試。這則訊息已保留，不會重複送出。'
  }
  return raw || fallback
}

const isRecoverableGraphStateError = (value: unknown) =>
  value instanceof AssistantGraphVersionError ||
  (value instanceof Error && value.message.includes('Assistant turn request is missing'))

const rememberedThread = (key: string) => {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

const rememberThread = (key: string, threadId: string | null) => {
  try {
    if (threadId) sessionStorage.setItem(key, threadId)
    else sessionStorage.removeItem(key)
  } catch {
    // Session persistence is only a convenience; private browsing may deny it.
  }
}

type RetryRequest = { thread: AssistantThread; request: AssistantTurnRequest }

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
  const [selectedModel, setSelectedModelState] = useState<string>(() => {
    try {
      return localStorage.getItem('preferred_gemini_model') || DEFAULT_GEMINI_MODEL
    } catch {
      return DEFAULT_GEMINI_MODEL
    }
  })

  const setSelectedModel = useCallback((modelId: string) => {
    setSelectedModelState(modelId)
    try {
      localStorage.setItem('preferred_gemini_model', modelId)
    } catch {
      // ignore storage failure
    }
  }, [])

  const [reasoningEffort, setReasoningEffortState] = useState<ReasoningEffort>(() => {
    try {
      return (
        (localStorage.getItem('preferred_gemini_reasoning_effort') as ReasoningEffort) ||
        DEFAULT_REASONING_EFFORT
      )
    } catch {
      return DEFAULT_REASONING_EFFORT
    }
  })

  const setReasoningEffort = useCallback((effort: ReasoningEffort) => {
    setReasoningEffortState(effort)
    try {
      localStorage.setItem('preferred_gemini_reasoning_effort', effort)
    } catch {
      // ignore storage failure
    }
  }, [])

  const [attachments, setAttachments] = useState<AssistantAttachment[]>([])

  const addAttachments = useCallback(async (files: File[]) => {
    const newAttachments: AssistantAttachment[] = []
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        setError(`檔案「${file.name}」超過 10MB 大小限制`)
        continue
      }
      const id = crypto.randomUUID()
      if (file.type.startsWith('image/')) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        newAttachments.push({
          id,
          name: file.name,
          mimeType: file.type || 'image/jpeg',
          size: file.size,
          dataUrl,
        })
      } else if (
        file.type.startsWith('text/') ||
        file.name.endsWith('.txt') ||
        file.name.endsWith('.md') ||
        file.name.endsWith('.csv') ||
        file.name.endsWith('.json')
      ) {
        const textContent = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsText(file)
        })
        newAttachments.push({
          id,
          name: file.name,
          mimeType: file.type || 'text/plain',
          size: file.size,
          textContent,
        })
      } else {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        newAttachments.push({
          id,
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          dataUrl,
        })
      }
    }
    if (newAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...newAttachments])
    }
  }, [])

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const clearAttachments = useCallback(() => {
    setAttachments([])
  }, [])

  const activeThreadRef = useRef<string | null>(null)
  const threadsRef = useRef<AssistantThread[]>([])
  const itineraryRef = useRef(itinerary)
  itineraryRef.current = itinerary
  const todosRef = useRef(todos)
  todosRef.current = todos
  const todoCategoriesRef = useRef(todoCategories)
  todoCategoriesRef.current = todoCategories
  // Close the small window where two events can start before React rerenders.
  const sendingRef = useRef(false)
  const creatingThreadRef = useRef(false)
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
  const onProgress = useCallback((phase: AssistantProgressPhase) => {
    setProgressLabel(visibleProgressLabel(phase))
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

  const selectThread = useCallback((nextThreadId: string) => {
    if (activeThreadRef.current !== nextThreadId) {
      conversationLoadRef.current += 1
      setMessages([])
      setStreamingMessage(null)
      setPendingToolCall(null)
      setRetryRequest(null)
      setConversationLoading(true)
    }
    activeThreadRef.current = nextThreadId
    setThreadId(nextThreadId)
    rememberThread(threadStorageKey, nextThreadId)
  }, [threadStorageKey])

  const showThreadList = useCallback(() => {
    conversationLoadRef.current += 1
    activeThreadRef.current = null
    setThreadId(null)
    setMessages([])
    setStreamingMessage(null)
    setPendingToolCall(null)
    setRetryRequest(null)
    setConversationLoading(false)
    rememberThread(threadStorageKey, null)
  }, [threadStorageKey])

  const refreshThreads = useCallback(async (preferredId?: string, selectFallback = true) => {
    const next = await listAssistantThreads(itinerary.id)
    const current = activeThreadRef.current
    const remembered = rememberedThread(threadStorageKey)
    const nextThreadId = selectFallback
      ? preferredId ??
        (current && next.some((item) => item.id === current) ? current : null) ??
        (remembered && next.some((item) => item.id === remembered) ? remembered : null) ??
        next[0]?.id ?? null
      : null
    threadsRef.current = next
    setThreads(next)
    if (nextThreadId !== current) {
      conversationLoadRef.current += 1
      setMessages([])
      setStreamingMessage(null)
      setPendingToolCall(null)
      setRetryRequest(null)
      setConversationLoading(nextThreadId !== null)
    }
    activeThreadRef.current = nextThreadId
    rememberThread(threadStorageKey, nextThreadId)
    setThreadId(nextThreadId)
    return next
  }, [itinerary.id, threadStorageKey])

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
      setMessages(nextMessages)
      setStreamingMessage(null)
      setPendingToolCall(graphState?.pendingToolCall ?? null)

      const incompleteMessage = findIncompleteUserMessage(nextMessages)
      const thread = threadsRef.current.find((item) => item.id === id)
      if (!incompleteMessage || !thread || graphState?.pendingToolCall) {
        setRetryRequest(null)
        return
      }

      const currentItinerary = itineraryRef.current
      setRetryRequest({
        thread,
        request: {
          threadId: id,
          turnId: incompleteMessage.turnId,
          text: incompleteMessage.content,
          itinerary: currentItinerary,
          todos: todosRef.current,
          todoCategories: todoCategoriesRef.current,
          dayRevisions: Object.fromEntries(
            (currentItinerary.days ?? []).map((day) => [day.id, day.revision]),
          ),
          createdAt: incompleteMessage.createdAt,
        },
      })
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
    activeThreadRef.current = threadId
    conversationLoadRef.current += 1
    setError(null)
    setMessages([])
    setStreamingMessage(null)
    setPendingToolCall(null)
    setRetryRequest(null)
    if (!threadId) {
      setConversationLoading(false)
      return
    }
    setConversationLoading(true)
    void refreshConversation(threadId).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : '無法載入對話內容')
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
      const activeId = activeThreadRef.current
      await refreshThreads(activeId ?? undefined, activeId !== null)
    } catch (value) {
      setError(friendlyError(value, '無法重新命名對話'))
    }
  }, [refreshThreads])

  const deleteThread = useCallback(async (id: string) => {
    if (deletingThreadId) return
    setDeletingThreadId(id)
    setError(null)
    try {
      await deleteAssistantThread(id)
      await refreshThreads(undefined, false)
    } catch (value) {
      setError(friendlyError(value, '無法刪除對話'))
    } finally {
      setDeletingThreadId(null)
    }
  }, [deletingThreadId, refreshThreads])

  const runAssistantTurn = useCallback(async (
    thread: AssistantThread,
    request: AssistantTurnRequest,
  ) => {
    const input = {
      ...request,
      rehydratedSummary: thread.summary,
      rehydratedMessages: messages,
    }
    setStreamingMessage(null)
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
      setProgressLabel(null)
      if (activeThreadRef.current === thread.id) {
        setPendingToolCall(state.pendingToolCall)
      }
      if (state.pendingToolCall) {
        setStreamingMessage(null)
        return
      }
      if (state.assistantMessage) {
        const assistantMessage = state.assistantMessage
        setStreamingMessage(null)
        if (activeThreadRef.current === thread.id) {
          setMessages((current) => current.some((message) =>
            message.turnId === assistantMessage.turnId && message.role === 'assistant')
            ? current
            : [...current, assistantMessage])
        }
        await saveAssistantMessage(thread.id, assistantMessage)
      }
      if (state.summary !== thread.summary) {
        const nextSummary = state.summary
        thread.summary = nextSummary
        setThreads((current) => current.map((item) =>
          item.id === thread.id ? { ...item, summary: nextSummary } : item
        ))
        void updateAssistantThreadSummary(thread.id, nextSummary)
      }
      setProgressLabel(null)
    } catch (error) {
      setStreamingMessage(null)
      throw error
    }
  }, [appendStreamingText, checkpointer, messages, onProgress, runner])

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
    const currentAttachments = [...attachments]
    try {
      const thread = currentThread ?? await createThreadRecord()
      const turnId = crypto.randomUUID()
      const userMessage: AssistantMessage = {
        id: crypto.randomUUID(),
        turnId,
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
        attachments: currentAttachments.length > 0 ? currentAttachments : null,
      }
      setText('')
      setAttachments([])
      setMessages((current) => [...current, userMessage])
      await saveAssistantMessage(thread.id, userMessage)
      const request: AssistantTurnRequest = {
        threadId: thread.id,
        turnId,
        text: content,
        itinerary,
        todos,
        todoCategories,
        dayRevisions: Object.fromEntries((itinerary.days ?? []).map((day) => [day.id, day.revision])),
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
        setThreads((current) => current.map((item) =>
          item.id === thread.id ? { ...item, title: nextTitle } : item
        ))
        void renameAssistantThread(thread.id, nextTitle)
      }
      await runAssistantTurn(thread, request)
      setRetryRequest(null)
    } catch (sendError) {
      setStreamingMessage(null)
      setError(friendlyError(sendError, '助理暫時無法回覆'))
      if (attempt) setRetryRequest(attempt)
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }, [attachments, createThreadRecord, currentThread, hasPendingProposal, itinerary, online, reasoningEffort, runAssistantTurn, selectedModel, sending, text, todoCategories, todos])

  const retryLastTurn = useCallback(async () => {
    if (!retryRequest || sending || sendingRef.current || !online) return
    setProgressLabel(null)
    setStreamingMessage(null)
    sendingRef.current = true
    setSending(true)
    setError(null)
    try {
      await runAssistantTurn(retryRequest.thread, {
        ...retryRequest.request,
        selectedModel,
        reasoningEffort,
        thinkingBudget: getThinkingBudget(reasoningEffort),
      })
      setRetryRequest(null)
    } catch (retryError) {
      setStreamingMessage(null)
      setError(friendlyError(retryError, '助理暫時無法回覆'))
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }, [online, reasoningEffort, retryRequest, runAssistantTurn, selectedModel, sending])

  const decideProposal = useCallback(async (proposal: StoredAssistantProposal, approved: boolean) => {
    if (!online) return
    setError(null)

    setSending(true)
    setStreamingMessage(null)
    if (approved) setProgressLabel(progressLabels.applying_proposal)

    const nextStatus = approved ? 'approved' as const : 'rejected' as const
    setPendingToolCall((current) => current?.proposal.id === proposal.id
      ? { ...current, proposal: { ...current.proposal, status: nextStatus } }
      : current)

    try {
      const state = await runner.resumeTurn(
        proposal.threadId,
        { approved },
        onProgress,
        (event) => appendStreamingText(proposal.threadId, event),
      )
      setPendingToolCall(state.pendingToolCall)
      if (state.pendingToolCall) {
        setStreamingMessage(null)
        return
      }
      if (state.assistantMessage) {
        const assistantMessage = state.assistantMessage
        setStreamingMessage(null)
        if (activeThreadRef.current === proposal.threadId) {
          setMessages((current) => {
            const existing = current.findIndex((message) =>
              message.turnId === assistantMessage.turnId && message.role === 'assistant')
            return existing < 0
              ? [...current, assistantMessage]
              : current.map((message, index) => index === existing ? assistantMessage : message)
          })
        }
        await saveAssistantMessage(proposal.threadId, assistantMessage)
      }
      if (state.summary !== undefined) {
        await updateAssistantThreadSummary(proposal.threadId, state.summary)
      }
      await refreshConversation(proposal.threadId, false)
      await refreshThreads(proposal.threadId)
      focusComposer()
    } catch (decisionError) {
      setStreamingMessage(null)
      setError(friendlyError(decisionError, approved ? '無法套用行程提案' : '無法拒絕行程提案'))
      await refreshConversation(proposal.threadId, false).catch(() => {})
    } finally {
      setSending(false)
      setProgressLabel(null)
    }
  }, [appendStreamingText, focusComposer, onProgress, online, refreshConversation, refreshThreads, runner])

  const manualSummarize = useCallback(async () => {
    if (!threadId || messages.length === 0 || sending || sendingRef.current || !online) return
    sendingRef.current = true
    setProgressLabel('正在壓縮較早的對話內容…')
    setSending(true)
    setError(null)
    try {
      const state = await runner.summarizeThread(threadId)
      await updateAssistantThreadSummary(threadId, state.summary)
      await refreshThreads(threadId)
    } catch (summaryError) {
      setError(friendlyError(summaryError, '無法壓縮對話'))
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }, [messages.length, online, refreshThreads, runner, sending, threadId])

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
