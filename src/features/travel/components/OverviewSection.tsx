import { useMemo, type ReactNode } from 'react'
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded'
import PaidRoundedIcon from '@mui/icons-material/PaidRounded'
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded'
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded'
import { Alert, Box, Button, Card, LinearProgress, Stack, Typography } from '@mui/material'
import { missingExchangeRateCurrencies } from '../../../lib/currencies'
import type { Expense, Itinerary, TodoItem, TripDay } from '../../../types/database'
import { convertExpenseAmount, formatAmount, formatDate } from '../travelWorkspaceUtils'

export function OverviewSection({
  itinerary,
  days,
  expenses,
  todos,
  totalAmount,
  onEditTrip,
}: {
  itinerary: Itinerary
  days: TripDay[]
  expenses: Expense[]
  todos: TodoItem[]
  totalAmount: number | null
  onEditTrip?: () => void
}) {
  const attractionCount = days.reduce((sum, day) => sum + day.attractions.length, 0)
  const completed = todos.filter((todo) => todo.isCompleted).length
  const todoPercentage = todos.length > 0 ? Math.round((completed / todos.length) * 100) : 0
  const missingCurrencies = missingExchangeRateCurrencies(
    expenses.map((expense) => expense.currency),
    itinerary.currency,
    itinerary.exchangeRates,
  )

  const dailyExpenses = useMemo(() => {
    if (expenses.length === 0 || totalAmount === null) return []
    const map = new Map<string, number>()
    expenses.forEach((expense) => {
      const d = expense.date?.slice(0, 10) || '未指定日期'
      const converted = convertExpenseAmount(expense, itinerary.currency, itinerary.exchangeRates)
      map.set(d, (map.get(d) ?? 0) + converted)
    })
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [expenses, itinerary.currency, itinerary.exchangeRates, totalAmount])

  const maxDayAmount = useMemo(
    () => (dailyExpenses.length > 0 ? Math.max(...dailyExpenses.map(([, amt]) => amt), 1) : 1),
    [dailyExpenses],
  )

  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
        <StatCard label="行程天數" value={`${days.length} 天`} icon={<CalendarMonthRoundedIcon />} />
        <StatCard label="景點" value={`${attractionCount}`} icon={<PlaceRoundedIcon />} />
        <StatCard
          label="待辦完成"
          value={`${completed}/${todos.length || 0}`}
          icon={<TaskAltRoundedIcon />}
          progress={todos.length > 0 ? { value: todoPercentage, label: `${todoPercentage}%` } : undefined}
        />
        <StatCard label="總花費" value={totalAmount === null ? '尚未完成換算' : formatAmount(totalAmount, itinerary.currency)} icon={<PaidRoundedIcon />} />
      </Box>
      {missingCurrencies.length > 0 ? (
        <Alert
          severity="warning"
          action={
            onEditTrip ? (
              <Button color="inherit" size="small" onClick={onEditTrip} sx={{ fontWeight: 700 }}>
                立即設定
              </Button>
            ) : undefined
          }
        >
          尚未設定 {missingCurrencies.join('、')} 對 {itinerary.currency} 的匯率，請完成設定後再查看總額。
        </Alert>
      ) : null}

      {dailyExpenses.length > 0 && totalAmount !== null && totalAmount > 0 ? (
        <Card sx={{ p: { xs: 2, sm: 2.5 } }}>
          <Typography variant="h6" sx={{ fontWeight: 900 }}>
            每日花費分析
          </Typography>
          <Stack spacing={1.75} sx={{ mt: 2 }}>
            {dailyExpenses.map(([date, amount]) => {
              const proportion = Math.round((amount / (totalAmount || 1)) * 100)
              const barValue = Math.round((amount / maxDayAmount) * 100)
              return (
                <Box key={date}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 750 }}>
                      {formatDate(date)}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800, color: 'primary.main' }}>
                      {formatAmount(amount, itinerary.currency)}{' '}
                      <Typography component="span" variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                        ({proportion}%)
                      </Typography>
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={barValue}
                    sx={{
                      height: 7,
                      borderRadius: 4,
                      bgcolor: 'action.hover',
                      '& .MuiLinearProgress-bar': {
                        borderRadius: 4,
                        bgcolor: 'primary.main',
                      },
                    }}
                  />
                </Box>
              )
            })}
          </Stack>
        </Card>
      ) : null}

      <Card sx={{ p: 2.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 900 }}>旅程摘要</Typography>
        <Stack spacing={1.5} sx={{ mt: 2 }}>
          <SummaryRow label="日期" value={`${formatDate(itinerary.startDate)} — ${formatDate(itinerary.endDate)}`} />
          <SummaryRow label="主要幣別" value={itinerary.currency} />
          <SummaryRow label="費用筆數" value={`${expenses.length} 筆`} />
          <SummaryRow label="自訂匯率" value={`${Object.keys(itinerary.exchangeRates ?? {}).length} 種幣別`} />
        </Stack>
      </Card>
    </Stack>
  )
}

function StatCard({
  label,
  value,
  icon,
  progress,
}: {
  label: string
  value: string
  icon: ReactNode
  progress?: { value: number; label: string }
}) {
  return (
    <Card sx={{ p: { xs: 1.5, md: 2 }, minWidth: 0 }}>
      <Stack spacing={1} sx={{ minWidth: 0 }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ color: 'primary.main' }}>{icon}</Box>
          {progress ? (
            <Typography variant="caption" sx={{ fontWeight: 800, color: 'primary.main' }}>
              {progress.label}
            </Typography>
          ) : null}
        </Stack>
        <Typography variant="caption" color="text.secondary" noWrap>{label}</Typography>
        <Typography sx={{ fontWeight: 900, fontSize: { xs: '0.95rem', md: '1.15rem' }, overflowWrap: 'anywhere' }}>{value}</Typography>
        {progress ? (
          <LinearProgress
            variant="determinate"
            value={progress.value}
            sx={{
              height: 5,
              borderRadius: 3,
              bgcolor: 'action.hover',
              '& .MuiLinearProgress-bar': {
                borderRadius: 3,
                bgcolor: 'primary.main',
              },
            }}
          />
        ) : null}
      </Stack>
    </Card>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
      <Typography color="text.secondary">{label}</Typography>
      <Typography sx={{ fontWeight: 700, textAlign: 'right' }}>{value}</Typography>
    </Stack>
  )
}


