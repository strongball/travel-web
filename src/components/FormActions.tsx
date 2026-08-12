import type { ReactNode } from 'react'
import { Box, Stack } from '@mui/material'

export interface FormActionsProps {
  children: ReactNode
  leading?: ReactNode
  contained?: boolean
}

export function FormActions({ children, leading, contained = false }: FormActionsProps) {
  return (
    <Box
      sx={{
        position: 'sticky',
        bottom: 0,
        zIndex: 10,
        px: 2,
        pt: 1.5,
        pb: 'max(12px, env(safe-area-inset-bottom))',
        bgcolor: 'background.paper',
        borderTop: 1,
        borderColor: 'divider',
        ...(contained ? { mx: -2, mb: -2 } : null),
      }}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        {leading}
        {leading ? <Box sx={{ flex: 1 }} /> : null}
        <Box sx={{ flex: leading ? '0 1 auto' : 1, minWidth: 0 }}>{children}</Box>
      </Stack>
    </Box>
  )
}
