import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { SupabaseAssistantCheckpointer } from '../../lib/assistantCheckpointer'
import {
  applyStoredAssistantProposal,
  createAssistantThread,
  deleteAssistantThread,
  listAssistantMessages,
  listAssistantProposals,
  listAssistantThreads,
  renameAssistantThread,
  saveAssistantMessage,
  saveAssistantProposal,
  updateAssistantThreadSummary,
  type AssistantThread,
  type StoredAssistantProposal,
} from '../../lib/repositories/assistantRepository'
import { supabase } from '../../lib/supabase'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import type { Itinerary } from '../../types/database'
import { browserAssistantModel } from './assistantApi'
import { findIncompleteUserMessage } from './assistantConversationRecovery'
import { AssistantGraphVersionError, createAssistantGraph } from './assistantGraph'
import { enrichAppliedProposalPlaces } from './assistantPlaceEnrichment'
import { applyAssistantOperations, changedDays } from './assistantProposal'
import type {
  AssistantMessage,
  AssistantProgressPhase,
  AssistantTurnRequest,
  ItineraryChangeProposal,
} from './types'

const progressLabels: Record<AssistantProgressPhase, string> = {
  checking_context: '正在確認是否需要整理前文…',
  summarizing_context: '正在整理先前對話…',
  generating_response: '正在根據行程與對話產生回覆…',
  validating_response: '正在驗證回覆與時間安排…',
  saving_proposal: '正在儲存待確認的行程提案…',
  applying_proposal: '正在套用行程修改…',
  saving_checkpoint: '正在儲存對話進度…',
  saving_response: '正在儲存助理回覆…',
  syncing_conversation: '正在更新對話畫面…',
}

const hiddenProgressPhases = new Set<AssistantProgressPhase>([
  'checking_context',
  'saving_proposal',
  'saving_checkpoint',
  'saving_response',
  'syncing_conversation',
])

const visibleProgressLabel = (phase: AssistantProgressPhase) =>
  hiddenProgressPhases.has(phase) ? null : progressLabels[phase]

const waitForUiSync = async (promise: Promise<unknown>, timeoutMs = 8_000) => {
  let timeoutId: number | undefined
  const timeout = new Promise<void>((resolve) => {
    timeoutId = window.setTimeout(resolve, timeoutMs)
  })
  await Promise.race([promise, timeout])
  if (timeoutId !== undefined) window.clearTimeout(timeoutId)
}

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
  proposals: StoredAssistantProposal[]
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
}

