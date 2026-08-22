import { useState } from 'react'
import AddCommentRoundedIcon from '@mui/icons-material/AddCommentRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import ForumRoundedIcon from '@mui/icons-material/ForumRounded'
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded'
import {
  Avatar,
  Box,
  Chip,
  CircularProgress,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import type { AssistantThread } from '../../../lib/repositories/assistantRepository'

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

export function ConversationList({
  threads,
  threadId,
  creatingThread,
  onSelectThread,
  onCreateThread,
  onRenameThread,
  onDeleteThread,
}: {
  threads: AssistantThread[]
  threadId: string | null
  creatingThread: boolean
  onSelectThread: (threadId: string) => void
  onCreateThread: () => void
  onRenameThread: (threadId: string, title: string) => void
  onDeleteThread: (threadId: string) => void
}) {
  const [menu, setMenu] = useState<{
    anchorEl: HTMLElement
    thread: AssistantThread
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
            onClick={() => onCreateThread()}
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
            <ListItem
              key={thread.id}
              disablePadding
              secondaryAction={
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
              }
              sx={{ my: 0.6 }}
            >
              <ListItemButton
                selected={isSelected}
                onClick={() => onSelectThread(thread.id)}
                sx={{
                  p: 1.25,
                  pr: 6,
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
              </ListItemButton>
            </ListItem>
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
            if (title?.trim()) onRenameThread(thread.id, title.trim())
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
              onDeleteThread(thread.id)
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
