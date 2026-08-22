import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { useRiverRef, useRiverWatch } from '@stball/react-river'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import {
  Avatar,
  Box,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { assistantConversationsProvider } from '../../../providers'
import type { AssistantConversationController } from '../useAssistantConversation'
import { ConversationList } from './ConversationList'
import { MessageList } from './MessageList'
import { ChatComposer } from './ChatComposer'
import { AssistantAppBarActions } from './AssistantAppBarActions'

export { AssistantAppBarActions }

export function AssistantConversationView({
  controller,
  fullPage,
  onAssistantToolbarChange,
}: {
  controller: AssistantConversationController
  fullPage: boolean
  onAssistantToolbarChange?: (toolbar: ReactNode) => void
}) {
  const {
    threadId,
    threads: threadActions,
    selectionStatus,
    threadList: threads,
    currentThread,
    threadLoading: collectionLoading,
    online,
    composer,
    actions: { manualSummarize, registerFocusComposer, decideProposal, send },
    feedback,
  } = controller
  const riverRef = useRiverRef()
  const conversationState = useRiverWatch(assistantConversationsProvider(threadId ?? ''))
  const snapshot = conversationState.data
  const messages = snapshot?.messages ?? []
  const messageCount = messages.length
  const lastMessage = messages.at(-1)
  const turn = snapshot?.turn ?? null
  const conversationLoading = conversationState.isLoading && !conversationState.hasData
  const sending = Boolean(turn)
  const dismissFailure = () => {
    if (threadId) riverRef.read(assistantConversationsProvider(threadId).notifier).dismissFailure()
  }

  const streamingMessage = turn?.streaming ?? null
  const hasPendingProposal = !!turn?.pendingToolCall

  const { showThreadList, deleteThread } = threadActions
  const deletingThreadId = selectionStatus.deletingThreadId

  const conversationScrollRef = useRef<HTMLDivElement>(null)
  const initializedThreadRef = useRef<string | null>(null)
  const previousMessageCountRef = useRef(0)
  const previousStreamingLengthRef = useRef(0)
  const previousSendingRef = useRef(false)
  const suppressScrollTrackingRef = useRef(false)

  const composerInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const prevSendingRef = useRef(sending)

  useEffect(() => {
    registerFocusComposer(() => {
      requestAnimationFrame(() => {
        composerInputRef.current?.focus()
      })
    })
  }, [registerFocusComposer])

  useEffect(() => {
    if (!fullPage || !onAssistantToolbarChange) return
    onAssistantToolbarChange(
      <AssistantAppBarActions
        thread={currentThread}
        deletingThreadId={deletingThreadId}
        sending={sending}
        messageCount={messageCount}
        online={online}
        onConversationList={showThreadList}
        onSummarize={() => void manualSummarize()}
        onDelete={(targetId) => void deleteThread(targetId)}
      />,
    )
  }, [
    currentThread,
    deleteThread,
    deletingThreadId,
    fullPage,
    manualSummarize,
    messageCount,
    onAssistantToolbarChange,
    online,
    sending,
    showThreadList,
  ])

  useEffect(() => () => onAssistantToolbarChange?.(null), [onAssistantToolbarChange])

  useLayoutEffect(() => {
    const container = conversationScrollRef.current
    if (!threadId) {
      initializedThreadRef.current = null
      previousMessageCountRef.current = 0
      previousStreamingLengthRef.current = 0
      previousSendingRef.current = false
      return
    }
    if (!container || conversationLoading) return

    if (initializedThreadRef.current !== threadId) {
      container.scrollTop = container.scrollHeight
      initializedThreadRef.current = threadId
      previousStreamingLengthRef.current = streamingMessage?.content.length ?? 0
    } else {
      const messageAdded = messageCount > previousMessageCountRef.current
      const userJustSent = messageAdded && lastMessage?.role === 'user'
      const retryingUserMessage =
        !messageAdded && sending && !previousSendingRef.current && lastMessage?.role === 'user'

      if (userJustSent || retryingUserMessage) {
        requestAnimationFrame(() => {
          const messageElement = Array.from(
            container.querySelectorAll<HTMLElement>('[data-message-id]'),
          ).find((element) => element.dataset.messageId === lastMessage.id)
          if (messageElement) {
            const containerTop = container.getBoundingClientRect().top
            const messageTop = messageElement.getBoundingClientRect().top
            suppressScrollTrackingRef.current = true
            const nextScrollTop = Math.max(0, container.scrollTop + messageTop - containerTop - 12)
            if (typeof container.scrollTo === 'function') {
              container.scrollTo({ top: nextScrollTop, behavior: 'smooth' })
            } else {
              container.scrollTop = nextScrollTop
            }
            requestAnimationFrame(() => {
              suppressScrollTrackingRef.current = false
            })
          }
        })
      }
    }

    previousMessageCountRef.current = messageCount
    previousStreamingLengthRef.current = streamingMessage?.content.length ?? 0
    previousSendingRef.current = sending
  }, [conversationLoading, lastMessage?.id, lastMessage?.role, messageCount, sending, streamingMessage, threadId])

  const composerDisabled = conversationLoading || sending || hasPendingProposal || !online

  useEffect(() => {
    if (prevSendingRef.current && !sending && !composerDisabled) {
      requestAnimationFrame(() => {
        composerInputRef.current?.focus()
      })
    }
    prevSendingRef.current = sending
  }, [composerDisabled, sending])

  if (collectionLoading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 260 }}>
        <CircularProgress />
      </Box>
    )
  }

  const composerPlaceholder = conversationLoading
    ? '正在載入對話…'
    : hasPendingProposal
    ? '請先確認或拒絕待處理的行程提案'
    : '輸入訊息…（Enter 送出，Shift+Enter 換行）'

  return (
    <Stack spacing={0} sx={{ height: '100%' }}>
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
          threads={threads}
          threadId={threadId}
          creatingThread={selectionStatus.creatingThread}
          onSelectThread={threadActions.selectThread}
          onCreateThread={() => void threadActions.createThread()}
          onRenameThread={(id, title) => void threadActions.renameThread(id, title)}
          onDeleteThread={(id) => void deleteThread(id)}
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
                onClick={showThreadList}
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
                deletingThreadId={deletingThreadId}
                sending={sending}
                messageCount={messages.length}
                online={online}
                onConversationList={showThreadList}
                onSummarize={() => void manualSummarize()}
                onDelete={(tId) => void deleteThread(tId)}
                showConversationList={false}
              />
            </Stack>
          ) : null}

          <MessageList
            threadId={threadId}
            messages={messages}
            turn={turn}
            loading={conversationLoading}
            sending={sending}
            online={online}
            composer={composer}
            onDecision={decideProposal}
            scrollRef={conversationScrollRef}
          />

          {threadId ? (
            <ChatComposer
              inputRef={composerInputRef}
              text={composer.text}
              onChangeText={composer.setText}
              onSubmit={send}
              disabled={composerDisabled}
              placeholder={composerPlaceholder}
              sending={sending}
              selectedModel={composer.selectedModel}
              onSelectModel={composer.setSelectedModel}
              reasoningEffort={composer.reasoningEffort}
              onSelectReasoningEffort={composer.setReasoningEffort}
              attachments={composer.attachments}
              onAddAttachments={composer.addAttachments}
              onRemoveAttachment={composer.removeAttachment}
              error={turn?.error ?? feedback.error}
              onClearError={() => {
                dismissFailure()
                feedback.clearError()
              }}
              notice={feedback.notice}
              onClearNotice={feedback.clearNotice}
              online={online}
            />
          ) : null}
        </Stack>
      </Paper>
    </Stack>
  )
}
