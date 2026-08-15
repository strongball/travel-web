import { useEffect, useState } from 'react'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import {
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { PageHeader } from '../../../components/PageHeader'
import {
  getCurrencyInfo,
  missingExchangeRateCurrencies,
  normalizeCurrency,
  normalizeExchangeRates,
  rebaseExchangeRates,
  supportedCurrencies,
} from '../../../lib/currencies'
import type { Itinerary } from '../../../types/database'
import { ExchangeRateEditor } from './ExchangeRateEditor'

interface TripEditorDialogProps {
  itinerary: Itinerary | null
  saving: boolean
  canDelete: boolean
  expenseCurrencies?: readonly string[]
  onClose: () => void
  onChange: (itinerary: Itinerary) => void
  onDateChange: (field: 'startDate' | 'endDate', value: string) => void
  onDelete: () => void
  onSave: () => void
}

export function TripEditorDialog({
  itinerary,
  saving,
  canDelete,
  expenseCurrencies = [],
  onClose,
  onChange,
  onDateChange,
  onDelete,
  onSave,
}: TripEditorDialogProps) {
  const [newTag, setNewTag] = useState('')
  const [newRateCurrency, setNewRateCurrency] = useState('')
  const [pendingRateCurrencies, setPendingRateCurrencies] = useState<string[]>([])

  useEffect(() => {
    setNewTag('')
    setNewRateCurrency('')
    setPendingRateCurrencies([])
  }, [itinerary?.id])

  const categories = itinerary?.todoCategories && itinerary.todoCategories.length > 0
    ? itinerary.todoCategories
    : ['行前準備', '旅途中', '其他']

  const handleAddCategory = () => {
    if (!itinerary) return
    const trimmed = newTag.trim()
    if (!trimmed || categories.includes(trimmed)) return
    onChange({
      ...itinerary,
      todoCategories: [...categories, trimmed],
    })
    setNewTag('')
  }

  const handleDeleteCategory = (catToDelete: string) => {
    if (!itinerary) return
    const next = categories.filter((c) => c !== catToDelete)
    onChange({
      ...itinerary,
      todoCategories: next.length > 0 ? next : ['其他'],
    })
  }

  const canonicalCurrencies = (currencies: readonly string[]) => Array.from(new Set(
    currencies
      .map((currency) => normalizeCurrency(currency))
      .filter((currency): currency is string => Boolean(currency)),
  ))

  const rateCurrencies = itinerary
    ? canonicalCurrencies([
        itinerary.currency,
        ...Object.keys(normalizeExchangeRates(itinerary.currency, itinerary.exchangeRates)),
        ...pendingRateCurrencies,
        ...expenseCurrencies,
      ])
    : []
  const missingCurrencies = itinerary
    ? missingExchangeRateCurrencies(expenseCurrencies, itinerary.currency, itinerary.exchangeRates)
    : []
  const availableRateCurrencies = supportedCurrencies.filter(
    (currency) => !rateCurrencies.includes(currency),
  )

  const handleCurrencyChange = (nextCurrency: string) => {
    if (!itinerary || nextCurrency === itinerary.currency) return
    const currentRates = normalizeExchangeRates(itinerary.currency, itinerary.exchangeRates)
    const nextRates = rebaseExchangeRates(currentRates, itinerary.currency, nextCurrency)
    const currenciesToKeepVisible = canonicalCurrencies([
      ...Object.keys(currentRates),
      ...expenseCurrencies,
    ])
    setPendingRateCurrencies((current) => canonicalCurrencies([
      ...current,
      ...currenciesToKeepVisible.filter((currency) => currency !== nextCurrency),
    ]).filter((currency) => currency !== nextCurrency && !Object.hasOwn(nextRates, currency)))
    onChange({
      ...itinerary,
      currency: nextCurrency,
      exchangeRates: nextRates,
    })
  }

  const handleAddRateCurrency = (currencyToAdd?: string) => {
    const target = currencyToAdd || newRateCurrency
    if (!target || rateCurrencies.includes(target)) return
    setPendingRateCurrencies((current) => [...current, target])
    setNewRateCurrency('')
  }

  const handleRateChange = (currency: string, rawValue: string) => {
    if (!itinerary || currency === itinerary.currency) return
    const nextRates = normalizeExchangeRates(itinerary.currency, itinerary.exchangeRates)
    if (!rawValue.trim()) {
      delete nextRates[currency]
    } else {
      const nextRate = Number(rawValue)
      if (!Number.isFinite(nextRate) || nextRate <= 0) return
      nextRates[currency] = nextRate
      setPendingRateCurrencies((current) => current.filter((item) => item !== currency))
    }
    onChange({ ...itinerary, exchangeRates: nextRates })
  }

  const handleRemoveRateCurrency = (currency: string) => {
    if (!itinerary || currency === itinerary.currency) return
    const nextRates = normalizeExchangeRates(itinerary.currency, itinerary.exchangeRates)
    delete nextRates[currency]
    setPendingRateCurrencies((current) => current.filter((item) => item !== currency))
    onChange({ ...itinerary, exchangeRates: nextRates })
  }

  return (
    <Dialog open={Boolean(itinerary)} onClose={onClose} fullScreen>
      <PageHeader
        title={itinerary?.title ? '編輯行程' : '新增行程'}
        onBack={onClose}
      />
      <DialogContent sx={{ p: 0, bgcolor: 'background.default' }}>
        {itinerary ? (
          <Stack spacing={2.5} sx={{ width: '100%', maxWidth: 640, mx: 'auto', p: { xs: 2, sm: 2.5 } }}>
            {/* 基本資訊 */}
            <Card sx={{ p: { xs: 2, sm: 2.5 } }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 2 }}>
                基本資訊
              </Typography>
              <Stack spacing={2}>
                <TextField
                  autoFocus
                  label="行程名稱"
                  placeholder="例如：2026 東京賞櫻之旅"
                  value={itinerary.title}
                  onChange={(event) =>
                    onChange({ ...itinerary, title: event.target.value })
                  }
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    type="date"
                    label="開始日期"
                    value={itinerary.startDate?.slice(0, 10) ?? ''}
                    slotProps={{ inputLabel: { shrink: true } }}
                    onChange={(event) => onDateChange('startDate', event.target.value)}
                  />
                  <TextField
                    type="date"
                    label="結束日期"
                    value={itinerary.endDate?.slice(0, 10) ?? ''}
                    slotProps={{ inputLabel: { shrink: true } }}
                    onChange={(event) => onDateChange('endDate', event.target.value)}
                  />
                </Stack>
                <FormControl fullWidth>
                  <InputLabel id="trip-currency-label">主要顯示貨幣</InputLabel>
                  <Select
                    labelId="trip-currency-label"
                    label="主要顯示貨幣"
                    value={itinerary.currency}
                    onChange={(event) => handleCurrencyChange(event.target.value)}
                  >
                    {supportedCurrencies.map((currency) => {
                      const info = getCurrencyInfo(currency)
                      return (
                        <MenuItem key={currency} value={currency}>
                          {info.flag} {currency} — {info.name}
                        </MenuItem>
                      )
                    })}
                  </Select>
                </FormControl>
              </Stack>
            </Card>

            {/* 匯率換算設定 */}
            <ExchangeRateEditor
              itinerary={itinerary}
              saving={saving}
              rateCurrencies={rateCurrencies}
              missingCurrencies={missingCurrencies}
              availableRateCurrencies={availableRateCurrencies}
              newRateCurrency={newRateCurrency}
              onNewRateCurrencyChange={setNewRateCurrency}
              onAddRateCurrency={handleAddRateCurrency}
              onRateChange={handleRateChange}
              onRemoveRateCurrency={handleRemoveRateCurrency}
            />

            {/* 待辦事項預設分類 */}
            <Card sx={{ p: { xs: 2, sm: 2.5 } }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                待辦事項預設分類
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                自訂此旅程新增待辦事項時可選用的分類標籤。
              </Typography>

              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mb: 2 }}>
                {categories.map((cat) => (
                  <Chip
                    key={cat}
                    label={cat}
                    color="primary"
                    variant="outlined"
                    onDelete={categories.length > 1 ? () => handleDeleteCategory(cat) : undefined}
                  />
                ))}
              </Stack>

              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <TextField
                  size="small"
                  placeholder="輸入新分類名稱…"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddCategory()
                    }
                  }}
                  sx={{ flex: 1 }}
                />
                <IconButton
                  color="primary"
                  disabled={!newTag.trim()}
                  onClick={handleAddCategory}
                  aria-label="新增分類"
                >
                  <AddRoundedIcon />
                </IconButton>
              </Stack>
            </Card>
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ position: 'sticky', bottom: 0, zIndex: 2 }}>
        {itinerary && canDelete ? (
          <Button
            color="error"
            size="small"
            startIcon={<DeleteOutlineRoundedIcon />}
            onClick={onDelete}
          >
            刪除
          </Button>
        ) : null}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>取消</Button>
        <Button
          variant="contained"
          disabled={saving || !itinerary?.title.trim() || missingCurrencies.length > 0}
          onClick={onSave}
          startIcon={
            saving ? <CircularProgress size={18} color="inherit" /> : undefined
          }
        >
          {saving ? '儲存中…' : '儲存行程'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}


