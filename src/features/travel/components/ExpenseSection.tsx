import { useMemo, useState } from 'react'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'
import PaidRoundedIcon from '@mui/icons-material/PaidRounded'
import { Alert, Box, Button, ButtonBase, Card, CardActionArea, Collapse, Divider, IconButton, Stack, TextField, Typography } from '@mui/material'
import { getExchangeRate, missingExchangeRateCurrencies } from '../../../lib/currencies'
import type { Attraction, Expense } from '../../../types/database'
import { convertExpenseAmount, formatAmount, formatDate } from '../travelWorkspaceUtils'

export function ExpenseSection({
  expenses,
  attractions,
  currency,
  exchangeRates,
  onAdd,
  onEdit,
  onDelete,
  onEditTrip,
}: {
  expenses: Expense[]
  attractions: Attraction[]
  currency: string
  exchangeRates?: Record<string, number>
  onAdd: () => void
  onEdit: (expense: Expense) => void
  onDelete: (expense: Expense) => void | Promise<void>
  onEditTrip?: () => void
}) {
  const [query, setQuery] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const missingCurrencies = missingExchangeRateCurrencies(
    expenses.map((expense) => expense.currency),
    currency,
    exchangeRates,
  )
  const total = missingCurrencies.length === 0
    ? expenses.reduce(
        (sum, expense) => sum + convertExpenseAmount(expense, currency, exchangeRates),
        0,
      )
    : null
  const visibleExpenses = expenses.filter((expense) => {
    const haystack = [
      expense.title,
      expense.note,
      ...expense.items.map((item) => item.localizedName || item.sourceName),
    ].join(' ').toLowerCase()
    return haystack.includes(query.trim().toLowerCase())
  })

  const attractionById = useMemo(
    () => new Map(attractions.map((attraction) => [attraction.id, attraction])),
    [attractions],
  )
  const groupedExpenses = useMemo(() => {
    const groups = new Map<string, { id: string | null; title: string; expenses: Expense[] }>()
    visibleExpenses.forEach((expense) => {
      const groupId = expense.attractionId ?? '__general__'
      const attraction = expense.attractionId ? attractionById.get(expense.attractionId) : null
      const group = groups.get(groupId) ?? {
        id: expense.attractionId,
        title: attraction?.name ?? (expense.attractionId ? '未命名景點' : '一般花費'),
        expenses: [],
      }
      group.expenses.push(expense)
      groups.set(groupId, group)
    })
    return Array.from(groups.values()).sort((a, b) => {
      if (a.id === null) return 1
      if (b.id === null) return -1
      return attractions.findIndex((attraction) => attraction.id === a.id) -
        attractions.findIndex((attraction) => attraction.id === b.id)
    })
  }, [attractionById, attractions, visibleExpenses])

  const toggleGroup = (groupId: string | null) => {
    const key = groupId ?? '__general__'
    setCollapsedGroups((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <Stack spacing={2}>
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
          尚未設定 {missingCurrencies.join('、')} 對 {currency} 的匯率，請編輯行程完成設定；原始記帳資料不會被修改。
        </Alert>
      ) : null}
      <Card sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
        >
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}
            >
              旅程總花費
            </Typography>
            <Typography
              variant="h4"
              color="primary.main"
              sx={{
                fontWeight: 900,
                fontSize: { xs: '1.75rem', sm: '2.1rem' },
                letterSpacing: '-0.03em',
                mt: 0.2,
              }}
            >
              {total === null ? '尚未完成換算' : formatAmount(total, currency)}
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddRoundedIcon />}
            onClick={onAdd}
            sx={{ alignSelf: { xs: 'stretch', sm: 'auto' } }}
          >
            新增費用
          </Button>
        </Stack>
      </Card>

      <TextField
        placeholder="搜尋費用或收據品項…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {groupedExpenses.map((group) => {
        const groupKey = group.id ?? '__general__'
        const isCollapsed = collapsedGroups.has(groupKey)
        const groupMissingCurrencies = missingExchangeRateCurrencies(
          group.expenses.map((expense) => expense.currency),
          currency,
          exchangeRates,
        )
        const groupTotal = groupMissingCurrencies.length === 0
          ? group.expenses.reduce(
              (sum, expense) => sum + convertExpenseAmount(expense, currency, exchangeRates),
              0,
            )
          : null
        return (
          <Card
            key={groupKey}
            sx={{ overflow: 'hidden' }}
          >
            <ButtonBase
              onClick={() => toggleGroup(group.id)}
              sx={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                bgcolor: 'action.hover',
              }}
            >
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: 'center', px: { xs: 1.75, sm: 2.25 }, py: 1.5 }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontWeight: 850 }}>
                    {group.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {group.expenses.length} 筆費用
                  </Typography>
                </Box>
                <Typography
                  color="primary.main"
                  sx={{ fontWeight: 900, fontSize: '1rem', whiteSpace: 'nowrap', mr: 0.5 }}
                >
                  {groupTotal === null ? '尚未換算' : formatAmount(groupTotal, currency)}
                </Typography>
                <ExpandMoreRoundedIcon
                  color="action"
                  sx={{
                    transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)',
                    transition: 'transform 180ms ease',
                  }}
                />
              </Stack>
            </ButtonBase>
            <Collapse in={!isCollapsed} timeout="auto" unmountOnExit>
              <Stack divider={<Divider />}>
                {group.expenses.map((expense) => (
                  <Card
                    key={expense.id}
                    elevation={0}
                    sx={{
                      borderRadius: 0,
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <CardActionArea
                      onClick={() => onEdit(expense)}
                      sx={{ flex: 1, minWidth: 0, p: { xs: 1.75, sm: 2 } }}
                    >
                      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography noWrap sx={{ fontWeight: 750 }}>
                            {expense.title}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatDate(expense.date)}
                          </Typography>
                        </Box>
                        <Box sx={{ textAlign: 'right' }}>
                          <Typography
                            color="primary.main"
                            sx={{ fontWeight: 850, whiteSpace: 'nowrap' }}
                          >
                            {getExchangeRate(expense.currency, currency, exchangeRates) === null
                              ? formatAmount(expense.amount, expense.currency)
                              : formatAmount(
                                  convertExpenseAmount(expense, currency, exchangeRates),
                                  currency,
                                )}
                          </Typography>
                          {expense.currency !== currency && getExchangeRate(expense.currency, currency, exchangeRates) !== null ? (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ whiteSpace: 'nowrap', display: 'block' }}
                            >
                              {formatAmount(expense.amount, expense.currency)}
                            </Typography>
                          ) : null}
                        </Box>
                      </Stack>
                      {expense.items.length ? (
                        <Stack
                          direction="row"
                          spacing={0.75}
                          sx={{ mt: 0.75, alignItems: 'center', minWidth: 0 }}
                        >
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            noWrap
                            sx={{
                              minWidth: 0,
                              flex: 1,
                              bgcolor: 'action.hover',
                              px: 1,
                              py: 0.25,
                              borderRadius: 1,
                            }}
                          >
                            {expense.items
                              .slice(0, 2)
                              .map((item) => item.localizedName || item.sourceName)
                              .join(' · ')}
                            {expense.items.length > 2
                              ? ` 等共 ${expense.items.length} 項`
                              : ''}
                          </Typography>
                        </Stack>
                      ) : null}
                    </CardActionArea>
                    <Box sx={{ pr: { xs: 1.25, sm: 1.75 }, flexShrink: 0 }}>
                      <IconButton
                        size="small"
                        color="error"
                        aria-label={`刪除 ${expense.title}`}
                        onClick={() => void onDelete(expense)}
                      >
                        <DeleteOutlineRoundedIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Card>
                ))}
              </Stack>
            </Collapse>
          </Card>
        )
      })}

      {expenses.length === 0 ? (
        <Card sx={{ p: 4, textAlign: 'center' }}>
          <PaidRoundedIcon color="disabled" sx={{ fontSize: 44, opacity: 0.7 }} />
          <Typography color="text.secondary" sx={{ mt: 1, fontWeight: 650 }}>
            這趟旅程還沒有紀錄任何費用
          </Typography>
          <Button
            variant="contained"
            sx={{ mt: 2 }}
            onClick={onAdd}
          >
            新增第一筆費用
          </Button>
        </Card>
      ) : null}
      {expenses.length > 0 && groupedExpenses.length === 0 ? (
        <Card sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">找不到符合的費用</Typography>
        </Card>
      ) : null}
    </Stack>
  )
}