export function useAssistantConversation(
  itinerary: Itinerary,
  onItineraryApplied: () => void | Promise<void>,
): AssistantConversationController {
  const [threads, setThreads] = useState<AssistantThread[]>([])
  const [threadId, setThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [proposals, setProposals] = useState<StoredAssistantProposal[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [conversationLoading, setConversationLoading] = useState(false)
  const [creatingThread, setCreatingThread] = useState(false)
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [rejectingProposalId, setRejectingProposalId] = useState<string | null>(null)
  const [progressLabel, setProgressLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [retryRequest, setRetryRequest] = useState<RetryRequest | null>(null)
  const activeThreadRef = useRef<string | null>(null)
  const threadsRef = useRef<AssistantThread[]>([])
  const itineraryRef = useRef(itinerary)
  itineraryRef.current = itinerary
  // Close the small window where two events can start before React rerenders.
  const sendingRef = useRef(false)
  const creatingThreadRef = useRef(false)
  const conversationLoadRef = useRef(0)
  const online = useOnlineStatus()
  const threadStorageKey = `assistant-active-thread:${itinerary.id}`

  const currentThread = threads.find((thread) => thread.id === threadId) ?? null
  const hasPendingProposal = proposals.some((proposal) => proposal.status === 'pending')
  const onProgress = useCallback((phase: AssistantProgressPhase) => {
    setProgressLabel(visibleProgressLabel(phase))
  }, [])

  const selectThread = useCallback((nextThreadId: string) => {
    if (activeThreadRef.current !== nextThreadId) {
      conversationLoadRef.current += 1
      setMessages([])
      setProposals([])
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
    setProposals([])
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
      setProposals([])
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

  const refreshConversation = useCallback(async (id: string) => {
    if (activeThreadRef.current !== id) return
    const loadId = ++conversationLoadRef.current
    setConversationLoading(true)
    try {
      const [nextMessages, nextProposals] = await Promise.all([
        listAssistantMessages(id),
        listAssistantProposals(id),
      ])
      if (activeThreadRef.current !== id || loadId !== conversationLoadRef.current) return
      setMessages(nextMessages)
      setProposals(nextProposals)

      const incompleteMessage = findIncompleteUserMessage(nextMessages)
      const thread = threadsRef.current.find((item) => item.id === id)
      if (!incompleteMessage || !thread) {
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
      if (activeThreadRef.current === id && loadId === conversationLoadRef.current) {
        setConversationLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    activeThreadRef.current = threadId
    conversationLoadRef.current += 1
    setError(null)
    setMessages([])
    setProposals([])
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

  const proposalPersistence = useMemo(() => ({
    savePending: async (proposal: ItineraryChangeProposal) => {
      const before = itinerary.days ?? []
      const allAfter = applyAssistantOperations(itinerary, proposal.operations)
      const after = changedDays(before, allAfter)
      const affectedIds = new Set(after.map((day) => day.id))
      await saveAssistantProposal(proposal, before.filter((day) => affectedIds.has(day.id)), after)
    },
  }), [itinerary])

  const checkpointer = useMemo(() => new SupabaseAssistantCheckpointer(supabase), [])
  const runner = useMemo(() => createAssistantGraph(checkpointer, {
    model: browserAssistantModel,
    proposals: proposalPersistence,
  }), [checkpointer, proposalPersistence])

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
    let state: Awaited<ReturnType<typeof runner.sendTurn>>
    try {
      state = await runner.sendTurn(input, onProgress)
    } catch (graphError) {
      if (!isRecoverableGraphStateError(graphError)) throw graphError
      await checkpointer.deleteThread(thread.id)
      state = await runner.sendTurn(input, onProgress)
    }
    setProgressLabel(null)
    if (state.assistantMessage) {
      const assistantMessage = state.assistantMessage
      if (activeThreadRef.current === thread.id) {
        setMessages((current) => current.some((message) =>
          message.turnId === assistantMessage.turnId && message.role === 'assistant')
          ? current
          : [...current, assistantMessage])
      }
      await saveAssistantMessage(thread.id, assistantMessage)
    }
    if (state.summary !== thread.summary) {
      await updateAssistantThreadSummary(thread.id, state.summary)
    }
    setProgressLabel(null)
    await waitForUiSync(Promise.all([
      refreshConversation(thread.id),
      refreshThreads(thread.id),
    ]))
  }, [checkpointer, messages, onProgress, refreshConversation, refreshThreads, runner])

  const send = useCallback(async (event: FormEvent) => {
    event.preventDefault()
    const content = text.trim()
    if (!content || sending || sendingRef.current || hasPendingProposal || !online) return
    setProgressLabel(null)
    sendingRef.current = true
    setSending(true)
    setError(null)
    setNotice(null)
    let attempt: RetryRequest | null = null
    try {
      const thread = currentThread ?? await createThreadRecord()
      const turnId = crypto.randomUUID()
      const userMessage: AssistantMessage = {
        id: crypto.randomUUID(), turnId, role: 'user', content, createdAt: new Date().toISOString(),
      }
      setText('')
      setMessages((current) => [...current, userMessage])
      await saveAssistantMessage(thread.id, userMessage)
      const request: AssistantTurnRequest = {
        threadId: thread.id,
        turnId,
        text: content,
        itinerary,
        dayRevisions: Object.fromEntries((itinerary.days ?? []).map((day) => [day.id, day.revision])),
        createdAt: userMessage.createdAt,
      }
      attempt = { thread, request }
      if (thread.title === '新對話') await renameAssistantThread(thread.id, content.slice(0, 36))
      await checkpointer.discardLegacyHistory(thread.id)
      await runAssistantTurn(thread, request)
      setRetryRequest(null)
    } catch (sendError) {
      setError(friendlyError(sendError, '助理暫時無法回覆'))
      if (attempt) setRetryRequest(attempt)
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }, [checkpointer, createThreadRecord, currentThread, hasPendingProposal, itinerary, online, runAssistantTurn, sending, text])

  const retryLastTurn = useCallback(async () => {
    if (!retryRequest || sending || sendingRef.current || !online) return
    setProgressLabel(null)
    sendingRef.current = true
    setSending(true)
    setError(null)
    try {
      await runAssistantTurn(retryRequest.thread, retryRequest.request)
      setRetryRequest(null)
    } catch (retryError) {
      setError(friendlyError(retryError, '助理暫時無法回覆'))
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }, [online, retryRequest, runAssistantTurn, sending])

  const decideProposal = useCallback(async (proposal: StoredAssistantProposal, approved: boolean) => {
    if (!online) return
    if (!approved) {
      setError(null)
      setRejectingProposalId(proposal.id)
      setProposals((current) => current.map((item) => item.id === proposal.id
        ? { ...item, status: 'rejected' as const }
        : item))
      try {
        await applyStoredAssistantProposal(proposal.id, false)
        void checkpointer.deleteThread(proposal.threadId).catch(() => {})
        await refreshConversation(proposal.threadId)
      } catch (rejectionError) {
        setProposals((current) => current.map((item) => item.id === proposal.id
          ? { ...item, status: 'pending' as const }
          : item))
        setError(friendlyError(rejectionError, '無法拒絕行程提案'))
      } finally {
        setRejectingProposalId(null)
      }
      return
    }

    setProgressLabel(progressLabels.applying_proposal)
    setSending(true)
    setError(null)
    setProposals((current) => current.map((item) => item.id === proposal.id
      ? { ...item, status: 'approved' as const }
      : item))
    try {
      const status = await applyStoredAssistantProposal(proposal.id, true)
      if (status !== 'applied' && status !== 'expired') {
        throw new Error('這個行程提案已經未套用，請重新產生提案。')
      }
      void checkpointer.deleteThread(proposal.threadId).catch(() => {})
      setProposals((current) => current.map((item) => item.id === proposal.id
        ? { ...item, status }
        : item))
      if (status === 'applied') {
        setProgressLabel('正在補齊 Google 地點資料…')
        const enrichment = await enrichAppliedProposalPlaces(proposal)
        if (enrichment.failed > 0) {
          setNotice(`行程已套用；${enrichment.failed} 個景點暫時無法取得 Google 地點資料，可稍後手動補上。`)
        }
        await onItineraryApplied()
      }
      await refreshConversation(proposal.threadId)
      setProposals((current) => current.map((item) => item.id === proposal.id
        ? { ...item, status }
        : item))
    } catch (decisionError) {
      setError(friendlyError(decisionError, '無法處理行程提案'))
      await refreshConversation(proposal.threadId).catch(() => {})
    } finally {
      setSending(false)
    }
  }, [checkpointer, onItineraryApplied, online, refreshConversation])

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
    proposals,
    text,
    loading,
    conversationLoading,
    creatingThread,
    deletingThreadId,
    sending,
    online,
    rejectingProposalId,
    progressLabel,
    error,
    notice,
    hasPendingProposal,
    canRetry: retryRequest?.thread.id === threadId,
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
  }
}
