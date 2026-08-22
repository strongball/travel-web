import { useState } from 'react'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Collapse,
  FormControl,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material'
import { useRiverRef } from '@stball/react-river'
import {
  getCurrencyInfo,
  getExchangeRate,
  popularCurrencies,
} from '../../../lib/currencies'
import { liveExchangeRatesFamily } from '../../../providers/currencyProviders'
import type { Itinerary } from '../../../types/database'
import { ExchangeRateRow } from './currency/ExchangeRateRow'
import { InverseRateCalculatorDialog } from './currency/InverseRateCalculatorDialog'

interface ExchangeRateEditorProps {
  itinerary: Itinerary
  saving: boolean
  rateCurrencies: string[]
  missingCurrencies: string[]
  availableRateCurrencies: string[]
  newRateCurrency: string
  onNewRateCurrencyChange: (currency: string) => void
  onAddRateCurrency: (currency?: string) => void
  onRateChange: (currency: string, value: string) => void
  onRemoveRateCurrency: (currency: string) => void
}

export function ExchangeRateEditor({
  itinerary,
  saving,
  rateCurrencies,
  missingCurrencies,
  availableRateCurrencies,
  newRateCurrency,
  onNewRateCurrencyChange,
  onAddRateCurrency,
  onRateChange,
  onRemoveRateCurrency,
}: ExchangeRateEditorProps) {
  const ref = useRiverRef()
  const [isFetchingRates, setIsFetchingRates] = useState(false)
  const [fetchingCurrency, setFetchingCurrency] = useState<string | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)
  const [inverseModalCurrency, setInverseModalCurrency] = useState<string | null>(null)
  const [inverseInputValue, setInverseInputValue] = useState('')

  const baseCurrency = itinerary.currency
  const baseInfo = getCurrencyInfo(baseCurrency)

  // Fetch all live rates for existing rate currencies via React River
  const handleFetchAllLiveRates = async () => {
    setIsFetchingRates(true)
    try {
      ref.invalidate(liveExchangeRatesFamily(baseCurrency))
      const { rates, date } = await ref.read(liveExchangeRatesFamily(baseCurrency).promise)
      let updatedCount = 0
      rateCurrencies.forEach((curr) => {
        if (curr !== baseCurrency && rates[curr] && rates[curr] > 0) {
          onRateChange(curr, rates[curr].toString())
          updatedCount++
        }
      })
      setFeedbackMessage(`已更新 ${updatedCount} 種幣別即時匯率 (${date ?? '最新'})`)
    } catch (err) {
      const message = err instanceof Error ? err.message : '抓取匯率失敗，請檢查網路連線'
      setFeedbackMessage(message)
    } finally {
      setIsFetchingRates(false)
    }
  }

  // Fetch live rate for a specific currency via React River
  const handleFetchSingleRate = async (curr: string) => {
    setFetchingCurrency(curr)
    try {
      const { rates } = await ref.read(liveExchangeRatesFamily(baseCurrency).promise)
      if (rates[curr] && rates[curr] > 0) {
        onRateChange(curr, rates[curr].toString())
        const info = getCurrencyInfo(curr)
        setFeedbackMessage(`已更新 1 ${info.code} = ${rates[curr]} ${baseCurrency}`)
      } else {
        setFeedbackMessage(`未找到 ${curr} 對 ${baseCurrency} 的即時匯率`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '抓取匯率失敗'
      setFeedbackMessage(message)
    } finally {
      setFetchingCurrency(null)
    }
  }

  // Quick add currency and auto-fetch rate via React River
  const handleQuickAddCurrency = async (curr: string) => {
    onAddRateCurrency(curr)
    try {
      const { rates } = await ref.read(liveExchangeRatesFamily(baseCurrency).promise)
      if (rates[curr] && rates[curr] > 0) {
        onRateChange(curr, rates[curr].toString())
        const info = getCurrencyInfo(curr)
        setFeedbackMessage(`已新增 ${info.flag} ${curr} (${info.name}) 並填入最新即時匯率`)
      }
    } catch {
      const info = getCurrencyInfo(curr)
      setFeedbackMessage(`已新增 ${info.flag} ${curr} (${info.name})，請輸入匯率`)
    }
  }

  // Open inverse calculator modal
  const openInverseCalculator = (curr: string) => {
    const currentRate = getExchangeRate(curr, baseCurrency, itinerary.exchangeRates)
    setInverseModalCurrency(curr)
    if (currentRate && currentRate > 0) {
      const inverse = Number((1 / currentRate).toPrecision(6))
      setInverseInputValue(inverse.toString())
    } else {
      setInverseInputValue('')
    }
  }

  const handleApplyInverseRate = () => {
    if (!inverseModalCurrency) return
    const num = Number(inverseInputValue)
    if (Number.isFinite(num) && num > 0) {
      const directRate = Number((1 / num).toPrecision(6))
      onRateChange(inverseModalCurrency, directRate.toString())
      setFeedbackMessage(`已套用：1 ${baseCurrency} = ${num} ${inverseModalCurrency} (1 ${inverseModalCurrency} ≈ ${directRate} ${baseCurrency})`)
    }
    setInverseModalCurrency(null)
  }

  const foreignCurrencies = rateCurrencies.filter((c) => c !== baseCurrency)
  const quickAddCandidates = popularCurrencies.filter(
    (c) => c !== baseCurrency && !rateCurrencies.includes(c),
  )

  return (
    <Card sx={{ p: { xs: 2, sm: 2.5 } }}>
      {/* Header with Title & Auto-fetch Button */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          mb: 2,
        }}
      >
        <Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
              匯率換算設定
            </Typography>
            <Chip
              size="small"
              color="primary"
              variant="outlined"
              label={`基準：${baseInfo.flag} ${baseCurrency}`}
            />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            請設定「1 單位外幣 = 幾單位主要幣別」。記帳會保留原始金額，費用與總覽於顯示時換算。
          </Typography>
        </Box>

        <Button
          variant="outlined"
          color="primary"
          size="small"
          startIcon={
            isFetchingRates ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <AutoAwesomeRoundedIcon fontSize="small" />
            )
          }
          disabled={saving || isFetchingRates}
          onClick={() => void handleFetchAllLiveRates()}
          sx={{ flexShrink: 0 }}
        >
          {isFetchingRates ? '抓取中…' : '一鍵更新即時匯率'}
        </Button>
      </Stack>

      {/* Warning for missing currencies */}
      <Collapse in={missingCurrencies.length > 0}>
        <Alert
          severity="warning"
          icon={<WarningAmberRoundedIcon fontSize="inherit" />}
          action={
            <Button
              color="inherit"
              size="small"
              disabled={isFetchingRates}
              onClick={() => void handleFetchAllLiveRates()}
            >
              一鍵自動補齊
            </Button>
          }
          sx={{ mb: 2 }}
        >
          尚未設定：{missingCurrencies.join('、')} 匯率，請設定以避免總額計算錯誤。
        </Alert>
      </Collapse>

      {/* Base Currency Anchor Card */}
      <Paper
        variant="outlined"
        sx={{
          p: 1.5,
          mb: 2,
          bgcolor: 'action.hover',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Typography sx={{ fontSize: '1.4rem' }}>
            {baseInfo.flag}
          </Typography>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 800 }}>
              {baseInfo.code} · {baseInfo.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              主要顯示貨幣 · 基準匯率 1.00
            </Typography>
          </Box>
        </Stack>
        <Chip size="small" label="基準固定" color="primary" />
      </Paper>

      {/* Foreign Currencies List */}
      <Stack spacing={1.5}>
        {foreignCurrencies.map((currency) => (
          <ExchangeRateRow
            key={currency}
            currency={currency}
            baseCurrency={baseCurrency}
            rate={getExchangeRate(currency, baseCurrency, itinerary.exchangeRates)}
            isMissing={missingCurrencies.includes(currency)}
            saving={saving}
            isSingleFetching={fetchingCurrency === currency}
            onRateChange={onRateChange}
            onFetchSingleRate={(curr) => void handleFetchSingleRate(curr)}
            onOpenInverseCalculator={openInverseCalculator}
            onRemoveRateCurrency={onRemoveRateCurrency}
          />
        ))}
      </Stack>

      {/* Quick Add Popular Currencies Chips */}
      {quickAddCandidates.length > 0 ? (
        <Box sx={{ mt: 2.5, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 700, display: 'block', mb: 1 }}
          >
            常用旅遊幣別快速新增（點擊直接加入並填入即時匯率）：
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            {quickAddCandidates.map((curr) => {
              const info = getCurrencyInfo(curr)
              return (
                <Chip
                  key={curr}
                  icon={<AddRoundedIcon fontSize="small" />}
                  label={`${info.flag} ${curr} ${info.name}`}
                  clickable
                  variant="outlined"
                  color="primary"
                  disabled={saving}
                  onClick={() => void handleQuickAddCurrency(curr)}
                />
              )
            })}
          </Stack>
        </Box>
      ) : null}

      {/* Dropdown for other currencies */}
      {availableRateCurrencies.length > 0 ? (
        <Box sx={{ mt: 2 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{ alignItems: { sm: 'center' } }}
          >
            <FormControl fullWidth size="small">
              <Select
                displayEmpty
                value={newRateCurrency}
                onChange={(event) => onNewRateCurrencyChange(event.target.value)}
                disabled={saving}
                renderValue={(selected) => {
                  if (!selected) {
                    return (
                      <Typography variant="body2" color="text.secondary">
                        選擇其他貨幣新增…
                      </Typography>
                    )
                  }
                  const info = getCurrencyInfo(selected)
                  return `${info.flag} ${selected} · ${info.name}`
                }}
              >
                <MenuItem value="" disabled>
                  <em>選擇貨幣…</em>
                </MenuItem>
                {availableRateCurrencies.map((currency) => {
                  const info = getCurrencyInfo(currency)
                  return (
                    <MenuItem key={currency} value={currency}>
                      {info.flag} {currency} — {info.name}
                    </MenuItem>
                  )
                })}
              </Select>
            </FormControl>
            <Button
              variant="contained"
              startIcon={<AddRoundedIcon />}
              disabled={saving || !newRateCurrency}
              onClick={() => void handleQuickAddCurrency(newRateCurrency)}
              sx={{ minWidth: { sm: 120 } }}
            >
              新增幣別
            </Button>
          </Stack>
        </Box>
      ) : null}

      {/* Inverse Rate Helper Dialog */}
      <InverseRateCalculatorDialog
        open={Boolean(inverseModalCurrency)}
        baseCurrency={baseCurrency}
        targetCurrency={inverseModalCurrency}
        inputValue={inverseInputValue}
        onInputChange={setInverseInputValue}
        onClose={() => setInverseModalCurrency(null)}
        onApply={handleApplyInverseRate}
      />

      {/* Snackbar feedback */}
      <Snackbar
        open={Boolean(feedbackMessage)}
        autoHideDuration={3500}
        onClose={() => setFeedbackMessage(null)}
        message={feedbackMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Card>
  )
}
