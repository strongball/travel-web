import { useEffect, useMemo, useState } from 'react'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded'
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import {
  Alert,
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'
import { MobileShell } from '../../components/MobileShell'
import type { ExpenseItem, ReceiptScanResult } from '../../types/receipt'
import { supportedCurrencies } from '../../lib/currencies'

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
  const [detectedCurrency, setDetectedCurrency] = useState(result.detectedCurrency ?? currency)

  useEffect(() => {
    setItems(toEditableItems(result.items))
    setReceiptTotal(result.receiptTotal)
    setDetectedCurrency(result.detectedCurrency ?? currency)
  }, [currency, result])

  const displayCurrency = detectedCurrency || currency
  const currencyOptions = Array.from(new Set([displayCurrency, ...supportedCurrencies]))

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
      detectedCurrency: displayCurrency || null,
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
              amount: formatAmount(Math.abs(difference), displayCurrency),
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

        <FormControl fullWidth>
          <InputLabel id="receipt-currency-label">{t('review.detectedCurrency')}</InputLabel>
          <Select
            labelId="receipt-currency-label"
            label={t('review.detectedCurrency')}
            value={displayCurrency}
            onChange={(event) => setDetectedCurrency(event.target.value)}
          >
            {currencyOptions.map((item) => (
              <MenuItem key={item} value={item}>{item}</MenuItem>
            ))}
          </Select>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, ml: 1.5 }}>
            {t('review.currencyHelp')}
          </Typography>
        </FormControl>

        <Stack spacing={1.5} component="section" aria-label={t('review.items')}>
          {items.map((item, index) => (
            <ItemCard
              key={item.clientKey}
              item={item}
              index={index}
              count={items.length}
              currency={displayCurrency}
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
              <SummaryRow label={t('review.itemsTotal')} value={formatAmount(itemsTotal, displayCurrency)} />
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
                value={difference === null ? '—' : formatAmount(difference, displayCurrency)}
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

  const itemName = item.localizedName || item.sourceName || label
  const sourceDiffers = Boolean(item.sourceName && item.localizedName && item.sourceName !== item.localizedName)

  return (
    <Accordion
      disableGutters
      elevation={0}
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: 3,
        overflow: 'hidden',
        '&:before': { display: 'none' },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreRoundedIcon />}
        sx={{ minHeight: 56, px: 1.5, '& .MuiAccordionSummary-content': { my: 1 } }}
      >
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', minWidth: 0, width: '100%', pr: 0.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography noWrap sx={{ fontWeight: 700 }}>{itemName}</Typography>
            {sourceDiffers ? <Typography noWrap variant="caption" color="text.secondary">{item.sourceName}</Typography> : null}
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            {item.quantity} × {formatAmount(item.lineTotal, currency)}
          </Typography>
          <IconButton
            aria-label={t('review.moveUp', { label })}
            disabled={index === 0}
            onClick={(event) => { event.stopPropagation(); onMoveUp() }}
            onFocus={(event) => event.stopPropagation()}
            sx={{ width: 40, height: 40 }}
          >
            <ArrowUpwardRoundedIcon />
          </IconButton>
          <IconButton
            aria-label={t('review.moveDown', { label })}
            disabled={index === count - 1}
            onClick={(event) => { event.stopPropagation(); onMoveDown() }}
            onFocus={(event) => event.stopPropagation()}
            sx={{ width: 40, height: 40 }}
          >
            <ArrowDownwardRoundedIcon />
          </IconButton>
          <IconButton
            aria-label={t('review.delete', { label })}
            color="error"
            onClick={(event) => { event.stopPropagation(); onDelete() }}
            onFocus={(event) => event.stopPropagation()}
            sx={{ width: 40, height: 40 }}
          >
            <DeleteOutlineRoundedIcon />
          </IconButton>
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ p: 1.5, pt: 0.5 }}>
        <Stack spacing={1.25}>
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
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField
              fullWidth
              type="number"
              label={t('review.quantity')}
              value={item.quantity}
              slotProps={{ htmlInput: { min: 0.001, step: '0.001', inputMode: 'decimal' } }}
              onChange={(event) => onChange({ quantity: Number.parseFloat(event.target.value) || 0 })}
            />
            <TextField
              fullWidth
              type="number"
              label={t('review.unitPrice', { currency })}
              value={item.unitPrice ?? ''}
              slotProps={{ htmlInput: { min: 0, step: '0.01', inputMode: 'decimal' } }}
              onChange={(event) => onChange({ unitPrice: parseNullableNumber(event.target.value) })}
            />
          </Stack>
          <TextField
            fullWidth
            type="number"
            label={t('review.lineTotal', { currency })}
            value={item.lineTotal ?? ''}
            slotProps={{ htmlInput: { min: 0, step: '0.01', inputMode: 'decimal' } }}
            onChange={(event) => onChange({ lineTotal: parseNullableNumber(event.target.value) })}
          />
        </Stack>
      </AccordionDetails>
    </Accordion>
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
