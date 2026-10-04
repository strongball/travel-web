import { useEffect, useState } from 'react'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import {
  Avatar,
  CircularProgress,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material'

export function AssistantProgress({ label, startedAt }: { label: string; startedAt?: number }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!startedAt) return
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [startedAt])
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
      <Avatar
        sx={{
          width: 32,
          height: 32,
          background: (theme) => theme.palette.primaryGradient,
          boxShadow: (theme) => theme.palette.cardShadow,
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
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'surfaceSubtleBorder',
          boxShadow: (theme) => theme.palette.cardShadow,
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <CircularProgress size={14} thickness={5} sx={{ color: 'primary.main' }} />
          <Typography
            variant="caption"
            aria-live="polite"
            sx={{ fontWeight: 700, color: 'text.secondary' }}
          >
            {label}
          </Typography>
        </Stack>
        {startedAt ? <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          已進行 {elapsed} 秒{elapsed >= 30 ? ' · 處理時間較長，可按停止取消' : ''}
        </Typography> : null}
      </Paper>
    </Stack>
  )
}

export function ConversationLoading() {
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
