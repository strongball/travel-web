import { useEffect, useState } from 'react'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { PageHeader } from '../../../components/PageHeader'
import {
  getExchangeRate,
  missingExchangeRateCurrencies,
  normalizeCurrency,
  normalizeExchangeRates,
  rebaseExchangeRates,
  supportedCurrencies,
} from '../../../lib/currencies'
import type { Itinerary } from '../../../types/database'

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

  const handleAddRateCurrency = () => {
    if (!newRateCurrency || rateCurrencies.includes(newRateCurrency)) return
    setPendingRateCurrencies((current) => [...current, newRateCurrency])
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
          <Stack spacing={2.5} sx={{ width: '100%', maxWidth: 640, mx: 'auto', p: 2 }}>
            <TextField
              autoFocus
              label="行程名稱"
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
                {supportedCurrencies.map((currency) => (
                  <MenuItem key={currency} value={currency}>
                    {currency}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 3,
                border: '1px solid rgba(13, 118, 110, 0.12)',
                bgcolor: '#ffffff',
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'text.secondary' }}>
                匯率設定
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1.5 }}>
                請輸入「1 單位來源貨幣 = 幾單位主要顯示貨幣」。記帳會保留原始金額，費用清單與總覽只在顯示時換算。
              </Typography>
              {missingCurrencies.length > 0 ? (
                <Alert severity="warning" sx={{ mb: 1.5 }}>
                  尚未設定：{missingCurrencies.join('、')}。請完成匯率後再儲存，避免總額換算錯誤。
                </Alert>
              ) : null}
              <Stack spacing={1.25}>
                {rateCurrencies.map((currency) => {
                  const isBaseCurrency = currency === itinerary.currency
                  const rate = getExchangeRate(currency, itinerary.currency, itinerary.exchangeRates)
                  return (
                    <Stack
                      key={currency}
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1}
                      sx={{ alignItems: { sm: 'center' } }}
                    >
                      <Typography sx={{ minWidth: { sm: 52 }, fontWeight: 800 }}>
                        {currency}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ minWidth: { sm: 90 } }}>
                        1 {currency} =
                      </Typography>
                      <TextField
                        fullWidth
                        size="small"
                        type="number"
                        label={`${currency} 匯率`}
                        value={isBaseCurrency ? '1' : rate?.toString() ?? ''}
                        disabled={isBaseCurrency || saving}
                        placeholder={isBaseCurrency ? undefined : '請輸入匯率'}
                        slotProps={{ htmlInput: { min: 0.000001, step: 'any', inputMode: 'decimal' } }}
                        onChange={(event) => handleRateChange(currency, event.target.value)}
                      />
                      <Typography variant="body2" color="text.secondary" sx={{ minWidth: { sm: 52 } }}>
                        {itinerary.currency}
                      </Typography>
                      {!isBaseCurrency ? (
                        <IconButton
                          color="error"
                          size="small"
                          aria-label={`移除 ${currency} 匯率`}
                          onClick={() => handleRemoveRateCurrency(currency)}
                        >
                          <DeleteOutlineRoundedIcon fontSize="small" />
                        </IconButton>
                      ) : null}
                    </Stack>
                  )
                })}
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1.5 }}>
                <FormControl fullWidth size="small">
                  <InputLabel id="new-rate-currency-label">新增來源貨幣</InputLabel>
                  <Select
                    labelId="new-rate-currency-label"
                    label="新增來源貨幣"
                    value={newRateCurrency}
                    onChange={(event) => setNewRateCurrency(event.target.value)}
                    disabled={saving || availableRateCurrencies.length === 0}
                  >
                    {availableRateCurrencies.map((currency) => (
                      <MenuItem key={currency} value={currency}>{currency}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  variant="outlined"
                  startIcon={<AddRoundedIcon />}
                  disabled={saving || !newRateCurrency}
                  onClick={handleAddRateCurrency}
                  sx={{ minWidth: { sm: 112 } }}
                >
                  新增貨幣
                </Button>
              </Stack>
            </Paper>

            {/* Todo Categories Section */}
            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 3,
                border: '1px solid rgba(13, 118, 110, 0.12)',
                bgcolor: '#ffffff',
              }}
            >
              <Typography
                variant="subtitle2"
                sx={{ fontWeight: 800, color: 'text.secondary', mb: 1 }}
              >
                待辦事項預設分類
              </Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
                {categories.map((cat) => (
                  <Chip
                    key={cat}
                    label={cat}
                    onDelete={categories.length > 1 ? () => handleDeleteCategory(cat) : undefined}
                    sx={{
                      fontWeight: 700,
                      bgcolor: 'rgba(13, 118, 110, 0.08)',
                      color: '#0d766e',
                      borderColor: 'rgba(13, 118, 110, 0.2)',
                    }}
                  />
                ))}
              </Stack>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <TextField
                  size="small"
                  placeholder="新增分類標籤…"
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
                  sx={{
                    bgcolor: 'rgba(13, 118, 110, 0.08)',
                    borderRadius: 2,
                    '&:hover': { bgcolor: 'rgba(13, 118, 110, 0.16)' },
                  }}
                  aria-label="新增分類"
                >
                  <AddRoundedIcon />
                </IconButton>
              </Stack>
            </Paper>
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
