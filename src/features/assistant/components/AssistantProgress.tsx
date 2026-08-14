import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import {
  Avatar,
  CircularProgress,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material'

export function AssistantProgress({ label }: { label: string }) {
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
