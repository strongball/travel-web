import type { ReactNode } from 'react'
import { Box } from '@mui/material'
import { PageHeader } from './PageHeader'

export interface MobileShellProps {
  title: string
  children: ReactNode
  onBack?: () => void
  headerAction?: ReactNode
  footer?: ReactNode
  backLabel?: string
}

export function MobileShell({
  title,
  children,
  onBack,
  headerAction,
  footer,
  backLabel,
}: MobileShellProps) {
  return (
    <Box
      sx={{
        minHeight: '100dvh',
        bgcolor: 'grey.50',
        color: 'text.primary',
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: 600,
          minHeight: '100dvh',
          mx: 'auto',
          bgcolor: 'background.default',
          boxShadow: { sm: 3 },
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <PageHeader
          title={title}
          onBack={onBack}
          actions={headerAction}
          backLabel={backLabel}
        />

        <Box component="main" sx={{ flex: 1, minWidth: 0 }}>
          {children}
        </Box>

        {footer ? (
          <Box
            component="footer"
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
            }}
          >
            {footer}
          </Box>
        ) : null}
      </Box>
    </Box>
  )
}
