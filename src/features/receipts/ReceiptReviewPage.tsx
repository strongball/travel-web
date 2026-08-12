import { useEffect, useMemo, useState } from 'react'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded'
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { MobileShell } from '../../components/MobileShell'
import type { ExpenseItem, ReceiptScanResult } from '../../types/receipt'

type EditableItem = ExpenseItem & { clientKey: string }

export interface ReceiptReviewPageProps {
  result: ReceiptScanResult
  onApply: (result: ReceiptScanResult) => void
  onCancel: () => void
  currency?: string
}

export function ReceiptReviewPage({
  result,
  onApply,
  onCancel,
  currency = 'TWD',
}: ReceiptReviewPageProps) {
  const { t } = useTranslation()
  const [items, setItems] = useState<EditableItem[]>(() => toEditableItems(result.items))
  const [receiptTotal, setReceiptTotal] = useState<number | null>(result.receiptTotal)

  useEffect(() => {
    setItems(toEditableItems(result.items))
    setReceiptTotal(result.receiptTotal)
  }, [result])

  const itemsTotal = useMemo(
    () => roundAmount(items.reduce((sum, item) => sum + (item.lineTotal ?? 0), 0)),
    [items],
  )
  const difference =
    receiptTotal === null ? null : roundAmount(receiptTotal - itemsTotal)
  const hasMismatch = difference !== null && Math.abs(difference) >= 0.005
  const isValid =
    items.length > 0 &&
    items.every(
      (item) =>
        item.sourceName.trim() &&
        item.localizedName.trim() &&
        item.quantity > 0 &&
        item.lineTotal !== null,
    )

  const updateItem = (index: number, changes: Partial<ExpenseItem>) => {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...changes } : item,
      ),
    )
  }

  const addItem = () => {
    setItems((current) => [
      ...current,
      {
        clientKey: createClientKey(),
        position: current.length,
        sourceName: '',
        localizedName: '',
        quantity: 1,
        unitPrice: null,
        lineTotal: null,
      },
    ])
  }

  const removeItem = (index: number) => {
    setItems((current) =>
      normalizePositions(current.filter((_, itemIndex) => itemIndex !== index)),
    )
  }

  const moveItem = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return
    setItems((current) => {
      const reordered = [...current]
      const [moved] = reordered.splice(from, 1)
      if (!moved) return current
      reordered.splice(to, 0, moved)
      return normalizePositions(reordered)
    })
  }

  const applyResult = () => {
    onApply({
      ...result,
      items: normalizePositions(items).map(({ clientKey: _clientKey, ...item }) => item),
      receiptTotal,
      itemsTotal,
      difference,
    })
  }

  return (
    <MobileShell
      title={t('review.title')}
      onBack={onCancel}
      footer={
        <Stack direction="row" spacing={1.5}>
          <Button
            fullWidth
            size="large"
            variant="outlined"
            onClick={onCancel}
            sx={{ minHeight: 48, borderRadius: 3 }}
          >
            {t('common.cancel')}
          </Button>
          <Button
            fullWidth
            size="large"
            variant="contained"
            disabled={!isValid}
            onClick={applyResult}
            sx={{ minHeight: 48, borderRadius: 3, fontWeight: 700 }}
          >
            {t('review.apply')}
          </Button>
        </Stack>
      }
    >
      <Stack spacing={2} sx={{ p: 2, pb: 4 }}>
        <Box>
          <Typography variant="body2" color="text.secondary">
            {t('review.result')}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {t('review.heading')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t('review.help')}
          </Typography>
        </Box>

        {hasMismatch ? (
          <Alert severity="warning">
            {t('review.mismatch', {
              amount: formatAmount(Math.abs(difference), currency),
            })}
          </Alert>
        ) : receiptTotal !== null ? (
          <Alert severity="success">{t('review.matched')}</Alert>
        ) : (
          <Alert severity="info">{t('review.totalMissing')}</Alert>
        )}

        {!isValid ? (
          <Alert severity="error">
            {t('review.invalid')}
          </Alert>
        ) : null}

        <Stack spacing={1.5} component="section" aria-label={t('review.items')}>
          {items.map((item, index) => (
            <ItemCard
              key={item.clientKey}
              item={item}
              index={index}
              count={items.length}
              currency={currency}
              onChange={(changes) => updateItem(index, changes)}
              onDelete={() => removeItem(index)}
              onMoveUp={() => moveItem(index, index - 1)}
              onMoveDown={() => moveItem(index, index + 1)}
            />
          ))}

          {items.length === 0 ? (
            <Card variant="outlined" sx={{ borderStyle: 'dashed', borderRadius: 3 }}>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography color="text.secondary">{t('review.empty')}</Typography>
              </CardContent>
            </Card>
          ) : null}

          <Button
            variant="outlined"
            startIcon={<AddRoundedIcon />}
            onClick={addItem}
            sx={{ minHeight: 48, borderRadius: 3 }}
          >
            {t('review.addItem')}
          </Button>
        </Stack>

        <Card variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent>
            <Stack spacing={1.5}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>{t('review.totals')}</Typography>
              <SummaryRow label={t('review.itemsTotal')} value={formatAmount(itemsTotal, currency)} />
              <TextField
                fullWidth
                type="number"
                label={t('review.receiptTotal')}
                value={receiptTotal ?? ''}
                slotProps={{ htmlInput: { min: 0, step: '0.01', inputMode: 'decimal' } }}
                onChange={(event) => setReceiptTotal(parseNullableNumber(event.target.value))}
              />
              <Divider />
              <SummaryRow
                label={t('review.difference')}
                value={difference === null ? '—' : formatAmount(difference, currency)}
                emphasize={hasMismatch}
              />
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </MobileShell>
  )
}

