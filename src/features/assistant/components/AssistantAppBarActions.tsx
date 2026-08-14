import { useState } from 'react'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import ForumRoundedIcon from '@mui/icons-material/ForumRounded'
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded'
import SummarizeRoundedIcon from '@mui/icons-material/SummarizeRounded'
import {
  CircularProgress,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
} from '@mui/material'
import type { AssistantConversationController } from '../useAssistantConversation'

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
