import AddCommentRoundedIcon from '@mui/icons-material/AddCommentRounded'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
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
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { StoredAssistantProposal } from '../../lib/repositories/assistantRepository'
import type { TripDay } from '../../types/database'
import type { AssistantMessage } from './types'
import type { AssistantConversationController } from './useAssistantConversation'

const quickPrompts = [
  '推薦今天附近熱門景點',
  '幫我檢查行程動線與時間是否太趕',
  '幫我安排一天的道地美食行程',
  '如果有半天空檔，適合去哪裡逛逛？',
]

const dateLabel = (day: TripDay) => {
  const value = day.date.slice(0, 10)
  return new Intl.DateTimeFormat('zh-TW', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

const itineraryItemLabel = (item: TripDay['attractions'][number]) => {
  const start = item.startTime?.slice(11, 16)
  const end = item.endTime?.slice(11, 16)
  const time = start && end ? `${start}–${end} ` : ''
  const travel = item.travelTime === null ? '' : `（車程約 ${item.travelTime} 分）`
  return `${time}${item.name}${travel}`
}

const timeLabel = (value: string) =>
  new Intl.DateTimeFormat('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))

const threadTimeLabel = (value: string) => {
  const date = new Date(value)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) return timeLabel(value)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return '昨天'
  return new Intl.DateTimeFormat('zh-TW', {
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

const handleComposerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
  if (event.nativeEvent.isComposing || event.keyCode === 229) return
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    event.currentTarget.closest('form')?.requestSubmit()
  }
}

export function AssistantConversationView({
  controller,
  fullPage,
}: {
  controller: AssistantConversationController
  fullPage: boolean
}) {
  const conversationScrollRef = useRef<HTMLDivElement>(null)
  const initializedThreadRef = useRef<string | null>(null)
  const previousMessageCountRef = useRef(0)
  const previousSendingRef = useRef(false)
  const nearBottomRef = useRef(true)
  const {
    threadId,
    currentThread,
    messages,
    proposals,
    text,
    loading,
    conversationLoading,
    online,
    sending,
    rejectingProposalId,
    progressLabel,
    error,
    notice,
    hasPendingProposal,
    canRetry,
  } = controller

  useLayoutEffect(() => {
    const container = conversationScrollRef.current
    if (!threadId) {
      initializedThreadRef.current = null
      previousMessageCountRef.current = 0
      previousSendingRef.current = false
      nearBottomRef.current = true
      return
    }
    if (!container || conversationLoading) return

    if (initializedThreadRef.current !== threadId) {
      container.scrollTop = container.scrollHeight
      initializedThreadRef.current = threadId
      nearBottomRef.current = true
    } else {
      const messageAdded = messages.length > previousMessageCountRef.current
      const lastMessage = messages.at(-1)
      const userJustSent = messageAdded && lastMessage?.role === 'user'
      const assistantJustReplied = messageAdded && lastMessage?.role === 'assistant'
      const progressStarted = sending && !previousSendingRef.current

      if (userJustSent && lastMessage) {
        // When user asks a question, scroll so the question is positioned at the top of the viewport
        const userElement = container.querySelector<HTMLElement>(
          `[data-message-id="${lastMessage.id}"]`,
        )
        if (userElement) {
          const top =
            userElement.getBoundingClientRect().top -
            container.getBoundingClientRect().top +
            container.scrollTop -
            16
          container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
        }
      } else if (assistantJustReplied && lastMessage) {
        // Anchor the turn (user question or assistant response) smoothly near the top
        const turnUserMessage = [...messages]
          .reverse()
          .find((m) => m.turnId === lastMessage.turnId && m.role === 'user')
        const anchorElement = turnUserMessage
          ? container.querySelector<HTMLElement>(`[data-message-id="${turnUserMessage.id}"]`) ??
            container.querySelector<HTMLElement>(`[data-message-id="${lastMessage.id}"]`)
          : container.querySelector<HTMLElement>(`[data-message-id="${lastMessage.id}"]`)
        if (anchorElement) {
          const top =
            anchorElement.getBoundingClientRect().top -
            container.getBoundingClientRect().top +
            container.scrollTop -
            16
          container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
        }
      } else if (progressStarted) {
        const lastUser = [...messages].reverse().find((m) => m.role === 'user')
        if (lastUser) {
          const userElement = container.querySelector<HTMLElement>(
            `[data-message-id="${lastUser.id}"]`,
          )
          if (userElement) {
            const top =
              userElement.getBoundingClientRect().top -
              container.getBoundingClientRect().top +
              container.scrollTop -
              16
            container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
          }
        }
      } else if (nearBottomRef.current && messageAdded) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
      }
    }

    previousMessageCountRef.current = messages.length
    previousSendingRef.current = sending
  }, [conversationLoading, messages, sending, threadId])

  if (loading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 260 }}>
        <CircularProgress />
      </Box>
    )
  }

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
        <ConversationList controller={controller} />

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
                onClick={controller.showThreadList}
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
              <ConversationActions controller={controller} />
            </Stack>
          ) : null}

          {/* Messages scroll container */}
          <Stack
            ref={conversationScrollRef}
            spacing={2}
            onScroll={(event) => {
              const container = event.currentTarget
              nearBottomRef.current =
                container.scrollHeight - container.scrollTop - container.clientHeight < 80
            }}
            sx={{
              position: 'relative',
              flex: 1,
              minHeight: 0,
              p: { xs: 1.5, sm: 2.5 },
              overflowY: 'auto',
              bgcolor: '#f6f9f8',
              backgroundImage: 'radial-gradient(rgba(13, 118, 110, 0.04) 1px, transparent 1px)',
              backgroundSize: '16px 16px',
            }}
          >
            {!threadId ? (
              <Paper
                elevation={0}
                sx={{
                  alignSelf: 'center',
                  mt: 8,
                  p: 3.5,
                  textAlign: 'center',
                  borderRadius: 3.5,
                  border: '1px solid rgba(13, 118, 110, 0.1)',
                  bgcolor: 'rgba(255, 255, 255, 0.8)',
                }}
              >
                <ForumRoundedIcon color="action" sx={{ fontSize: 44, opacity: 0.7 }} />
                <Typography sx={{ mt: 1, fontWeight: 800 }}>選擇一個對話</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  從左側清單挑選對話，或點擊「+」建立新對話。
                </Typography>
              </Paper>
            ) : conversationLoading ? (
              <ConversationLoading />
            ) : messages.length === 0 ? (
              <Paper
                elevation={0}
                sx={{
                  alignSelf: 'center',
                  maxWidth: 540,
                  width: '100%',
                  mt: { xs: 2, sm: 4 },
                  p: { xs: 2.5, sm: 3.5 },
                  textAlign: 'center',
                  borderRadius: 4,
                  border: '1px solid rgba(13, 118, 110, 0.12)',
                  bgcolor: 'rgba(255, 255, 255, 0.92)',
                  backdropFilter: 'blur(12px)',
                  boxShadow: '0 8px 30px rgba(13, 118, 110, 0.06)',
                }}
              >
                <Avatar
                  sx={{
                    width: 56,
                    height: 56,
                    mx: 'auto',
                    mb: 1.5,
                    background: 'linear-gradient(135deg, #0d766e 0%, #14b8a6 100%)',
                    boxShadow: '0 4px 16px rgba(13, 118, 110, 0.3)',
                  }}
                >
                  <AutoAwesomeRoundedIcon sx={{ fontSize: 30, color: '#ffffff' }} />
                </Avatar>
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 900,
                    letterSpacing: '-0.02em',
                    color: '#0d766e',
                  }}
                >
                  嗨！想怎麼規劃這趟旅程？
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.75, lineHeight: 1.6, px: { xs: 1, sm: 2 } }}
                >
                  隨時告訴我你想去的景點、詢問動線建議，或直接說明要修改哪一天的行程。
                </Typography>

                <Divider sx={{ my: 2.25, borderColor: 'rgba(13, 118, 110, 0.08)' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                    推薦快捷提問
                  </Typography>
                </Divider>

                <Stack
                  direction="row"
                  useFlexGap
                  spacing={1}
                  sx={{ justifyContent: 'center', flexWrap: 'wrap' }}
                >
                  {quickPrompts.map((prompt) => (
                    <Chip
                      key={prompt}
                      label={prompt}
                      onClick={() => controller.setText(prompt)}
                      sx={{
                        py: 2.2,
                        px: 1,
                        borderRadius: 3,
                        fontWeight: 650,
                        fontSize: '0.84rem',
                        bgcolor: 'rgba(13, 118, 110, 0.06)',
                        border: '1px solid rgba(13, 118, 110, 0.15)',
                        color: '#0d766e',
                        transition: 'all 180ms ease',
                        '&:hover': {
                          bgcolor: 'rgba(13, 118, 110, 0.12)',
                          borderColor: '#0d766e',
                          transform: 'translateY(-1px)',
                        },
                        '&:active': {
                          transform: 'scale(0.98)',
                        },
                      }}
                    />
                  ))}
                </Stack>
              </Paper>
            ) : (
              messages.map((message) => (
                <Stack key={message.id} data-message-id={message.id} spacing={1.25}>
                  <MessageBubble message={message} />
                  {message.role === 'assistant'
                    ? proposals
                        .filter((proposal) => proposal.turnId === message.turnId)
                        .map((proposal) => (
                          <ProposalCard
                            key={proposal.id}
                            proposal={proposal}
                            busy={sending || rejectingProposalId === proposal.id}
                            online={online}
                            onDecision={controller.decideProposal}
                          />
                        ))
                    : null}
                </Stack>
              ))
            )}

            {sending && (!messages.length || messages[messages.length - 1]?.role === 'user') ? (
              <AssistantProgress label={progressLabel || '正在根據行程整理回覆…'} />
            ) : null}

            {!online ? (
              <Alert severity="info" variant="outlined" sx={{ flexShrink: 0, borderRadius: 2.5 }}>
                助理與行程確認需要網路連線。
              </Alert>
            ) : null}
            {notice ? (
              <Alert
                severity="warning"
                variant="outlined"
                onClose={controller.clearNotice}
                sx={{ flexShrink: 0, borderRadius: 2.5 }}
              >
                {notice}
              </Alert>
            ) : null}
            {error ? (
              <Alert
                severity="error"
                variant="outlined"
                onClose={controller.clearError}
                sx={{ flexShrink: 0, borderRadius: 2.5 }}
              >
                {error}
              </Alert>
            ) : null}
            {canRetry ? (
              <Alert
                severity="warning"
                variant="outlined"
                sx={{ flexShrink: 0, borderRadius: 2.5 }}
                action={
                  <Button
                    color="inherit"
                    size="small"
                    disabled={sending || !online}
                    onClick={() => void controller.retryLastTurn()}
                  >
                    重試
                  </Button>
                }
              >
                上次回覆未完成，這個回合可以安全重試。
              </Alert>
            ) : null}

            {/* Dynamic bottom placeholder space: only expands while sending/responding to allow top-anchoring without leaving a huge gap when idle */}
            {sending && messages.length > 0 ? (
              <Box
                sx={{
                  minHeight: { xs: 'calc(100dvh - 240px)', md: 'calc(100dvh - 280px)' },
                  flexShrink: 0,
                  pointerEvents: 'none',
                }}
              />
            ) : (
              <Box sx={{ minHeight: { xs: 16, sm: 24 }, flexShrink: 0 }} />
            )}
          </Stack>

          {/* Composer Input Bar */}
          {threadId ? (
            <Stack
              component="form"
              onSubmit={controller.send}
              sx={{
                p: { xs: 1.25, sm: 1.75 },
                pb: { xs: 'max(14px, env(safe-area-inset-bottom))', sm: 1.75 },
                borderTop: '1px solid rgba(13, 118, 110, 0.1)',
                bgcolor: 'rgba(255, 255, 255, 0.94)',
                backdropFilter: 'blur(16px)',
                zIndex: 3,
              }}
            >
              <TextField
                fullWidth
                variant="outlined"
                multiline
                minRows={1}
                maxRows={5}
                placeholder={
                  conversationLoading
                    ? '正在載入對話…'
                    : hasPendingProposal
                      ? '請先確認或拒絕待處理的行程提案'
                      : '輸入訊息…（Enter 送出，Shift+Enter 換行）'
                }
                value={text}
                onChange={(event) => controller.setText(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                disabled={conversationLoading || sending || hasPendingProposal || !online}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end" sx={{ mb: 0.5 }}>
                        <IconButton
                          type="submit"
                          aria-label="送出訊息"
                          disabled={
                            !text.trim() ||
                            conversationLoading ||
                            sending ||
                            hasPendingProposal ||
                            !online
                          }
                          edge="end"
                          sx={{
                            width: 42,
                            height: 42,
                            background:
                              !text.trim() || sending
                                ? 'rgba(0, 0, 0, 0.08)'
                                : 'linear-gradient(135deg, #0d766e 0%, #14b8a6 100%)',
                            color: '#ffffff',
                            boxShadow:
                              !text.trim() || sending
                                ? 'none'
                                : '0 3px 12px rgba(13, 118, 110, 0.3)',
                            transition: 'all 180ms ease',
                            '&:hover': {
                              background: 'linear-gradient(135deg, #075c57 0%, #0d766e 100%)',
                              transform: 'scale(1.04)',
                            },
                            '&.Mui-disabled': {
                              bgcolor: 'action.disabledBackground',
                              color: 'action.disabled',
                            },
                          }}
                        >
                          <SendRoundedIcon fontSize="small" />
                        </IconButton>
                      </InputAdornment>
                    ),
                    sx: {
                      borderRadius: 3.5,
                      bgcolor: '#f1f5f4',
                      alignItems: 'flex-end',
                      py: 0.75,
                      px: 1.5,
                      border: '1px solid rgba(13, 118, 110, 0.12)',
                      transition: 'border-color 160ms ease, box-shadow 160ms ease',
                      '&:hover': {
                        borderColor: '#0d766e',
                      },
                      '&.Mui-focused': {
                        borderColor: '#0d766e',
                        bgcolor: '#ffffff',
                        boxShadow: '0 0 0 3px rgba(13, 118, 110, 0.15)',
                      },
                      '& textarea': {
                        padding: '6px 4px',
                        fontSize: { xs: '0.92rem', sm: '0.96rem' },
                        lineHeight: 1.5,
                      },
                    },
                  },
                }}
              />
            </Stack>
          ) : null}
        </Stack>
      </Paper>
    </Stack>
  )
}

