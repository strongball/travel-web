import type { ReactNode } from 'react'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import { Box, IconButton, Stack, Toolbar, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'

export interface PageHeaderProps {
  title: string
  subtitle?: ReactNode
  onBack?: () => void
  actions?: ReactNode
  backLabel?: string
}

export function PageHeader({
  title,
  subtitle,
  onBack,
  actions,
  backLabel,
}: PageHeaderProps) {
  const { t } = useTranslation()

  return (
    <Box
      component="header"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        bgcolor: 'rgba(255, 255, 255, 0.92)',
        backdropFilter: 'blur(16px)',
        borderBottom: 1,
        borderColor: 'divider',
        pt: 'env(safe-area-inset-top)',
      }}
    >
      <Toolbar
        sx={{
          minHeight: { xs: 52, sm: 56 },
          px: { xs: 0.75, sm: 2 },
          gap: { xs: 0.25, sm: 0.5 },
        }}
      >
        <Box sx={{ width: { xs: 44, sm: 48 }, flexShrink: 0, display: 'flex', justifyContent: 'flex-start' }}>
          {onBack ? (
            <IconButton
              aria-label={backLabel ?? t('common.back')}
              onClick={onBack}
              sx={{ width: 44, height: 44 }}
            >
              <ArrowBackRoundedIcon />
            </IconButton>
          ) : null}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            component="h1"
            noWrap
            variant="h6"
            sx={{
              fontSize: { xs: '1.05rem', sm: '1.25rem' },
              fontWeight: 800,
              lineHeight: 1.15,
            }}
          >
            {title}
          </Typography>
          {subtitle ? (
            <Typography
              noWrap
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 0.2, fontSize: { xs: '0.68rem', sm: '0.75rem' } }}
            >
              {subtitle}
            </Typography>
          ) : null}
        </Box>
        {actions ? (
          <Stack direction="row" spacing={{ xs: 0, sm: 0.25 }} sx={{ alignItems: 'center', flexShrink: 0 }}>
            {actions}
          </Stack>
        ) : null}
      </Toolbar>
    </Box>
  )
}
