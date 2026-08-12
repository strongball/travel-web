import { Alert, Button, Snackbar } from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { SyncState } from '../hooks/useOfflineSync'

interface SyncNoticeProps {
  count: number
  state: SyncState
  error: string | null
  onRetry: () => void
}

export function SyncNotice({ count, state, error, onRetry }: SyncNoticeProps) {
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
          ? <Button color="inherit" size="small" onClick={onRetry}>{t('common.retry')}</Button>
          : undefined}
        sx={{ width: '100%' }}
      >
        {message}
      </Alert>
    </Snackbar>
  )
}
