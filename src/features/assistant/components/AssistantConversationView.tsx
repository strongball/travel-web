import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRiverRef, useRiverWatch } from '@stball/react-river'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import {
  Alert,
  Avatar,
  Box,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import {
  assistantConversationsProvider,
  assistantNoticeProvider,
  assistantThreadsProvider,
  assistantTurnActionsProvider,
} from '../providers'
import { useOnlineStatus } from '../../../hooks/useOnlineStatus'
import type { Itinerary, TodoItem } from '../../../types/database'
import type { ReasoningEffort } from '../models'
import type { AssistantAttachment, AssistantProposal } from '../types'
import { friendlyError, rememberedThread, rememberThread } from '../utils/conversationUtils'
import { ConversationList } from './ConversationList'
import { MessageList } from './MessageList'
import { ChatComposer, type ChatComposerHandle } from './ChatComposer'
import { AssistantAppBarActions } from './AssistantAppBarActions'

/**
 * 對話工作區的容器:持有選取中的執行緒與錯誤訊息,
 * 負責檢視狀態與使用者事件；訊息載入、checkpoint 恢復與生成狀態由 River 管理。
 */
export function AssistantConversationView({
  itineraryId,
  itinerary,
  todos,
  todoCategories,
  fullPage,
  onAssistantToolbarChange,
}: {
  itineraryId: string
  itinerary: Itinerary
  todos: TodoItem[]
  todoCategories: string[]
  fullPage: boolean
  onAssistantToolbarChange?: (toolbar: ReactNode) => void
}) {
  const ref = useRiverRef()
  const online = useOnlineStatus()
  const threadStorageKey = `assistant-active-thread:${itineraryId}`
  const [threadId, setThreadId] = useState<string | null>(() => rememberedThread(threadStorageKey))
  const [error, setError] = useState<string | null>(null)
  const selectionGenerationRef = useRef(0)
  const threadIdRef = useRef(threadId)
  const composerRef = useRef<ChatComposerHandle | null>(null)

  useEffect(() => () => {
    selectionGenerationRef.current += 1
  }, [])

  const threadProvider = assistantThreadsProvider(itineraryId)
  const conversationProvider = assistantConversationsProvider({
    itineraryId,
    threadId: threadId ?? '',
  })
  const threadsState = useRiverWatch(threadProvider)
  const conversationState = useRiverWatch(conversationProvider, { enabled: Boolean(threadId) })
  const turnActions = useRiverWatch(assistantTurnActionsProvider(itineraryId))
  const notice = useRiverWatch(assistantNoticeProvider(itineraryId))

  const messages = conversationState?.data?.messages ?? []
  const turn = conversationState?.data?.turn ?? null
  const sending = Boolean(turn)

  const select = useCallback((next: string | null) => {
    if (threadIdRef.current !== next) selectionGenerationRef.current += 1
    threadIdRef.current = next
    setThreadId(next)
    setError(null)
    rememberThread(threadStorageKey, next)
  }, [threadStorageKey])

  // 清單載入後,選取無效或未選時退回記住的/第一個執行緒。
  useEffect(() => {
    if (!threadsState.hasData) return
    const list = threadsState.data ?? []
    const currentValid = threadId && list.some((thread) => thread.id === threadId) ? threadId : null
    const next = currentValid ?? list[0]?.id ?? null
    if (next !== threadId) select(next)
  }, [select, threadId, threadsState])

  // ---- 使用者命令 ----

  const handleCreateThread = useCallback(async () => {
    try {
      const thread = await ref.read(threadProvider.notifier).create()
      select(thread.id)
    } catch (createError) {
      setError(friendlyError(createError, '無法建立新對話'))
    }
  }, [ref, select, threadProvider])

  const handleRenameThread = useCallback(async (targetId: string, title: string) => {
    try {
      await ref.read(threadProvider.notifier).rename(targetId, title)
    } catch (renameError) {
      setError(friendlyError(renameError, '無法重新命名對話'))
    }
  }, [ref, threadProvider])

  const handleDeleteThread = useCallback(async (targetId: string) => {
    try {
      const deleted = await turnActions.deleteThread(targetId)
      if (deleted && targetId === threadId) select(null)
    } catch (deleteError) {
      setError(friendlyError(deleteError, '無法刪除對話'))
    }
  }, [select, threadId, turnActions])

  const handleSummarize = useCallback(() => {
    if (!threadId) return
    void turnActions.summarize(threadId)
  }, [threadId, turnActions])

  const handleSubmit = useCallback((
    payload: {
      text: string
      attachments: AssistantAttachment[]
      selectedModel?: string
      reasoningEffort?: ReasoningEffort
    },
  ) => {
    const submittedThreadId = threadIdRef.current
    const submissionGeneration = selectionGenerationRef.current
    setError(null)
    ref.set(assistantNoticeProvider(itineraryId), null)
    void turnActions.sendMessage({
      ...payload,
      threadId: submittedThreadId,
      context: { itinerary, todos, todoCategories },
    })
      .then((usedThreadId) => {
        if (selectionGenerationRef.current !== submissionGeneration) return
        if (usedThreadId && usedThreadId !== submittedThreadId) select(usedThreadId)
      })
      .catch((sendError: unknown) => {
        if (selectionGenerationRef.current !== submissionGeneration) return
        setError(friendlyError(sendError, '助理暫時無法回覆'))
      })
  }, [itinerary, itineraryId, ref, select, todoCategories, todos, turnActions])

  const handleDecision = useCallback(async (proposal: AssistantProposal, approved: boolean) => {
    await turnActions.decideProposal({ threadId, proposal, approved })
    requestAnimationFrame(() => composerRef.current?.focus())
  }, [threadId, turnActions])

  const prevSendingRef = useRef(sending)

  useEffect(() => {
    if (!fullPage || !onAssistantToolbarChange) return
    const currentThread = threadsState.data?.find((thread) => thread.id === threadId) ?? null
    onAssistantToolbarChange(
      <AssistantAppBarActions
        thread={currentThread}
        sending={sending}
        messageCount={messages.length}
        online={online}
        onConversationList={() => select(null)}
        onSummarize={handleSummarize}
        onDelete={(targetId) => void handleDeleteThread(targetId)}
      />,
    )
  }, [
    fullPage,
    handleDeleteThread,
    handleSummarize,
    messages.length,
    onAssistantToolbarChange,
    online,
    select,
    sending,
    threadId,
    threadsState,
  ])

  useEffect(() => () => onAssistantToolbarChange?.(null), [onAssistantToolbarChange])

  useEffect(() => {
    if (prevSendingRef.current && !sending) {
      requestAnimationFrame(() => {
        composerRef.current?.focus()
      })
    }
    prevSendingRef.current = sending
  }, [sending])

  if (threadsState.isLoading && (threadsState.data ?? []).length === 0) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 260 }}>
        <CircularProgress />
      </Box>
    )
  }

  const currentThread = threadsState.data?.find((thread) => thread.id === threadId) ?? null
  const collectionError = threadsState.isError
    ? friendlyError(threadsState.error, '無法載入助理對話')
    : null
  const conversationError = conversationState?.isError
    ? friendlyError(conversationState.error, '無法載入對話內容')
    : null

  return (
    <Stack spacing={0} sx={{ height: '100%' }}>
      {collectionError || (!threadId && error) ? (
        <Alert severity="error">{collectionError ?? error}</Alert>
      ) : null}
      <Paper
        variant={fullPage ? undefined : 'outlined'}
        elevation={fullPage ? 0 : undefined}
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '300px minmax(0, 1fr)' },
          height: fullPage
            ? { xs: 'calc(100dvh - 58px)', md: 'calc(100dvh - 65px)' }
            : { xs: 'calc(100dvh - 145px)', md: 'min(760px, calc(100dvh - 200px))' },
          minHeight: { xs: 460, md: 600 },
          overflow: 'hidden',
          borderRadius: fullPage ? 0 : 3.5,
          border: fullPage ? 0 : '1px solid rgba(13, 118, 110, 0.12)',
          boxShadow: fullPage ? 'none' : '0 16px 40px rgba(15, 23, 42, 0.07)',
          bgcolor: 'background.paper',
        }}
      >
        <ConversationList
          itineraryId={itineraryId}
          threadId={threadId}
          onSelectThread={select}
          onCreateThread={() => void handleCreateThread()}
          onRenameThread={(id, title) => void handleRenameThread(id, title)}
          onDeleteThread={(id) => void handleDeleteThread(id)}
        />

        <Stack
          sx={{
            minWidth: 0,
            minHeight: 0,
            display: { xs: threadId ? 'flex' : 'none', md: 'flex' },
            bgcolor: '#f8faf9',
          }}
        >
          {!fullPage ? (
            <Stack
              direction="row"
              sx={{
                px: { xs: 1.5, sm: 2 },
                py: 1.25,
                alignItems: 'center',
                borderBottom: '1px solid rgba(13, 118, 110, 0.1)',
                bgcolor: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(12px)',
                zIndex: 2,
              }}
            >
              <IconButton
                aria-label="返回對話列表"
                sx={{
                  display: { md: 'none' },
                  mr: 1,
                  width: 38,
                  height: 38,
                  bgcolor: 'rgba(13, 118, 110, 0.06)',
                  '&:hover': { bgcolor: 'rgba(13, 118, 110, 0.12)' },
                }}
                onClick={() => select(null)}
              >
                <ArrowBackRoundedIcon fontSize="small" />
              </IconButton>
              <Avatar
                sx={{
                  width: 36,
                  height: 36,
                  mr: 1.25,
                  background: 'linear-gradient(135deg, #0d766e 0%, #14b8a6 100%)',
                  boxShadow: '0 2px 8px rgba(13, 118, 110, 0.25)',
                }}
              >
                <AutoAwesomeRoundedIcon sx={{ fontSize: 19, color: '#ffffff' }} />
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontWeight: 800, fontSize: '0.96rem', letterSpacing: '-0.01em' }}>
                  {currentThread?.title ?? '旅程助理'}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.74rem' }}>
                  任何修改建議皆需你確認後才套用
                </Typography>
              </Box>
              <AssistantAppBarActions
                thread={currentThread}
                sending={sending}
                messageCount={messages.length}
                online={online}
                onConversationList={() => select(null)}
                onSummarize={handleSummarize}
                onDelete={(tId) => void handleDeleteThread(tId)}
                showConversationList={false}
              />
            </Stack>
          ) : null}

          <MessageList
            itineraryId={itineraryId}
            threadId={threadId}
            online={online}
            onQuickPrompt={(prompt) => composerRef.current?.setText(prompt)}
            onDecision={(proposal, approved) => void handleDecision(proposal, approved)}
          />

          {threadId ? (
            <ChatComposer
              ref={composerRef}
              itineraryId={itineraryId}
              threadId={threadId}
              online={online}
              onSubmit={handleSubmit}
              error={conversationError ?? error}
              notice={notice}
              onClearError={() => {
                ref.read(conversationProvider.notifier).dismissFailure()
                setError(null)
              }}
              onClearNotice={() => ref.set(assistantNoticeProvider(itineraryId), null)}
            />
          ) : null}
        </Stack>
      </Paper>
    </Stack>
  )
}
