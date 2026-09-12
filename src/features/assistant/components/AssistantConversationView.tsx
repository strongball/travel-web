import { useCallback, useEffect, useRef, useState } from 'react'
import { useRiverRef, useRiverWatch } from '@stball/react-river'
import {
  Alert,
  Box,
  CircularProgress,
  Stack,
} from '@mui/material'
import {
  assistantConversationsProvider,
  assistantNoticeProvider,
  assistantThreadsProvider,
  assistantTurnActionsProvider,
} from '../providers'
import { useOnlineStatus } from '../../../hooks/useOnlineStatus'
import { PageHeader } from '../../../components/PageHeader'
import type { Itinerary, TodoItem } from '../../../types/database'
import type { ReasoningEffort } from '../models'
import type { AssistantAttachment, AssistantProposal } from '../types'
import { friendlyError, rememberedThread, rememberThread } from '../utils/conversationUtils'
import { ConversationList } from './ConversationList'
import { MessageList } from './MessageList'
import { ChatComposer, type ChatComposerHandle } from './ChatComposer'
import { AssistantAppBarActions } from './AssistantAppBarActions'

/**
 * 對話工作區主容器：持有選取中的對話與錯誤狀態，
 * 頂端以 PageHeader 作為一體化導航與操作列，支援行動端上一頁與清單切換。
 */
export function AssistantConversationView({
  itineraryId: propItineraryId,
  itinerary,
  todos,
  todoCategories,
  onBack,
  onRegisterBrowserBackHandler,
}: {
  itineraryId?: string
  itinerary: Itinerary
  todos: TodoItem[]
  todoCategories: string[]
  onBack?: () => void
  onRegisterBrowserBackHandler?: ((handler: (() => boolean) | null) => void) | null
}) {
  const itineraryId = propItineraryId ?? itinerary.id
  const ref = useRiverRef()
  const online = useOnlineStatus()
  const threadStorageKey = `assistant-active-thread:${itineraryId}`
  const [threadId, setThreadId] = useState<string | null>(() => rememberedThread(threadStorageKey))
  const [error, setError] = useState<string | null>(null)
  const selectionGenerationRef = useRef(0)
  const threadIdRef = useRef(threadId)
  const composerRef = useRef<ChatComposerHandle | null>(null)
  const initialSyncedRef = useRef(false)

  useEffect(() => {
    initialSyncedRef.current = false
  }, [itineraryId])

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
  const sending = turn?.phase === 'running'

  const select = useCallback((next: string | null) => {
    if (threadIdRef.current !== next) selectionGenerationRef.current += 1
    threadIdRef.current = next
    setThreadId(next)
    setError(null)
    rememberThread(threadStorageKey, next)
  }, [threadStorageKey])

  // 清單載入後：
  // 1. 初次載入時，若有記住的或既有對話，選取有效的對話（或第一個對話）。
  // 2. 後續若當前選取的對話被刪除（在清單中不存在），則退回第一個對話或 null。
  // 3. 若使用者主動切換至對話清單 (threadId === null)，絕不強制覆蓋選取。
  useEffect(() => {
    if (!threadsState.hasData) return
    const list = threadsState.data ?? []

    if (!initialSyncedRef.current) {
      initialSyncedRef.current = true
      const currentValid = threadId && list.some((thread) => thread.id === threadId) ? threadId : null
      const next = currentValid ?? list[0]?.id ?? null
      if (next !== threadId) select(next)
      return
    }

    if (threadId && !list.some((thread) => thread.id === threadId)) {
      select(list[0]?.id ?? null)
    }
  }, [select, threadId, threadsState])

  // 瀏覽器上一頁/手勢支援：在對話中優先返回對話清單
  useEffect(() => {
    if (!onRegisterBrowserBackHandler) return
    const handleBack = () => {
      if (threadId) {
        select(null)
        return true
      }
      return false
    }
    onRegisterBrowserBackHandler(handleBack)
    return () => onRegisterBrowserBackHandler(null)
  }, [onRegisterBrowserBackHandler, select, threadId])

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

  const handleQuestionAnswer = useCallback(async (answer: any) => {
    await turnActions.answerQuestion({ threadId, answer })
    requestAnimationFrame(() => composerRef.current?.focus())
  }, [threadId, turnActions])

  const prevSendingRef = useRef(sending)

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
    <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <PageHeader
        title={currentThread?.title ?? '旅程助理'}
        subtitle={itinerary.title}
        onBack={() => {
          if (threadId) select(null)
          else onBack?.()
        }}
        backLabel={threadId ? '返回對話列表' : '返回我的行程'}
        actions={
          <AssistantAppBarActions
            thread={currentThread}
            sending={sending}
            messageCount={messages.length}
            online={online}
            onConversationList={() => select(null)}
            onSummarize={handleSummarize}
            onDelete={(targetId) => void handleDeleteThread(targetId)}
            showConversationList={Boolean(threadId)}
          />
        }
      />

      {collectionError || (!threadId && error) ? (
        <Alert severity="error">{collectionError ?? error}</Alert>
      ) : null}

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '300px minmax(0, 1fr)' },
          overflow: 'hidden',
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
          <MessageList
            itineraryId={itineraryId}
            threadId={threadId}
            online={online}
            onQuickPrompt={(prompt) => composerRef.current?.setText(prompt)}
            onDecision={(proposal, approved) => void handleDecision(proposal, approved)}
            onQuestionAnswer={(answer) => void handleQuestionAnswer(answer)}
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
      </Box>
    </Box>
  )
}

export default AssistantConversationView
