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
  '推薦今天附近景點',
  '幫我檢查行程是否太趕',
  '幫我安排一天的美食行程',
]

const dateLabel = (day: TripDay) => {
  // Format date-only values in UTC so a local offset cannot change the day.
  const value = day.date.slice(0, 10)
  return new Intl.DateTimeFormat('zh-TW', {
    month: 'short', day: 'numeric', weekday: 'short', timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

const itineraryItemLabel = (item: TripDay['attractions'][number]) => {
  const start = item.startTime?.slice(11, 16)
  const end = item.endTime?.slice(11, 16)
  const time = start && end ? `${start}–${end} ` : ''
  const travel = item.travelTime === null ? '' : `（前往約 ${item.travelTime} 分）`
  return `${time}${item.name}${travel}`
}

const timeLabel = (value: string) => new Intl.DateTimeFormat('zh-TW', {
  hour: '2-digit', minute: '2-digit', hour12: false,
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
  // IME emits Enter while candidate text is still being composed.
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
      const userJustSent = messageAdded && messages.at(-1)?.role === 'user'
      const progressStarted = sending && !previousSendingRef.current
      if (userJustSent || (nearBottomRef.current && (messageAdded || progressStarted))) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
      }
    }

    previousMessageCountRef.current = messages.length
    previousSendingRef.current = sending
  }, [conversationLoading, messages, sending, threadId])

  if (loading) {
    return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 260 }}><CircularProgress /></Box>
  }

  return (
    <Stack spacing={1.5}>
      <Paper
        variant={fullPage ? undefined : 'outlined'}
        elevation={fullPage ? 0 : undefined}
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '280px minmax(0, 1fr)' },
          height: fullPage
            ? 'calc(100dvh - 65px)'
            : { xs: 'calc(100dvh - 150px)', md: 'min(720px, calc(100dvh - 210px))' },
          minHeight: { xs: 420, md: 580 },
          overflow: 'hidden',
          borderRadius: fullPage ? 0 : 3,
          border: fullPage ? 0 : undefined,
          boxShadow: fullPage ? 'none' : '0 12px 32px rgba(15, 23, 42, 0.06)',
        }}
      >
        <ConversationList controller={controller} />

        <Stack sx={{ minWidth: 0, minHeight: 0, display: { xs: threadId ? 'flex' : 'none', md: 'flex' } }}>
          {!fullPage ? (
            <Stack
              direction="row"
              sx={{
                px: { xs: 1, sm: 1.5 },
                py: 1,
                alignItems: 'center',
                borderBottom: 1,
                borderColor: 'divider',
                bgcolor: 'background.paper',
              }}
            >
              <IconButton
                aria-label="返回對話列表"
                sx={{ display: { md: 'none' }, mr: 0.5 }}
                onClick={controller.showThreadList}
              >
                <ArrowBackRoundedIcon />
              </IconButton>
              <Avatar sx={{ width: 34, height: 34, mr: 1, bgcolor: 'primary.main' }}>
                <AutoAwesomeRoundedIcon sx={{ fontSize: 19 }} />
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontWeight: 900 }}>{currentThread?.title ?? '旅程助理'}</Typography>
                <Typography variant="caption" color="text.secondary">會先詢問你，再修改行程</Typography>
              </Box>
              <ConversationActions controller={controller} />
            </Stack>
          ) : null}

          <Stack
            ref={conversationScrollRef}
            spacing={1.5}
            onScroll={(event) => {
              const container = event.currentTarget
              nearBottomRef.current = container.scrollHeight - container.scrollTop - container.clientHeight < 80
            }}
            sx={{
              position: 'relative',
              flex: 1,
              minHeight: 0,
              p: { xs: 1.25, sm: 2 },
              overflowY: 'auto',
              bgcolor: '#f7f8fa',
            }}
          >
            {!threadId ? (
              <Paper elevation={0} sx={{ alignSelf: 'center', mt: 8, p: 3, textAlign: 'center', borderRadius: 3 }}>
                <ForumRoundedIcon color="action" sx={{ fontSize: 38 }} />
                <Typography sx={{ mt: 0.5, fontWeight: 800 }}>選擇一個對話</Typography>
                <Typography variant="body2" color="text.secondary">從左側清單繼續，或建立新對話。</Typography>
              </Paper>
            ) : conversationLoading ? (
              <ConversationLoading />
            ) : messages.length === 0 ? (
              <Paper elevation={0} sx={{ alignSelf: 'center', maxWidth: 520, mt: 6, p: 3, textAlign: 'center', borderRadius: 3 }}>
                <AutoAwesomeRoundedIcon color="primary" sx={{ fontSize: 42 }} />
                <Typography variant="h6" sx={{ fontWeight: 900 }}>想怎麼安排這趟旅程？</Typography>
                <Typography color="text.secondary">問我旅程安排，或直接說想修改哪一天。任何修改都會先讓你確認。</Typography>
                <Stack direction="row" useFlexGap spacing={1} sx={{ mt: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {quickPrompts.map((prompt) => (
                    <Chip key={prompt} label={prompt} variant="outlined" onClick={() => controller.setText(prompt)} />
                  ))}
                </Stack>
              </Paper>
            ) : messages.map((message) => (
              <Stack key={message.id} spacing={1}>
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
            ))}
            {sending ? <AssistantProgress label={progressLabel} /> : null}
            {!online ? (
              <Alert severity="info" variant="outlined" sx={{ flexShrink: 0, borderRadius: 2 }}>
                助理與行程確認需要網路連線。
              </Alert>
            ) : null}
            {notice ? (
              <Alert severity="warning" variant="outlined" onClose={controller.clearNotice} sx={{ flexShrink: 0, borderRadius: 2 }}>
                {notice}
              </Alert>
            ) : null}
            {error ? (
              <Alert severity="error" variant="outlined" onClose={controller.clearError} sx={{ flexShrink: 0, borderRadius: 2 }}>
                {error}
              </Alert>
            ) : null}
            {canRetry ? (
              <Alert
                severity="warning"
                variant="outlined"
                sx={{ flexShrink: 0, borderRadius: 2 }}
                action={(
                  <Button
                    color="inherit"
                    size="small"
                    disabled={sending || !online}
                    onClick={() => void controller.retryLastTurn()}
                  >
                    重試
                  </Button>
                )}
              >
                上次回覆未完成，這個回合可以安全重試。
              </Alert>
            ) : null}
            <Box />
          </Stack>

          {threadId ? <Stack
            component="form"
            onSubmit={controller.send}
            sx={{
              p: { xs: 1, sm: 1.5 },
              borderTop: fullPage ? 0 : 1,
              borderColor: 'divider',
              bgcolor: 'background.paper',
            }}
          >
            <TextField
              fullWidth
              variant="outlined"
              multiline
              minRows={1}
              maxRows={5}
              placeholder={conversationLoading
                ? '正在載入對話…'
                : hasPendingProposal
                  ? '請先確認或拒絕待處理的行程提案'
                  : '輸入訊息…（Enter 送出）'}
              value={text}
              onChange={(event) => controller.setText(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              disabled={conversationLoading || sending || hasPendingProposal || !online}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        type="submit"
                        aria-label="送出訊息"
                        disabled={!text.trim() || conversationLoading || sending || hasPendingProposal || !online}
                        edge="end"
                        sx={{
                          width: 40,
                          height: 40,
                          bgcolor: 'primary.main',
                          color: 'primary.contrastText',
                          '&:hover': { bgcolor: 'primary.dark' },
                          '&.Mui-disabled': { bgcolor: 'action.disabledBackground' },
                        }}
                      >
                        <SendRoundedIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ),
                  sx: {
                    borderRadius: 3,
                    bgcolor: 'action.hover',
                    alignItems: 'center',
                    py: 0.5,
                    pr: 1,
                    '& textarea': { padding: '8px 4px' },
                  },
                },
              }}
            />
          </Stack> : null}
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
      spacing={1.25}
      sx={{ alignSelf: 'center', width: 'min(100%, 520px)', mt: { xs: 2, sm: 3 } }}
    >
      <Typography variant="caption" color="text.secondary">正在載入對話…</Typography>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-end' }}>
        <Skeleton variant="circular" width={30} height={30} sx={{ flexShrink: 0 }} />
        <Skeleton variant="rounded" width="68%" height={58} sx={{ borderRadius: '18px 18px 18px 5px' }} />
      </Stack>
      <Skeleton
        variant="rounded"
        width="52%"
        height={44}
        sx={{ alignSelf: 'flex-end', borderRadius: '18px 18px 5px 18px' }}
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
        overflowY: 'auto',
        borderRight: { md: 1 },
        borderBottom: { xs: 1, md: 0 },
        borderColor: 'divider',
        display: { xs: threadId ? 'none' : 'block', md: 'block' },
        bgcolor: 'background.default',
      }}
    >
      <Stack direction="row" sx={{ p: 1.5, alignItems: 'center' }}>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 900 }}>對話</Typography>
          <Typography variant="caption" color="text.secondary">{threads.length} 個對話串</Typography>
        </Box>
        <IconButton
          color="primary"
          aria-label="建立新對話"
          disabled={creatingThread}
          onClick={() => void controller.createThread()}
          sx={{
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            '&:hover': { bgcolor: 'primary.dark' },
          }}
        >
          {creatingThread ? <CircularProgress color="inherit" size={20} /> : <AddCommentRoundedIcon />}
        </IconButton>
      </Stack>
      <Divider />
      <List disablePadding>
        {threads.map((thread) => (
          <ListItemButton
            key={thread.id}
            selected={thread.id === threadId}
            onClick={() => controller.selectThread(thread.id)}
            sx={{ mx: 1, my: 0.5, borderRadius: 2 }}
          >
            <ListItemText
              primary={thread.title}
              secondary={threadTimeLabel(thread.updatedAt)}
              slotProps={{ primary: { noWrap: true, sx: { fontWeight: 800 } } }}
            />
            <IconButton
              size="small"
              aria-label={`${thread.title} 的更多操作`}
              onClick={(event) => {
                event.stopPropagation()
                setMenu({ anchorEl: event.currentTarget, thread })
              }}
            >
              <MoreVertRoundedIcon fontSize="small" />
            </IconButton>
          </ListItemButton>
        ))}
      </List>
      <Menu
        anchorEl={menu?.anchorEl ?? null}
        open={Boolean(menu)}
        onClose={() => setMenu(null)}
      >
        <MenuItem onClick={() => {
          const thread = menu?.thread
          setMenu(null)
          if (!thread) return
          const title = window.prompt('重新命名對話', thread.title)
          if (title?.trim()) void controller.renameThread(thread.id, title.trim())
        }}>
          <ListItemIcon><EditRoundedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>重新命名對話</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => {
          const thread = menu?.thread
          setMenu(null)
          if (thread && window.confirm(`刪除「${thread.title}」及所有訊息？`)) {
            void controller.deleteThread(thread.id)
          }
        }}>
          <ListItemIcon><DeleteOutlineRoundedIcon color="error" fontSize="small" /></ListItemIcon>
          <ListItemText sx={{ color: 'error.main' }}>刪除對話</ListItemText>
        </MenuItem>
      </Menu>
      {threads.length === 0 ? (
        <Typography color="text.secondary" sx={{ p: 2 }}>開始第一個對話，請助理推薦或調整行程。</Typography>
      ) : null}
    </Box>
  )
}

