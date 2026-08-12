import { useMemo, useState } from 'react'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'
import PaidRoundedIcon from '@mui/icons-material/PaidRounded'
import { Box, Button, ButtonBase, Card, CardActionArea, CardContent, Collapse, Divider, IconButton, Paper, Stack, TextField, Typography } from '@mui/material'
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
}: {
  expenses: Expense[]
  attractions: Attraction[]
  currency: string
  exchangeRates?: Record<string, number>
  onAdd: () => void
  onEdit: (expense: Expense) => void
  onDelete: (expense: Expense) => void | Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const total = expenses.reduce(
    (sum, expense) => sum + convertExpenseAmount(expense, currency, exchangeRates),
    0,
  )
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
      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, p: { xs: 1.75, sm: 2 } }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
          <Box><Typography variant="body2" color="text.secondary">旅程總花費</Typography><Typography variant="h4" sx={{ fontWeight: 900 }}>{formatAmount(total, currency)}</Typography></Box>
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={onAdd}>新增費用</Button>
        </Stack>
      </Paper>
      <TextField placeholder="搜尋費用或收據品項" value={query} onChange={(event) => setQuery(event.target.value)} />
      {groupedExpenses.map((group) => {
        const groupKey = group.id ?? '__general__'
        const isCollapsed = collapsedGroups.has(groupKey)
        const groupTotal = group.expenses.reduce(
          (sum, expense) => sum + convertExpenseAmount(expense, currency, exchangeRates),
          0,
        )
        return (
          <Paper key={groupKey} elevation={0} variant="outlined" sx={{ overflow: 'hidden', borderRadius: 3 }}>
            <ButtonBase
              onClick={() => toggleGroup(group.id)}
              sx={{ display: 'block', width: '100%', textAlign: 'left' }}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: { xs: 1.5, sm: 2 }, py: 1.25 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontWeight: 800 }}>{group.title}</Typography>
                  <Typography variant="caption" color="text.secondary">{group.expenses.length} 筆</Typography>
                </Box>
                <Typography color="primary.main" sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
                  {formatAmount(groupTotal, currency)}
                </Typography>
                <ExpandMoreRoundedIcon
                  color="action"
                  sx={{
                    transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)',
                    transition: 'transform 160ms ease',
                  }}
                />
              </Stack>
            </ButtonBase>
            <Collapse in={!isCollapsed} timeout="auto" unmountOnExit>
              <Stack divider={<Divider />}>
                {group.expenses.map((expense) => (
                  <Card key={expense.id} elevation={0} sx={{ borderRadius: 0 }}>
                    <CardActionArea onClick={() => onEdit(expense)}>
                      <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
                        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography noWrap sx={{ fontWeight: 750 }}>{expense.title}</Typography>
                            <Typography variant="caption" color="text.secondary">{formatDate(expense.date)}</Typography>
                          </Box>
                          <Box sx={{ textAlign: 'right' }}>
                            <Typography color="primary.main" sx={{ fontWeight: 850, whiteSpace: 'nowrap' }}>
                              {formatAmount(convertExpenseAmount(expense, currency, exchangeRates), currency)}
                            </Typography>
                            {expense.currency !== currency ? (
                              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                                {formatAmount(expense.amount, expense.currency)}
                              </Typography>
                            ) : null}
                          </Box>
                          <IconButton
                            size="small"
                            color="error"
                            aria-label={`刪除 ${expense.title}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              void onDelete(expense)
                            }}
                          >
                            <DeleteOutlineRoundedIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                        {expense.items.length ? (
                          <Stack direction="row" spacing={0.75} sx={{ mt: 0.5, alignItems: 'center', minWidth: 0 }}>
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0, flex: 1 }}>
                              {expense.items.slice(0, 1).map((item) => item.localizedName || item.sourceName).join(' · ')}
                            </Typography>
                            {expense.items.length > 1 ? (
                              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                                +{expense.items.length - 1} 項
                              </Typography>
                            ) : null}
                          </Stack>
                        ) : null}
                      </CardContent>
                    </CardActionArea>
                  </Card>
                ))}
              </Stack>
            </Collapse>
          </Paper>
        )
      })}
      {expenses.length === 0 ? <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, p: 4, textAlign: 'center' }}><PaidRoundedIcon color="disabled" sx={{ fontSize: 44 }} /><Typography color="text.secondary" sx={{ mt: 1 }}>這趟旅程還沒有費用</Typography><Button sx={{ mt: 2 }} onClick={onAdd}>新增第一筆費用</Button></Paper> : null}
      {expenses.length > 0 && groupedExpenses.length === 0 ? <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, p: 3, textAlign: 'center' }}><Typography color="text.secondary">找不到符合的費用</Typography></Paper> : null}
    </Stack>
  )
}