interface ItemCardProps {
  item: EditableItem
  index: number
  count: number
  currency: string
  onChange: (changes: Partial<ExpenseItem>) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

function ItemCard({
  item,
  index,
  count,
  currency,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: ItemCardProps) {
  const { t } = useTranslation()
  const label = t('review.item', { count: index + 1 })

  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <Typography variant="subtitle1" sx={{ flex: 1, fontWeight: 700 }}>
              {label}
            </Typography>
            <IconButton
              aria-label={t('review.moveUp', { label })}
              disabled={index === 0}
              onClick={onMoveUp}
              sx={{ width: 44, height: 44 }}
            >
              <ArrowUpwardRoundedIcon />
            </IconButton>
            <IconButton
              aria-label={t('review.moveDown', { label })}
              disabled={index === count - 1}
              onClick={onMoveDown}
              sx={{ width: 44, height: 44 }}
            >
              <ArrowDownwardRoundedIcon />
            </IconButton>
            <IconButton
              aria-label={t('review.delete', { label })}
              color="error"
              onClick={onDelete}
              sx={{ width: 44, height: 44 }}
            >
              <DeleteOutlineRoundedIcon />
            </IconButton>
          </Stack>

          <TextField
            fullWidth
            required
            label={t('review.sourceName')}
            value={item.sourceName}
            onChange={(event) => onChange({ sourceName: event.target.value })}
          />
          <TextField
            fullWidth
            label={t('review.localizedName')}
            value={item.localizedName}
            onChange={(event) => onChange({ localizedName: event.target.value })}
          />

          <Stack direction="row" spacing={1}>
            <TextField
              fullWidth
              type="number"
              label={t('review.quantity')}
              value={item.quantity}
              slotProps={{ htmlInput: { min: 0.001, step: '0.001', inputMode: 'decimal' } }}
              onChange={(event) =>
                onChange({ quantity: Number.parseFloat(event.target.value) || 0 })
              }
            />
            <TextField
              fullWidth
              type="number"
              label={t('review.unitPrice', { currency })}
              value={item.unitPrice ?? ''}
              slotProps={{ htmlInput: { min: 0, step: '0.01', inputMode: 'decimal' } }}
              onChange={(event) =>
                onChange({ unitPrice: parseNullableNumber(event.target.value) })
              }
            />
          </Stack>

          <TextField
            fullWidth
            type="number"
            label={t('review.lineTotal', { currency })}
            value={item.lineTotal ?? ''}
            slotProps={{ htmlInput: { min: 0, step: '0.01', inputMode: 'decimal' } }}
            onChange={(event) =>
              onChange({ lineTotal: parseNullableNumber(event.target.value) })
            }
          />
        </Stack>
      </CardContent>
    </Card>
  )
}

interface SummaryRowProps {
  label: string
  value: string
  emphasize?: boolean
}

function SummaryRow({ label, value, emphasize = false }: SummaryRowProps) {
  return (
    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
      <Typography color="text.secondary">{label}</Typography>
      <Typography
        color={emphasize ? 'warning.main' : 'text.primary'}
        sx={{ fontWeight: 700 }}
      >
        {value}
      </Typography>
    </Stack>
  )
}

function toEditableItems(items: readonly ExpenseItem[]): EditableItem[] {
  return items.map((item, index) => ({
    ...item,
    position: index,
    clientKey: item.id ?? `${index}-${item.sourceName}-${createClientKey()}`,
  }))
}

function normalizePositions(items: readonly EditableItem[]): EditableItem[] {
  return items.map((item, position) => ({ ...item, position }))
}

function parseNullableNumber(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function roundAmount(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000
}

function formatAmount(value: number | null, currency: string): string {
  if (value === null) return '—'
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 4,
    }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

function createClientKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`
}
