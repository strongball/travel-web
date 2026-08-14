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
      <Paper
        elevation={0}
        sx={{
          border: '1px solid rgba(13, 118, 110, 0.12)',
          borderRadius: 3.5,
          p: { xs: 2, sm: 2.5 },
          bgcolor: '#ffffff',
          boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
        }}
      >
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
              sx={{
                fontWeight: 900,
                color: '#0d766e',
                fontSize: { xs: '1.75rem', sm: '2.1rem' },
                letterSpacing: '-0.03em',
                mt: 0.2,
              }}
            >
              {formatAmount(total, currency)}
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddRoundedIcon />}
            onClick={onAdd}
            sx={{
              borderRadius: 2.5,
              px: 3,
              py: 1.1,
              background: 'linear-gradient(135deg, #0d766e 0%, #14b8a6 100%)',
              boxShadow: '0 4px 14px rgba(13, 118, 110, 0.25)',
              alignSelf: { xs: 'stretch', sm: 'auto' },
            }}
          >
            新增費用
          </Button>
        </Stack>
      </Paper>

      <TextField
        placeholder="搜尋費用或收據品項…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        sx={{
          '& .MuiOutlinedInput-root': {
            borderRadius: 3,
            bgcolor: '#ffffff',
          },
        }}
      />

      {groupedExpenses.map((group) => {
        const groupKey = group.id ?? '__general__'
        const isCollapsed = collapsedGroups.has(groupKey)
        const groupTotal = group.expenses.reduce(
          (sum, expense) => sum + convertExpenseAmount(expense, currency, exchangeRates),
          0,
        )
        return (
          <Paper
            key={groupKey}
            elevation={0}
            sx={{
              overflow: 'hidden',
              borderRadius: 3.5,
              border: '1px solid rgba(13, 118, 110, 0.12)',
              bgcolor: '#ffffff',
              boxShadow: '0 4px 16px rgba(15, 23, 42, 0.03)',
            }}
          >
            <ButtonBase
              onClick={() => toggleGroup(group.id)}
              sx={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                bgcolor: 'rgba(13, 118, 110, 0.03)',
                transition: 'background-color 150ms ease',
                '&:hover': { bgcolor: 'rgba(13, 118, 110, 0.06)' },
              }}
            >
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: 'center', px: { xs: 1.75, sm: 2.25 }, py: 1.5 }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontWeight: 850, fontSize: '0.96rem' }}>
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
                  {formatAmount(groupTotal, currency)}
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
              <Stack divider={<Divider sx={{ borderColor: 'rgba(13, 118, 110, 0.06)' }} />}>
                {group.expenses.map((expense) => (
                  <Card key={expense.id} elevation={0} sx={{ borderRadius: 0 }}>
                    <CardActionArea onClick={() => onEdit(expense)}>
                      <CardContent sx={{ p: { xs: 1.75, sm: 2 }, '&:last-child': { pb: { xs: 1.75, sm: 2 } } }}>
                        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography noWrap sx={{ fontWeight: 750, fontSize: '0.94rem' }}>
                              {expense.title}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {formatDate(expense.date)}
                            </Typography>
                          </Box>
                          <Box sx={{ textAlign: 'right' }}>
                            <Typography
                              color="primary.main"
                              sx={{ fontWeight: 850, fontSize: '0.95rem', whiteSpace: 'nowrap' }}
                            >
                              {formatAmount(
                                convertExpenseAmount(expense, currency, exchangeRates),
                                currency,
                              )}
                            </Typography>
                            {expense.currency !== currency ? (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ whiteSpace: 'nowrap', display: 'block' }}
                              >
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
                            sx={{ width: 34, height: 34 }}
                          >
                            <DeleteOutlineRoundedIcon fontSize="small" />
                          </IconButton>
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
                                bgcolor: 'rgba(0, 0, 0, 0.04)',
                                px: 1,
                                py: 0.25,
                                borderRadius: 1.5,
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
                      </CardContent>
                    </CardActionArea>
                  </Card>
                ))}
              </Stack>
            </Collapse>
          </Paper>
        )
      })}

      {expenses.length === 0 ? (
        <Paper
          elevation={0}
          sx={{
            border: '1px solid rgba(13, 118, 110, 0.12)',
            borderRadius: 3.5,
            p: 4,
            textAlign: 'center',
            bgcolor: '#ffffff',
          }}
        >
          <PaidRoundedIcon color="disabled" sx={{ fontSize: 44, opacity: 0.7 }} />
          <Typography color="text.secondary" sx={{ mt: 1, fontWeight: 650 }}>
            這趟旅程還沒有紀錄任何費用
          </Typography>
          <Button
            variant="contained"
            sx={{
              mt: 2,
              borderRadius: 2.5,
              background: 'linear-gradient(135deg, #0d766e 0%, #14b8a6 100%)',
            }}
            onClick={onAdd}
          >
            新增第一筆費用
          </Button>
        </Paper>
      ) : null}
      {expenses.length > 0 && groupedExpenses.length === 0 ? (
        <Paper
          elevation={0}
          sx={{
            border: '1px solid rgba(13, 118, 110, 0.12)',
            borderRadius: 3.5,
            p: 3,
            textAlign: 'center',
            bgcolor: '#ffffff',
          }}
        >
          <Typography color="text.secondary">找不到符合的費用</Typography>
        </Paper>
      ) : null}
    </Stack>
  )
}


