import type { ReactNode } from 'react'
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded'
import PaidRoundedIcon from '@mui/icons-material/PaidRounded'
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded'
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded'
import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material'
import { missingExchangeRateCurrencies } from '../../../lib/currencies'
import type { Expense, Itinerary, TodoItem, TripDay } from '../../../types/database'
import { formatAmount, formatDate } from '../travelWorkspaceUtils'

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
  const missingCurrencies = missingExchangeRateCurrencies(
    expenses.map((expense) => expense.currency),
    itinerary.currency,
    itinerary.exchangeRates,
  )
  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
        <StatCard label="行程天數" value={`${days.length} 天`} icon={<CalendarMonthRoundedIcon />} />
        <StatCard label="景點" value={`${attractionCount}`} icon={<PlaceRoundedIcon />} />
        <StatCard label="待辦完成" value={`${completed}/${todos.length || 0}`} icon={<TaskAltRoundedIcon />} />
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
      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 4, p: 2.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 900 }}>旅程摘要</Typography>
        <Stack spacing={1.5} sx={{ mt: 2 }}>
          <SummaryRow label="日期" value={`${formatDate(itinerary.startDate)} — ${formatDate(itinerary.endDate)}`} />
          <SummaryRow label="主要幣別" value={itinerary.currency} />
          <SummaryRow label="費用筆數" value={`${expenses.length} 筆`} />
          <SummaryRow label="自訂匯率" value={`${Object.keys(itinerary.exchangeRates ?? {}).length} 種幣別`} />
        </Stack>
      </Paper>
    </Stack>
  )
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, p: { xs: 1.5, md: 2 }, minWidth: 0 }}><Stack spacing={1} sx={{ minWidth: 0 }}><Box sx={{ color: 'primary.main' }}>{icon}</Box><Typography variant="caption" color="text.secondary" noWrap>{label}</Typography><Typography sx={{ fontWeight: 900, fontSize: { xs: '0.95rem', md: '1.15rem' }, overflowWrap: 'anywhere' }}>{value}</Typography></Stack></Paper>
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}><Typography color="text.secondary">{label}</Typography><Typography sx={{ fontWeight: 700, textAlign: 'right' }}>{value}</Typography></Stack>
}