function ConversationLoading() {
  return (
    <Stack
      role="status"
      aria-live="polite"
      spacing={1.5}
      sx={{ alignSelf: 'center', width: 'min(100%, 540px)', mt: { xs: 2, sm: 3 } }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
        正在載入對話…
      </Typography>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'flex-end' }}>
        <Skeleton variant="circular" width={34} height={34} sx={{ flexShrink: 0 }} />
        <Skeleton
          variant="rounded"
          width="70%"
          height={64}
          sx={{ borderRadius: '20px 20px 20px 6px' }}
        />
      </Stack>
      <Skeleton
        variant="rounded"
        width="54%"
        height={48}
        sx={{ alignSelf: 'flex-end', borderRadius: '20px 20px 6px 20px' }}
      />
    </Stack>
  )
}

function ConversationList({ controller }: { controller: AssistantConversationController }) {
  const { threads, threadId, creatingThread } = controller
  const [menu, setMenu] = useState<{
    anchorEl: HTMLElement
    thread: AssistantConversationController['threads'][number]
  } | null>(null)

  return (
    <Box
      sx={{
        minHeight: 0,
        height: '100%',
        overflowY: 'auto',
        borderRight: { md: '1px solid rgba(13, 118, 110, 0.1)' },
        borderBottom: { xs: '1px solid rgba(13, 118, 110, 0.1)', md: 0 },
        display: { xs: threadId ? 'none' : 'block', md: 'block' },
        bgcolor: '#ffffff',
      }}
    >
      <Stack
        direction="row"
        sx={{
          p: 1.75,
          alignItems: 'center',
          borderBottom: '1px solid rgba(13, 118, 110, 0.08)',
          position: 'sticky',
          top: 0,
          bgcolor: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(8px)',
          zIndex: 1,
        }}
      >
        <Box sx={{ flex: 1 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography sx={{ fontWeight: 900, fontSize: '1rem', letterSpacing: '-0.02em' }}>
              對話列表
            </Typography>
            <Chip
              size="small"
              label={threads.length}
              sx={{
                height: 20,
                fontSize: '0.72rem',
                fontWeight: 800,
                bgcolor: 'rgba(13, 118, 110, 0.08)',
                color: 'primary.main',
              }}
            />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            點選對話繼續討論行程
          </Typography>
        </Box>
        <Tooltip title="建立新對話">
          <IconButton
            color="primary"
            aria-label="建立新對話"
            disabled={creatingThread}
            onClick={() => void controller.createThread()}
            sx={{
              width: 38,
              height: 38,
              background: 'linear-gradient(135deg, #0d766e 0%, #14b8a6 100%)',
              color: '#ffffff',
              boxShadow: '0 2px 8px rgba(13, 118, 110, 0.25)',
              '&:hover': {
                background: 'linear-gradient(135deg, #075c57 0%, #0d766e 100%)',
              },
            }}
          >
            {creatingThread ? (
              <CircularProgress color="inherit" size={18} />
            ) : (
              <AddCommentRoundedIcon sx={{ fontSize: 19 }} />
            )}
          </IconButton>
        </Tooltip>
      </Stack>

      <List disablePadding sx={{ p: 1 }}>
        {threads.map((thread) => {
          const isSelected = thread.id === threadId
          return (
            <ListItemButton
              key={thread.id}
              selected={isSelected}
              onClick={() => controller.selectThread(thread.id)}
              sx={{
                my: 0.6,
                p: 1.25,
                borderRadius: 2.5,
                transition: 'all 160ms ease',
                border: isSelected
                  ? '1px solid rgba(13, 118, 110, 0.25)'
                  : '1px solid transparent',
                bgcolor: isSelected ? 'rgba(13, 118, 110, 0.08)' : 'transparent',
                '&:hover': {
                  bgcolor: isSelected
                    ? 'rgba(13, 118, 110, 0.12)'
                    : 'rgba(13, 118, 110, 0.04)',
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <Avatar
                  sx={{
                    width: 28,
                    height: 28,
                    bgcolor: isSelected ? 'primary.main' : 'action.hover',
                    color: isSelected ? '#ffffff' : 'text.secondary',
                    fontSize: '0.8rem',
                  }}
                >
                  <ForumRoundedIcon sx={{ fontSize: 16 }} />
                </Avatar>
              </ListItemIcon>
              <ListItemText
                primary={thread.title}
                secondary={threadTimeLabel(thread.updatedAt)}
                slotProps={{
                  primary: {
                    noWrap: true,
                    sx: {
                      fontWeight: isSelected ? 850 : 650,
                      fontSize: '0.88rem',
                      color: isSelected ? 'primary.main' : 'text.primary',
                    },
                  },
                  secondary: {
                    sx: { fontSize: '0.72rem', mt: 0.2 },
                  },
                }}
              />
              <IconButton
                size="small"
                aria-label={`${thread.title} 的更多操作`}
                onClick={(event) => {
                  event.stopPropagation()
                  setMenu({ anchorEl: event.currentTarget, thread })
                }}
                sx={{
                  color: 'text.secondary',
                  '&:hover': { color: 'text.primary', bgcolor: 'rgba(0, 0, 0, 0.04)' },
                }}
              >
                <MoreVertRoundedIcon fontSize="small" />
              </IconButton>
            </ListItemButton>
          )
        })}
      </List>

      <Menu
        anchorEl={menu?.anchorEl ?? null}
        open={Boolean(menu)}
        onClose={() => setMenu(null)}
        slotProps={{
          paper: {
            sx: { borderRadius: 3, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' },
          },
        }}
      >
        <MenuItem
          onClick={() => {
            const thread = menu?.thread
            setMenu(null)
            if (!thread) return
            const title = window.prompt('重新命名對話', thread.title)
            if (title?.trim()) void controller.renameThread(thread.id, title.trim())
          }}
        >
          <ListItemIcon>
            <EditRoundedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>重新命名對話</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            const thread = menu?.thread
            setMenu(null)
            if (thread && window.confirm(`刪除「${thread.title}」及所有訊息？`)) {
              void controller.deleteThread(thread.id)
            }
          }}
        >
          <ListItemIcon>
            <DeleteOutlineRoundedIcon color="error" fontSize="small" />
          </ListItemIcon>
          <ListItemText sx={{ color: 'error.main' }}>刪除對話</ListItemText>
        </MenuItem>
      </Menu>

      {threads.length === 0 ? (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            開始第一個對話，請助理推薦景點或智慧調整行程。
          </Typography>
        </Box>
      ) : null}
    </Box>
  )
}

function AssistantProgress({ label }: { label: string }) {
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
      <Avatar
        sx={{
          width: 32,
          height: 32,
          background: 'linear-gradient(135deg, #0d766e 0%, #14b8a6 100%)',
          boxShadow: '0 2px 6px rgba(13, 118, 110, 0.2)',
        }}
      >
        <AutoAwesomeRoundedIcon sx={{ fontSize: 16, color: '#ffffff' }} />
      </Avatar>
      <Paper
        elevation={0}
        sx={{
          px: 2,
          py: 1.1,
          borderRadius: '20px 20px 20px 6px',
          bgcolor: 'rgba(255, 255, 255, 0.95)',
          border: '1px solid rgba(13, 118, 110, 0.1)',
          boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <CircularProgress size={14} thickness={5} sx={{ color: '#0d766e' }} />
          <Typography
            variant="caption"
            aria-live="polite"
            sx={{ fontWeight: 700, color: 'text.secondary' }}
          >
            {label}
          </Typography>
        </Stack>
      </Paper>
    </Stack>
  )
}

export function AssistantAppBarActions({
  thread,
  deletingThreadId,
  sending,
  messageCount,
  online,
  onConversationList,
  onSummarize,
  onDelete,
  showConversationList = true,
}: {
  thread: AssistantConversationController['currentThread']
  deletingThreadId: string | null
  sending: boolean
  messageCount: number
  online: boolean
  onConversationList: () => void
  onSummarize: () => void
  onDelete: (threadId: string) => void
  showConversationList?: boolean
}) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  return (
    <Stack direction="row" spacing={0.5}>
      {showConversationList ? (
        <Tooltip title="對話清單">
          <IconButton
            aria-label="對話清單"
            onClick={onConversationList}
            sx={{ width: 38, height: 38 }}
          >
            <ForumRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : null}
      {thread ? (
        <>
          <Tooltip title="對話操作">
            <span>
              <IconButton
                aria-label="對話操作"
                disabled={deletingThreadId === thread.id}
                onClick={(event) => setMenuAnchor(event.currentTarget)}
                sx={{ width: 38, height: 38 }}
              >
                {deletingThreadId === thread.id ? (
                  <CircularProgress color="inherit" size={18} />
                ) : (
                  <MoreVertRoundedIcon fontSize="small" />
                )}
              </IconButton>
            </span>
          </Tooltip>
          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={() => setMenuAnchor(null)}
            slotProps={{
              paper: {
                sx: { borderRadius: 3, minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' },
              },
            }}
          >
            <MenuItem
              disabled={sending || messageCount === 0 || !online}
              onClick={() => {
                setMenuAnchor(null)
                onSummarize()
              }}
            >
              <ListItemIcon>
                <SummarizeRoundedIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary="壓縮對話紀錄"
                secondary="整理前段脈絡，保留近期關鍵"
              />
            </MenuItem>
            <Divider />
            <MenuItem
              disabled={sending}
              onClick={() => {
                setMenuAnchor(null)
                if (window.confirm(`刪除「${thread.title}」及所有訊息？`)) {
                  onDelete(thread.id)
                }
              }}
            >
              <ListItemIcon>
                <DeleteOutlineRoundedIcon color="error" fontSize="small" />
              </ListItemIcon>
              <ListItemText sx={{ color: 'error.main' }}>刪除對話</ListItemText>
            </MenuItem>
          </Menu>
        </>
      ) : null}
    </Stack>
  )
}

function ConversationActions({ controller }: { controller: AssistantConversationController }) {
  return (
    <AssistantAppBarActions
      thread={controller.currentThread}
      deletingThreadId={controller.deletingThreadId}
      sending={controller.sending}
      messageCount={controller.messages.length}
      online={controller.online}
      onConversationList={controller.showThreadList}
      onSummarize={() => void controller.manualSummarize()}
      onDelete={(threadId) => void controller.deleteThread(threadId)}
      showConversationList={false}
    />
  )
}

function MessageBubble({ message }: { message: AssistantMessage }) {
  const user = message.role === 'user'
  return (
    <Stack direction={user ? 'row-reverse' : 'row'} spacing={1.25} sx={{ alignItems: 'flex-start' }}>
      {!user ? (
        <Avatar
          sx={{
            width: 32,
            height: 32,
            mt: 0.25,
            background: 'linear-gradient(135deg, #0d766e 0%, #14b8a6 100%)',
            boxShadow: '0 2px 8px rgba(13, 118, 110, 0.25)',
            flexShrink: 0,
          }}
        >
          <AutoAwesomeRoundedIcon sx={{ fontSize: 17, color: '#ffffff' }} />
        </Avatar>
      ) : null}
      <Box sx={{ maxWidth: { xs: '88%', sm: '78%' } }}>
        <Paper
          elevation={0}
          sx={{
            px: { xs: 1.75, sm: 2 },
            py: 1.25,
            borderRadius: user ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
            background: user
              ? 'linear-gradient(135deg, #0d766e 0%, #095953 100%)'
              : '#ffffff',
            color: user ? '#ffffff' : 'text.primary',
            border: user ? 'none' : '1px solid rgba(13, 118, 110, 0.1)',
            boxShadow: user
              ? '0 3px 12px rgba(13, 118, 110, 0.22)'
              : '0 2px 12px rgba(15, 23, 42, 0.05)',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          }}
        >
          <Typography
            variant="body2"
            sx={{
              lineHeight: 1.68,
              fontSize: { xs: '0.9rem', sm: '0.94rem' },
              fontWeight: user ? 500 : 450,
            }}
          >
            {message.content}
          </Typography>
        </Paper>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            display: 'block',
            mt: 0.4,
            fontSize: '0.72rem',
            textAlign: user ? 'right' : 'left',
            px: 0.75,
          }}
        >
          {user ? '你' : '旅程助理'} · {timeLabel(message.createdAt)}
        </Typography>
      </Box>
    </Stack>
  )
}

function ProposalCard({
  proposal,
  busy,
  online,
  onDecision,
}: {
  proposal: StoredAssistantProposal
  busy: boolean
  online: boolean
  onDecision: (proposal: StoredAssistantProposal, approved: boolean) => void
}) {
  const [changesExpanded, setChangesExpanded] = useState(false)
  const compactable =
    proposal.status === 'applied' ||
    proposal.status === 'rejected' ||
    proposal.status === 'expired'
  const showChanges = !compactable || changesExpanded
  const changesId = `proposal-${proposal.id}-changes`

  const statusChip = (() => {
    switch (proposal.status) {
      case 'approved':
        return (
          <Chip
            size="small"
            icon={<CircularProgress size={12} color="inherit" />}
            label="正在套用…"
            color="primary"
            sx={{ fontWeight: 800 }}
          />
        )
      case 'applied':
        return (
          <Chip
            size="small"
            icon={<CheckCircleRoundedIcon fontSize="small" />}
            label="已成功套用"
            sx={{
              bgcolor: 'rgba(16, 185, 129, 0.12)',
              color: '#059669',
              fontWeight: 800,
            }}
          />
        )
      case 'expired':
        return (
          <Chip
            size="small"
            label="行程已異動，提案已過期"
            sx={{ bgcolor: 'rgba(0,0,0,0.06)', color: 'text.secondary', fontWeight: 700 }}
          />
        )
      case 'pending':
        return (
          <Chip
            size="small"
            label="待確認"
            sx={{
              bgcolor: 'rgba(238, 124, 69, 0.12)',
              color: '#d95a1c',
              fontWeight: 800,
            }}
          />
        )
      default:
        return (
          <Chip
            size="small"
            label="未套用"
            sx={{ bgcolor: 'rgba(0,0,0,0.06)', color: 'text.secondary', fontWeight: 700 }}
          />
        )
    }
  })()

  return (
    <Paper
      elevation={0}
      sx={{
        alignSelf: 'flex-start',
        width: 'min(100%, 680px)',
        p: { xs: 1.75, sm: 2.25 },
        borderRadius: 3.5,
        border:
          proposal.status === 'pending'
            ? '1.5px solid #0d766e'
            : '1px solid rgba(13, 118, 110, 0.12)',
        bgcolor: '#ffffff',
        boxShadow:
          proposal.status === 'pending'
            ? '0 6px 24px rgba(13, 118, 110, 0.1)'
            : '0 2px 10px rgba(0, 0, 0, 0.04)',
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 0.5 }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Avatar
            sx={{
              width: 26,
              height: 26,
              background: 'linear-gradient(135deg, #0d766e 0%, #14b8a6 100%)',
            }}
          >
            <AutoAwesomeRoundedIcon sx={{ fontSize: 14, color: '#ffffff' }} />
          </Avatar>
          <Typography sx={{ fontWeight: 900, color: '#0d766e', fontSize: '0.96rem' }}>
            行程修改建議
          </Typography>
        </Stack>
        {statusChip}
      </Stack>

      <Box
        sx={{
          mt: 1.5,
          p: 1.5,
          borderRadius: 2.5,
          bgcolor: 'rgba(13, 118, 110, 0.04)',
          borderLeft: '3px solid #0d766e',
        }}
      >
        <Typography variant="body2" sx={{ lineHeight: 1.6, color: 'text.primary' }}>
          {proposal.explanation}
        </Typography>
      </Box>

      {compactable ? (
        <Button
          size="small"
          aria-expanded={changesExpanded}
          aria-controls={changesId}
          onClick={() => setChangesExpanded((expanded) => !expanded)}
          sx={{ mt: 1, px: 1, borderRadius: 2, fontWeight: 700 }}
        >
          {changesExpanded ? '收合變更內容' : '查看變更內容'}
        </Button>
      ) : null}

      {showChanges ? (
        <Stack id={changesId} spacing={1.25} sx={{ mt: 1.75 }}>
          {proposal.afterDays.map((after) => {
            const before = proposal.beforeDays.find((day) => day.id === after.id)
            return (
              <Box
                key={after.id}
                sx={{
                  p: 1.5,
                  bgcolor: '#f8faf9',
                  borderRadius: 2.5,
                  border: '1px solid rgba(13, 118, 110, 0.08)',
                }}
              >
                <Chip
                  size="small"
                  label={dateLabel(after)}
                  sx={{
                    fontWeight: 850,
                    bgcolor: 'rgba(13, 118, 110, 0.08)',
                    color: 'primary.main',
                    mb: 1,
                  }}
                />
                <Stack spacing={0.75}>
                  <Box sx={{ p: 1, borderRadius: 2, bgcolor: '#f1f5f4' }}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', fontWeight: 800, mb: 0.2 }}
                    >
                      原本：
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.84rem' }}>
                      {before?.attractions.map(itineraryItemLabel).join(' → ') || '（沒有景點）'}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      p: 1,
                      borderRadius: 2,
                      bgcolor: 'rgba(13, 118, 110, 0.08)',
                      border: '1px solid rgba(13, 118, 110, 0.15)',
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{ display: 'block', fontWeight: 900, color: '#0d766e', mb: 0.2 }}
                    >
                      建議新安排：
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 650, color: '#075c57', fontSize: '0.86rem' }}
                    >
                      {after.attractions.map(itineraryItemLabel).join(' → ') || '（沒有景點）'}
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            )
          })}
        </Stack>
      ) : null}

      {proposal.status === 'pending' ? (
        <Stack
          direction={{ xs: 'column-reverse', sm: 'row' }}
          spacing={1}
          sx={{ mt: 2, justifyContent: 'flex-end' }}
        >
          <Button
            variant="outlined"
            disabled={busy || !online}
            onClick={() => onDecision(proposal, false)}
            sx={{ borderRadius: 2.5, px: 2, py: 1 }}
          >
            不套用，繼續討論
          </Button>
          <Button
            variant="contained"
            disabled={busy || !online}
            onClick={() => onDecision(proposal, true)}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <CheckCircleRoundedIcon />}
            sx={{
              borderRadius: 2.5,
              px: 2.5,
              py: 1,
              background: 'linear-gradient(135deg, #0d766e 0%, #14b8a6 100%)',
              boxShadow: '0 4px 14px rgba(13, 118, 110, 0.3)',
              '&:hover': {
                background: 'linear-gradient(135deg, #075c57 0%, #0d766e 100%)',
              },
            }}
          >
            確認儲存並套用
          </Button>
        </Stack>
      ) : null}
    </Paper>
  )
}

