import { Box, Skeleton, Stack, Typography } from '@mui/material'

export function AssistantTypingIndicator() {
  return <Stack direction="row" spacing={0.75} role="status" aria-label="助理正在生成回覆"
    sx={{ width: 'fit-content', px: 1.25, py: 1.25, alignItems: 'center',
      '@keyframes assistant-dot-pulse': { '0%, 70%, 100%': { opacity: 0.3, transform: 'translateY(0)' }, '35%': { opacity: 1, transform: 'translateY(-3px)' } },
    }}>
    {[0, 1, 2].map((index) => <Box key={index} aria-hidden="true" sx={{
      width: 6, height: 6, borderRadius: '50%', bgcolor: 'primary.main',
      animation: 'assistant-dot-pulse 1.4s ease-in-out infinite', animationDelay: `${index * 0.16}s`,
      '@media (prefers-reduced-motion: reduce)': { animation: 'none', opacity: 0.6 },
    }} />)}
  </Stack>
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
