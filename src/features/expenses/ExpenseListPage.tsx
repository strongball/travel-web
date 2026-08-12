import AddIcon from '@mui/icons-material/Add'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import LogoutIcon from '@mui/icons-material/Logout'
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined'
import RefreshIcon from '@mui/icons-material/Refresh'
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CircularProgress,
  Container,
  Fab,
  IconButton,
  Stack,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../../components/PageHeader'
import type { Expense } from '../../types/database'

export interface ExpenseListPageProps {
  expenses: Expense[]
  loading?: boolean
  error?: string | null
  onAdd: () => void
  onEdit: (expense: Expense) => void
  onRefresh: () => void | Promise<void>
  onSignOut: () => void | Promise<void>
  locale?: string
}

function formatAmount(amount: number, currency: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString(locale)}`
  }
}

function formatDate(date: string, locale: string) {
  const parsedDate = new Date(`${date.slice(0, 10)}T00:00:00`)

  if (Number.isNaN(parsedDate.getTime())) {
    return date
  }

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(parsedDate)
}

function ExpenseCard({
  expense,
  locale,
  onEdit,
}: {
  expense: Expense
  locale: string
  onEdit: (expense: Expense) => void
}) {
  const { t } = useTranslation()
  const visibleItems = expense.items.slice(0, 1)
  const remainingItems = expense.items.length - visibleItems.length

  return (
    <Card
      component="article"
      elevation={0}
      sx={{ border: 1, borderColor: 'divider', borderRadius: 3 }}
    >
      <CardActionArea
        aria-label={t('list.edit', { title: expense.title })}
        onClick={() => onEdit(expense)}
        sx={{ p: { xs: 1.5, sm: 2 } }}
      >
        <Stack spacing={0.75}>
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography component="h2" noWrap sx={{ fontWeight: 700 }}>
                {expense.title}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                {formatDate(expense.date, locale)}
              </Typography>
            </Box>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              <Typography
                color="primary.main"
                sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}
              >
                {formatAmount(expense.amount, expense.currency, locale)}
              </Typography>
              <EditOutlinedIcon
                aria-hidden="true"
                color="action"
                fontSize="small"
                sx={{ mb: 0.25 }}
              />
            </Stack>
          </Stack>

          {visibleItems.length > 0 ? (
            <Box
              sx={{
                bgcolor: 'action.hover',
                borderRadius: 1.5,
                px: 1,
                py: 0.75,
              }}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                {visibleItems.map((item) => {
                  return (
                    <Typography
                      key={item.id ?? `${item.position}-${item.sourceName}`}
                      noWrap
                      variant="body2"
                      sx={{ flex: 1, minWidth: 0, fontWeight: 600 }}
                    >
                      {item.localizedName || item.sourceName}
                    </Typography>
                  )
                })}
                {remainingItems > 0 ? (
                  <Typography
                    color="text.secondary"
                    noWrap
                    variant="caption"
                    sx={{ flexShrink: 0 }}
                  >
                    {t('list.moreItems', { count: remainingItems })}
                  </Typography>
                ) : null}
              </Stack>
            </Box>
          ) : null}
        </Stack>
      </CardActionArea>
    </Card>
  )
}

export function ExpenseListPage({
  expenses,
  loading = false,
  error = null,
  onAdd,
  onEdit,
  onRefresh,
  onSignOut,
  locale,
}: ExpenseListPageProps) {
  const { t, i18n } = useTranslation()
  const displayLocale = locale ?? i18n.resolvedLanguage ?? i18n.language ?? 'en'

  return (
    <Box
      sx={{
        bgcolor: 'background.default',
        minHeight: '100dvh',
        pb: 'calc(96px + env(safe-area-inset-bottom))',
      }}
    >
      <PageHeader
        title={t('list.title')}
        actions={(
          <>
            <IconButton
              aria-label={t('list.refresh')}
              disabled={loading}
              onClick={() => void onRefresh()}
            >
              <RefreshIcon />
            </IconButton>
            <IconButton aria-label={t('list.signOut')} onClick={() => void onSignOut()}>
              <LogoutIcon />
            </IconButton>
          </>
        )}
      />

      <Container component="main" maxWidth="sm" sx={{ px: 2, py: 2.5 }}>
        {error ? (
          <Alert
            action={
              <Button color="inherit" onClick={() => void onRefresh()} size="small">
                {t('common.retry')}
              </Button>
            }
            severity="error"
            sx={{ mb: 2 }}
          >
            {error}
          </Alert>
        ) : null}

        {loading && expenses.length === 0 ? (
          <Stack
            aria-label={t('list.loading')}
            role="status"
            spacing={2}
            sx={{ alignItems: 'center', justifyContent: 'center', minHeight: '50dvh' }}
          >
            <CircularProgress />
            <Typography color="text.secondary">{t('list.loading')}</Typography>
          </Stack>
        ) : expenses.length === 0 ? (
          <Stack
            spacing={2}
            sx={{
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '50dvh',
              textAlign: 'center',
            }}
          >
            <ReceiptLongOutlinedIcon
              aria-hidden="true"
              color="disabled"
              sx={{ fontSize: 64 }}
            />
            <Box>
              <Typography component="h2" sx={{ fontWeight: 700 }} variant="h6">
                {t('list.emptyTitle')}
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 0.5 }} variant="body2">
                {t('list.emptySubtitle')}
              </Typography>
            </Box>
            <Button onClick={onAdd} startIcon={<AddIcon />} variant="contained">
              {t('list.add')}
            </Button>
          </Stack>
        ) : (
          <Stack role="list" spacing={1.5}>
            {expenses.map((expense) => (
              <Box key={expense.id} role="listitem">
                <ExpenseCard
                  expense={expense}
                  locale={displayLocale}
                  onEdit={onEdit}
                />
              </Box>
            ))}
          </Stack>
        )}
      </Container>

      {expenses.length > 0 ? (
        <Fab
          aria-label={t('list.add')}
          color="primary"
          onClick={onAdd}
          sx={{
            bottom: 'calc(20px + env(safe-area-inset-bottom))',
            position: 'fixed',
            right: 20,
          }}
        >
          <AddIcon />
        </Fab>
      ) : null}
    </Box>
  )
}

export default ExpenseListPage