function AssistantProgress({ label }: { label: string }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: 'text.secondary' }}>
      <Avatar sx={{ width: 28, height: 28, bgcolor: 'primary.main' }}>
        <AutoAwesomeRoundedIcon sx={{ fontSize: 15 }} />
      </Avatar>
      <Paper elevation={0} sx={{ px: 1.5, py: 1, borderRadius: '18px 18px 18px 5px' }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
          <CircularProgress size={14} />
          <Typography variant="caption" aria-live="polite">{label}</Typography>
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
    <Stack direction="row" spacing={0.25}>
      {showConversationList ? <Tooltip title="對話清單">
        <IconButton aria-label="對話清單" onClick={onConversationList}>
          <ForumRoundedIcon />
        </IconButton>
      </Tooltip> : null}
      {thread ? <>
        <Tooltip title="對話操作">
          <span>
            <IconButton
              aria-label="對話操作"
              disabled={deletingThreadId === thread.id}
              onClick={(event) => setMenuAnchor(event.currentTarget)}
            >
              {deletingThreadId === thread.id
                ? <CircularProgress color="inherit" size={20} />
                : <MoreVertRoundedIcon />}
            </IconButton>
          </span>
        </Tooltip>
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
        >
          <MenuItem
            disabled={sending || messageCount === 0 || !online}
            onClick={() => {
              setMenuAnchor(null)
              onSummarize()
            }}
          >
            <ListItemIcon><SummarizeRoundedIcon fontSize="small" /></ListItemIcon>
            <ListItemText
              primary="壓縮對話"
              secondary="整理較早內容，保留最近訊息"
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
            <ListItemIcon><DeleteOutlineRoundedIcon color="error" fontSize="small" /></ListItemIcon>
            <ListItemText sx={{ color: 'error.main' }}>刪除對話</ListItemText>
          </MenuItem>
        </Menu>
      </> : null}
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
    <Stack direction={user ? 'row-reverse' : 'row'} spacing={1} sx={{ alignItems: 'flex-end' }}>
      {!user ? (
        <Avatar sx={{ width: 30, height: 30, bgcolor: 'primary.main' }}>
          <AutoAwesomeRoundedIcon sx={{ fontSize: 16 }} />
        </Avatar>
      ) : null}
      <Box sx={{ maxWidth: { xs: '86%', sm: '76%' } }}>
        <Paper
          elevation={0}
          sx={{
            px: 1.5,
            py: 1.1,
            borderRadius: user ? '18px 18px 5px 18px' : '18px 18px 18px 5px',
            bgcolor: user ? 'primary.main' : 'background.paper',
            color: user ? 'primary.contrastText' : 'text.primary',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            boxShadow: user ? 'none' : '0 1px 3px rgba(15, 23, 42, 0.08)',
          }}
        >
          <Typography variant="body2" sx={{ lineHeight: 1.65 }}>{message.content}</Typography>
        </Paper>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 0.35, textAlign: user ? 'right' : 'left', px: 0.5 }}
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
  const compactable = proposal.status === 'applied'
    || proposal.status === 'rejected'
    || proposal.status === 'expired'
  const showChanges = !compactable || changesExpanded
  const changesId = `proposal-${proposal.id}-changes`
  const statusLabel = proposal.status === 'approved'
    ? '正在套用…'
    : proposal.status === 'applied'
      ? '已套用'
      : proposal.status === 'expired'
        ? '行程已變更，提案已過期'
        : '未套用'

  return (
    <Paper
      variant="outlined"
      sx={{
        alignSelf: 'flex-start',
        width: 'min(100%, 680px)',
        p: 1.5,
        borderRadius: 3,
        borderColor: proposal.status === 'pending' ? 'primary.main' : 'divider',
      }}
    >
      <Typography color="primary" sx={{ fontWeight: 900 }}>行程修改提案</Typography>
      <Typography variant="body2" sx={{ mt: 0.5 }}>{proposal.explanation}</Typography>
      {compactable ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {statusLabel}
        </Typography>
      ) : null}
      {compactable ? (
        <Button
          size="small"
          aria-expanded={changesExpanded}
          aria-controls={changesId}
          onClick={() => setChangesExpanded((expanded) => !expanded)}
          sx={{ mt: 0.5, px: 0.5 }}
        >
          {changesExpanded ? '收合變更' : '查看變更'}
        </Button>
      ) : null}
      {showChanges ? (
        <Stack id={changesId} spacing={1} sx={{ mt: 1.5 }}>
          {proposal.afterDays.map((after) => {
            const before = proposal.beforeDays.find((day) => day.id === after.id)
            return (
              <Box key={after.id} sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>{dateLabel(after)}</Typography>
                <Typography variant="caption" color="text.secondary">
                  原本：{before?.attractions.map(itineraryItemLabel).join(' → ') || '沒有景點'}
                </Typography>
                <Typography variant="body2">
                  建議：{after.attractions.map(itineraryItemLabel).join(' → ') || '沒有景點'}
                </Typography>
              </Box>
            )
          })}
        </Stack>
      ) : null}
      {proposal.status === 'pending' ? (
        <Stack direction="row" spacing={1} sx={{ mt: 1.5, justifyContent: 'flex-end' }}>
          <Button disabled={busy || !online} onClick={() => onDecision(proposal, false)}>不套用，繼續討論</Button>
          <Button
            variant="contained"
            disabled={busy || !online}
            onClick={() => onDecision(proposal, true)}
          >
            確認儲存
          </Button>
        </Stack>
      ) : !compactable ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {statusLabel}
        </Typography>
      ) : null}
    </Paper>
  )
}
