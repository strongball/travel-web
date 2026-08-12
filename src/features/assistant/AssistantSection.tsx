import AddCommentRoundedIcon from '@mui/icons-material/AddCommentRounded'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import ForumRoundedIcon from '@mui/icons-material/ForumRounded'
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded'
import SendRoundedIcon from '@mui/icons-material/SendRounded'
import SummarizeRoundedIcon from '@mui/icons-material/SummarizeRounded'
import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Chip,
  Divider,
  IconButton,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  List,
  ListItemButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import type { Itinerary, TripDay } from '../../types/database'
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
import { browserAssistantModel } from './assistantApi'
import { AssistantGraphVersionError, createAssistantGraph } from './assistantGraph'
import { applyAssistantOperations, changedDays } from './assistantProposal'
import type { AssistantMessage, AssistantTurnRequest, ItineraryChangeProposal } from './types'

const dateLabel = (day: TripDay) => {
  // Trip dates are date-only values. Format them in UTC so the browser's
  // local offset cannot move the displayed day backwards or forwards.
  const value = day.date.slice(0, 10)
  return new Intl.DateTimeFormat('zh-TW', {
    month: 'short', day: 'numeric', weekday: 'short', timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

const quickPrompts = [
  '推薦今天附近景點',
  '幫我檢查行程是否太趕',
  '幫我安排一天的美食行程',
]

const thinkingSteps = {
  reply: ['已收到訊息，正在讀取行程…', '正在分析你的需求…', '正在整理回覆…', '內容較多，仍在處理中…'],
  summary: ['正在整理對話內容…', '正在保留重要決定與偏好…', '正在建立新的對話摘要…'],
  proposal: ['正在處理行程提案…', '正在確認日期與景點資料…', '正在準備行程更新…'],
} as const

const friendlyError = (value: unknown, fallback: string) => {
  const errorRecord = value && typeof value === 'object' ? value as { code?: unknown; message?: unknown; details?: unknown } : null
  if (errorRecord?.code === '40001') return '行程已被其他分頁或裝置修改，請重新載入後再產生提案。'
  if (errorRecord?.code === 'P0002') return '這個行程提案已不存在，請重新產生提案。'
  if (errorRecord?.code === '22023') return '行程提案包含不合法的景點資料，請重新描述要調整的景點。'
  const raw = value instanceof Error
    ? value.message
    : typeof value === 'string'
      ? value
      : errorRecord && typeof errorRecord.message === 'string'
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

const timeLabel = (value: string) => new Intl.DateTimeFormat('zh-TW', {
  hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(value))

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

export function AssistantSection({
  itinerary,
  onItineraryApplied,
  fullPage = false,
  onAssistantToolbarChange,
}: {
  itinerary: Itinerary
  onItineraryApplied: () => void | Promise<void>
  fullPage?: boolean
  onAssistantToolbarChange?: (toolbar: ReactNode) => void
}) {
  const [threads, setThreads] = useState<AssistantThread[]>([])
  const [threadId, setThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [proposals, setProposals] = useState<StoredAssistantProposal[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [rejectingProposalId, setRejectingProposalId] = useState<string | null>(null)
  const [thinkingContext, setThinkingContext] = useState<keyof typeof thinkingSteps>('reply')
  const [thinkingStep, setThinkingStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [retryRequest, setRetryRequest] = useState<{ thread: AssistantThread; request: AssistantTurnRequest } | null>(null)
  const activeThreadRef = useRef<string | null>(null)
  const conversationLoadRef = useRef(0)
  const conversationEndRef = useRef<HTMLDivElement>(null)
  const manualSummarizeRef = useRef<() => Promise<void>>(async () => {})
  const threadStorageKey = `assistant-active-thread:${itinerary.id}`

  const currentThread = threads.find((thread) => thread.id === threadId) ?? null
  const hasPendingProposal = proposals.some((proposal) => proposal.status === 'pending')
  const thinkingLabel = thinkingSteps[thinkingContext][thinkingStep % thinkingSteps[thinkingContext].length]

  useEffect(() => {
    if (!sending) {
      setThinkingStep(0)
      return
    }
    const timer = window.setInterval(() => setThinkingStep((current) => current + 1), 1800)
    return () => window.clearInterval(timer)
  }, [sending, thinkingContext])

  const selectThread = useCallback((nextThreadId: string) => {
    activeThreadRef.current = nextThreadId
    setThreadId(nextThreadId)
    rememberThread(threadStorageKey, nextThreadId)
  }, [threadStorageKey])

  const refreshThreads = useCallback(async (preferredId?: string) => {
    const next = await listAssistantThreads(itinerary.id)
    setThreads(next)
    setThreadId((current) => {
      const remembered = rememberedThread(threadStorageKey)
      const nextThreadId = preferredId ??
        (current && next.some((item) => item.id === current) ? current : null) ??
        (remembered && next.some((item) => item.id === remembered) ? remembered : null) ??
        next[0]?.id ?? null
      activeThreadRef.current = nextThreadId
      rememberThread(threadStorageKey, nextThreadId)
      return nextThreadId
    })
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
    const loadId = ++conversationLoadRef.current
    const [nextMessages, nextProposals] = await Promise.all([
      listAssistantMessages(id),
      listAssistantProposals(id),
    ])
    // A previous thread can finish loading after the user has switched.
    // Never let that stale response overwrite the selected conversation.
    if (activeThreadRef.current !== id || loadId !== conversationLoadRef.current) return
    setMessages(nextMessages)
    setProposals(nextProposals)
  }, [])

  useEffect(() => {
    activeThreadRef.current = threadId
    setError(null)
    setMessages([])
    setProposals([])
    if (!threadId) {
      return
    }
    void refreshConversation(threadId).catch((loadError) =>
      setError(loadError instanceof Error ? loadError.message : '無法載入對話內容'))
  }, [refreshConversation, threadId])

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ block: 'end', behavior: messages.length > 1 ? 'smooth' : 'auto' })
  }, [messages, proposals, sending])

  const proposalPersistence = useMemo(() => ({
    savePending: async (proposal: ItineraryChangeProposal) => {
      const before = itinerary.days ?? []
      const allAfter = applyAssistantOperations(itinerary, proposal.operations)
      const after = changedDays(before, allAfter)
      const affectedIds = new Set(after.map((day) => day.id))
      await saveAssistantProposal(proposal, before.filter((day) => affectedIds.has(day.id)), after)
    },
    reject: async (proposalId: string) => { await applyStoredAssistantProposal(proposalId, false) },
    apply: async (proposal: ItineraryChangeProposal) => {
      const status = await applyStoredAssistantProposal(proposal.id, true)
      return status === 'rejected' ? 'expired' as const : status
    },
  }), [itinerary])

  const checkpointer = useMemo(() => new SupabaseAssistantCheckpointer(supabase), [])

  const runner = useMemo(() => createAssistantGraph(
    checkpointer,
    { model: browserAssistantModel, proposals: proposalPersistence },
  ), [checkpointer, proposalPersistence])

  const createThread = async () => {
    const { data } = await supabase.auth.getUser()
    if (!data.user) throw new Error('請先登入')
    const thread = await createAssistantThread(itinerary.id, data.user.id)
    await refreshThreads(thread.id)
    return thread
  }

  const runAssistantTurn = async (thread: AssistantThread, request: AssistantTurnRequest) => {
    let result: Awaited<ReturnType<typeof runner.sendTurn>>
    try {
      result = await runner.sendTurn(request)
    } catch (graphError) {
      if (!isRecoverableGraphStateError(graphError)) throw graphError
      await checkpointer.deleteThread(thread.id)
      result = await runner.sendTurn({
        ...request,
        rehydratedSummary: thread.summary,
        rehydratedMessages: messages,
      })
    }
    if (result.state.assistantMessage) await saveAssistantMessage(thread.id, result.state.assistantMessage)
    if (result.state.summary !== thread.summary) {
      await updateAssistantThreadSummary(thread.id, result.state.summary)
    }
    await Promise.all([refreshConversation(thread.id), refreshThreads(thread.id)])
  }

  const send = async (event: FormEvent) => {
    event.preventDefault()
    const content = text.trim()
    if (!content || sending || hasPendingProposal || !navigator.onLine) return
    setThinkingContext('reply')
    setSending(true)
    setError(null)
    let attempt: { thread: AssistantThread; request: AssistantTurnRequest } | null = null
    try {
      const thread = currentThread ?? await createThread()
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
      if (thread.title === '新對話') {
        await renameAssistantThread(thread.id, content.slice(0, 36))
      }
      await runAssistantTurn(thread, request)
      setRetryRequest(null)
    } catch (sendError) {
      setError(friendlyError(sendError, '助理暫時無法回覆'))
      if (attempt) setRetryRequest(attempt)
    } finally {
      setSending(false)
    }
  }

  const retryLastTurn = async () => {
    if (!retryRequest || sending || !navigator.onLine) return
    setThinkingContext('reply')
    setSending(true)
    setError(null)
    try {
      await runAssistantTurn(retryRequest.thread, retryRequest.request)
      setRetryRequest(null)
    } catch (retryError) {
      setError(friendlyError(retryError, '助理暫時無法回覆'))
    } finally {
      setSending(false)
    }
  }

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // IME emits Enter while the candidate text is still being composed.
    // Let the browser/IME handle that key instead of submitting the form.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.closest('form')?.requestSubmit()
    }
  }

  const decideProposal = async (proposal: StoredAssistantProposal, approved: boolean) => {
    if (!navigator.onLine) return
    if (!approved) {
      // Rejection is not an AI turn and does not mutate the itinerary. Mark it
      // locally first so the composer is immediately available without the
      // thinking/loading bubble, then persist the status in the idempotent RPC.
      setError(null)
      setRejectingProposalId(proposal.id)
      setProposals((current) => current.map((item) => item.id === proposal.id
        ? { ...item, status: 'rejected' as const }
        : item))
      try {
        await applyStoredAssistantProposal(proposal.id, false)
        try {
          await runner.resumeProposal(proposal.threadId, false)
        } catch {
          // Canonical status is already rejected. Remove a stale interrupted
          // runtime so the next message rebuilds from canonical history.
          await checkpointer.deleteThread(proposal.threadId)
        }
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
    setThinkingContext('proposal')
    setSending(true)
    setError(null)
    setProposals((current) => current.map((item) => item.id === proposal.id
      ? { ...item, status: 'approved' as const }
      : item))
    try {
      let status: 'applied' | 'expired'
      try {
        const result = await runner.resumeProposal(proposal.threadId, true)
        if (result.state.proposalStatus !== 'applied' && result.state.proposalStatus !== 'expired') {
          throw new Error('行程提案沒有完成套用')
        }
        status = result.state.proposalStatus
      } catch {
        // Applying is idempotent. If graph persistence failed after (or before)
        // the RPC, ask the canonical proposal directly and rebuild the runtime.
        const canonicalStatus = await applyStoredAssistantProposal(proposal.id, true)
        if (canonicalStatus !== 'applied' && canonicalStatus !== 'expired') {
          throw new Error('這個行程提案已經未套用，請重新產生提案。')
        }
        status = canonicalStatus
        await checkpointer.deleteThread(proposal.threadId)
      }
      setProposals((current) => current.map((item) => item.id === proposal.id
        ? { ...item, status }
        : item))
      if (status === 'applied') await onItineraryApplied()
      await refreshConversation(proposal.threadId)
      // Keep the canonical terminal state even if an older list request was
      // already in flight when the user pressed confirm.
      setProposals((current) => current.map((item) => item.id === proposal.id
        ? { ...item, status }
        : item))
    } catch (decisionError) {
      setError(friendlyError(decisionError, '無法處理行程提案'))
      await refreshConversation(proposal.threadId).catch(() => {})
    } finally {
      setSending(false)
    }
  }

  const manualSummarize = async () => {
    if (!threadId || messages.length === 0) return
    setThinkingContext('summary')
    setSending(true)
    try {
      const state = await runner.summarizeThread(threadId)
      await updateAssistantThreadSummary(threadId, state.summary)
      await refreshThreads(threadId)
    } catch (summaryError) {
      setError(summaryError instanceof Error ? summaryError.message : '無法整理對話')
    } finally {
      setSending(false)
    }
  }

  manualSummarizeRef.current = manualSummarize

  useEffect(() => {
    if (!fullPage || !onAssistantToolbarChange) return
    onAssistantToolbarChange(
      <AssistantAppBarMenu
        canSummarize={Boolean(threadId && messages.length > 0 && !sending)}
        onSummarize={() => void manualSummarizeRef.current()}
          onConversationList={() => setThreadId(null)}
      />,
    )
  }, [fullPage, messages.length, onAssistantToolbarChange, sending, threadId])

  useEffect(() => () => onAssistantToolbarChange?.(null), [onAssistantToolbarChange])

  if (loading) return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 260 }}><CircularProgress /></Box>

  return (
    <Stack spacing={1.5}>
      <Paper variant={fullPage ? undefined : 'outlined'} elevation={fullPage ? 0 : undefined} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '280px minmax(0, 1fr)' }, height: fullPage ? 'calc(100dvh - 65px)' : { xs: 'calc(100dvh - 150px)', md: 'min(720px, calc(100dvh - 210px))' }, minHeight: { xs: 420, md: 580 }, overflow: 'hidden', borderRadius: fullPage ? 0 : 3, border: fullPage ? 0 : undefined, boxShadow: fullPage ? 'none' : '0 12px 32px rgba(15, 23, 42, 0.06)' }}>
        <Box sx={{ minHeight: 0, overflowY: 'auto', borderRight: { md: 1 }, borderBottom: { xs: 1, md: 0 }, borderColor: 'divider', display: { xs: threadId ? 'none' : 'block', md: 'block' }, bgcolor: 'background.default' }}>
          <Stack direction="row" sx={{ p: 1.5, alignItems: 'center' }}>
            <Box sx={{ flex: 1 }}><Typography sx={{ fontWeight: 900 }}>對話</Typography><Typography variant="caption" color="text.secondary">{threads.length} 個對話串</Typography></Box>
            <IconButton color="primary" aria-label="建立新對話" onClick={() => void createThread().catch((value) => setError(value.message))} sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.dark' } }}><AddCommentRoundedIcon /></IconButton>
          </Stack>
          <Divider />
          <List disablePadding>
            {threads.map((thread) => (
              <ListItemButton key={thread.id} selected={thread.id === threadId} onClick={() => selectThread(thread.id)} sx={{ mx: 1, my: 0.5, borderRadius: 2 }}>
                <ListItemText primary={thread.title} secondary={new Date(thread.updatedAt).toLocaleString('zh-TW')} slotProps={{ primary: { noWrap: true, sx: { fontWeight: 800 } } }} />
                <IconButton size="small" aria-label={`重新命名 ${thread.title}`} onClick={(event) => { event.stopPropagation(); const title = window.prompt('對話名稱', thread.title); if (title?.trim()) void renameAssistantThread(thread.id, title).then(() => refreshThreads(thread.id)) }}><EditRoundedIcon fontSize="small" /></IconButton>
                <IconButton size="small" aria-label={`刪除 ${thread.title}`} onClick={(event) => { event.stopPropagation(); if (window.confirm(`刪除「${thread.title}」及所有訊息？`)) void deleteAssistantThread(thread.id).then(() => refreshThreads()) }}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>
              </ListItemButton>
            ))}
          </List>
          {threads.length === 0 ? <Typography color="text.secondary" sx={{ p: 2 }}>開始第一個對話，請助理推薦或調整行程。</Typography> : null}
        </Box>

        <Stack sx={{ minWidth: 0, minHeight: 0, display: { xs: threadId ? 'flex' : 'none', md: 'flex' } }}>
          {!fullPage ? <Stack direction="row" sx={{ px: { xs: 1, sm: 1.5 }, py: 1, alignItems: 'center', borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
            <IconButton aria-label="返回對話列表" sx={{ display: { md: 'none' }, mr: 0.5 }} onClick={() => setThreadId(null)}><ArrowBackRoundedIcon /></IconButton>
            <Avatar sx={{ width: 34, height: 34, mr: 1, bgcolor: 'primary.main' }}><AutoAwesomeRoundedIcon sx={{ fontSize: 19 }} /></Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}><Typography noWrap sx={{ fontWeight: 900 }}>{currentThread?.title ?? '旅程助理'}</Typography><Typography variant="caption" color="text.secondary">會先詢問你，再修改行程</Typography></Box>
            <Button size="small" startIcon={<SummarizeRoundedIcon />} disabled={!threadId || sending || messages.length === 0} onClick={() => void manualSummarize()}>整理對話</Button>
          </Stack> : null}

          <Stack spacing={1.5} sx={{ position: 'relative', flex: 1, minHeight: 0, p: { xs: 1.25, sm: 2 }, pt: { xs: 1.25, sm: 2 }, overflowY: 'auto', bgcolor: '#f7f8fa', scrollBehavior: 'smooth' }}>
            {messages.length === 0 ? (
              <Paper elevation={0} sx={{ alignSelf: 'center', maxWidth: 520, mt: 6, p: 3, textAlign: 'center', borderRadius: 3 }}>
                <AutoAwesomeRoundedIcon color="primary" sx={{ fontSize: 42 }} />
                <Typography variant="h6" sx={{ fontWeight: 900 }}>想怎麼安排這趟旅程？</Typography>
                <Typography color="text.secondary">問我旅程安排，或直接說想修改哪一天。任何修改都會先讓你確認。</Typography>
                <Stack direction="row" useFlexGap spacing={1} sx={{ mt: 2, justifyContent: 'center', flexWrap: 'wrap' }}>{quickPrompts.map((prompt) => <Chip key={prompt} label={prompt} variant="outlined" onClick={() => setText(prompt)} />)}</Stack>
              </Paper>
            ) : messages.map((message) => <Stack key={message.id} spacing={1}>
              <MessageBubble message={message} />
              {message.role === 'assistant'
                ? proposals.filter((proposal) => proposal.turnId === message.turnId).map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} busy={sending || rejectingProposalId === proposal.id} onDecision={decideProposal} />)
                : null}
            </Stack>)}
            {sending ? <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: 'text.secondary' }}><Avatar sx={{ width: 28, height: 28, bgcolor: 'primary.main' }}><AutoAwesomeRoundedIcon sx={{ fontSize: 15 }} /></Avatar><Paper elevation={0} sx={{ px: 1.5, py: 1, borderRadius: '18px 18px 18px 5px' }}><Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}><CircularProgress size={14} /><Typography variant="caption" aria-live="polite">{thinkingLabel}</Typography></Stack></Paper></Stack> : null}
            {!navigator.onLine ? <Alert severity="info" variant="outlined" sx={{ flexShrink: 0, borderRadius: 2 }}>助理與行程確認需要網路連線。</Alert> : null}
            {error ? <Alert severity="error" variant="outlined" onClose={() => setError(null)} sx={{ flexShrink: 0, borderRadius: 2 }}>{error}</Alert> : null}
            {retryRequest?.thread.id === threadId ? <Alert severity="warning" variant="outlined" sx={{ flexShrink: 0, borderRadius: 2 }} action={<Button color="inherit" size="small" disabled={sending || !navigator.onLine} onClick={() => void retryLastTurn()}>重試</Button>}>上次回覆未完成，這個回合可以安全重試。</Alert> : null}
            <Box ref={conversationEndRef} />
          </Stack>

          <Stack component="form" onSubmit={send} sx={{ p: { xs: 1, sm: 1.5 }, borderTop: fullPage ? 0 : 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
            <TextField fullWidth variant="outlined" multiline minRows={1} maxRows={5} placeholder={hasPendingProposal ? '請先確認或拒絕待處理的行程提案' : '輸入訊息…（Enter 送出）'} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={handleComposerKeyDown} disabled={sending || hasPendingProposal || !navigator.onLine} slotProps={{ input: { endAdornment: <InputAdornment position="end"><IconButton type="submit" aria-label="送出訊息" disabled={!text.trim() || sending || hasPendingProposal || !navigator.onLine} edge="end" sx={{ width: 40, height: 40, bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.dark' }, '&.Mui-disabled': { bgcolor: 'action.disabledBackground' } }}><SendRoundedIcon fontSize="small" /></IconButton></InputAdornment>, sx: { borderRadius: 3, bgcolor: 'action.hover', alignItems: 'center', py: 0.5, pr: 1, '& textarea': { padding: '8px 4px' } } } }} />
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  )
}

function AssistantAppBarMenu({
  canSummarize,
  onSummarize,
  onConversationList,
}: {
  canSummarize: boolean
  onSummarize: () => void
  onConversationList: () => void
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const open = Boolean(anchorEl)

  return <>
    <IconButton
      aria-label="助理選單"
      aria-controls={open ? 'assistant-appbar-menu' : undefined}
      aria-haspopup="true"
      onClick={(event) => setAnchorEl(event.currentTarget)}
    >
      <MoreVertRoundedIcon />
    </IconButton>
    <Menu
      id="assistant-appbar-menu"
      anchorEl={anchorEl}
      open={open}
      onClose={() => setAnchorEl(null)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
    >
      <MenuItem
        disabled={!canSummarize}
        onClick={() => {
          setAnchorEl(null)
          onSummarize()
        }}
      >
        <ListItemIcon><SummarizeRoundedIcon fontSize="small" /></ListItemIcon>
        <ListItemText>整理對話</ListItemText>
      </MenuItem>
      <MenuItem
        onClick={() => {
          setAnchorEl(null)
          onConversationList()
        }}
      >
        <ListItemIcon><ForumRoundedIcon fontSize="small" /></ListItemIcon>
        <ListItemText>切換到對話清單</ListItemText>
      </MenuItem>
    </Menu>
  </>
}

function MessageBubble({ message }: { message: AssistantMessage }) {
  const user = message.role === 'user'
  return <Stack direction={user ? 'row-reverse' : 'row'} spacing={1} sx={{ alignItems: 'flex-end' }}>
    {!user ? <Avatar sx={{ width: 30, height: 30, bgcolor: 'primary.main' }}><AutoAwesomeRoundedIcon sx={{ fontSize: 16 }} /></Avatar> : null}
    <Box sx={{ maxWidth: { xs: '86%', sm: '76%' } }}>
      <Paper elevation={0} sx={{ px: 1.5, py: 1.1, borderRadius: user ? '18px 18px 5px 18px' : '18px 18px 18px 5px', bgcolor: user ? 'primary.main' : 'background.paper', color: user ? 'primary.contrastText' : 'text.primary', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', boxShadow: user ? 'none' : '0 1px 3px rgba(15, 23, 42, 0.08)' }}>
        <Typography variant="body2" sx={{ lineHeight: 1.65 }}>{message.content}</Typography>
      </Paper>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35, textAlign: user ? 'right' : 'left', px: 0.5 }}>{user ? '你' : '旅程助理'} · {timeLabel(message.createdAt)}</Typography>
    </Box>
  </Stack>
}

function ProposalCard({ proposal, busy, onDecision }: { proposal: StoredAssistantProposal; busy: boolean; onDecision: (proposal: StoredAssistantProposal, approved: boolean) => void }) {
  return (
    <Paper variant="outlined" sx={{ alignSelf: 'flex-start', width: 'min(100%, 680px)', p: 1.5, borderRadius: 3, borderColor: proposal.status === 'pending' ? 'primary.main' : 'divider' }}>
      <Typography color="primary" sx={{ fontWeight: 900 }}>行程修改提案</Typography>
      <Typography variant="body2" sx={{ mt: 0.5 }}>{proposal.explanation}</Typography>
      <Stack spacing={1} sx={{ mt: 1.5 }}>
        {proposal.afterDays.map((after) => {
          const before = proposal.beforeDays.find((day) => day.id === after.id)
          return <Box key={after.id} sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>{dateLabel(after)}</Typography>
            <Typography variant="caption" color="text.secondary">原本：{before?.attractions.map((item) => item.name).join(' → ') || '沒有景點'}</Typography>
            <Typography variant="body2">建議：{after.attractions.map((item) => item.name).join(' → ') || '沒有景點'}</Typography>
          </Box>
        })}
      </Stack>
      {proposal.status === 'pending' ? <Stack direction="row" spacing={1} sx={{ mt: 1.5, justifyContent: 'flex-end' }}>
        <Button disabled={busy} onClick={() => onDecision(proposal, false)}>不套用，繼續討論</Button>
        <Button variant="contained" disabled={busy || !navigator.onLine} onClick={() => onDecision(proposal, true)}>確認儲存</Button>
      </Stack> : <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>{proposal.status === 'approved' ? '正在套用…' : proposal.status === 'applied' ? '已套用' : proposal.status === 'expired' ? '行程已變更，提案已過期' : '未套用'}</Typography>}
    </Paper>
  )
}

export default AssistantSection
