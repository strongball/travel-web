import { Alert, Button, Snackbar, Stack } from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { SyncState } from '../hooks/useOfflineSync'

interface SyncNoticeProps {
  count: number
  state: SyncState
  error: string | null
  onRetry: () => void
  onSkip?: () => void
}

export function SyncNotice({ count, state, error, onRetry, onSkip }: SyncNoticeProps) {
  const { t } = useTranslation()
  if (count === 0) return null
  const message = state === 'syncing'
    ? t('app.syncing', { count })
    : state === 'error'
      ? error ?? t('app.syncFailed', { count })
      : t('app.waitingForConnection', { count })
  return (
    <Snackbar open anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
      <Alert
        severity={state === 'error' ? 'error' : state === 'offline' ? 'warning' : 'info'}
        action={state === 'error'
          ? (
            <Stack direction="row" spacing={0.5}>
              {onSkip ? (
                <Button color="inherit" size="small" onClick={onSkip}>
                  {t('common.skip', '略過此筆')}
                </Button>
              ) : null}
              <Button color="inherit" size="small" onClick={onRetry}>
                {t('common.retry')}
              </Button>
            </Stack>
          )
          : undefined}
        sx={{ width: '100%' }}
      >
        {message}
      </Alert>
    </Snackbar>
  )
}
