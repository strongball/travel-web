import type { ReactNode } from 'react'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import {
  AppBar,
  Box,
  IconButton,
  Toolbar,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()
  const resolvedBackLabel = backLabel ?? t('common.back')

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
        <AppBar
          color="inherit"
          elevation={0}
          position="sticky"
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            pt: 'env(safe-area-inset-top)',
          }}
        >
          <Toolbar sx={{ minHeight: 56, px: { xs: 1, sm: 2 } }}>
            <Box sx={{ width: 48, display: 'flex', justifyContent: 'flex-start' }}>
              {onBack ? (
                <IconButton
                  aria-label={resolvedBackLabel}
                  edge="start"
                  onClick={onBack}
                  sx={{ width: 48, height: 48 }}
                >
                  <ArrowBackRoundedIcon />
                </IconButton>
              ) : null}
            </Box>
            <Typography
              component="h1"
              variant="h6"
              noWrap
              sx={{ flex: 1, textAlign: 'center', fontWeight: 700 }}
            >
              {title}
            </Typography>
            <Box
              sx={{
                width: 48,
                minHeight: 48,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
              }}
            >
              {headerAction}
            </Box>
          </Toolbar>
        </AppBar>

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
