import { useState } from 'react'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
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
      // If offline or fetch failed, currency is still added for manual input
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
        {foreignCurrencies.map((currency) => {
          const info = getCurrencyInfo(currency)
          const rate = getExchangeRate(currency, baseCurrency, itinerary.exchangeRates)
          const isMissing = missingCurrencies.includes(currency)
          const isSingleFetching = fetchingCurrency === currency

          // Calculate inverse and demo preview
          const hasValidRate = typeof rate === 'number' && rate > 0
          const inverseRate = hasValidRate ? Number((1 / rate).toPrecision(5)) : null
          const sampleForeignAmount = currency === 'JPY' || currency === 'KRW' || currency === 'VND' ? 1000 : 100
          const sampleConverted = hasValidRate ? Number((sampleForeignAmount * rate).toFixed(2)) : null

          return (
            <Paper
              key={currency}
              variant="outlined"
              sx={{
                p: { xs: 1.5, sm: 2 },
                borderColor: isMissing ? 'warning.main' : undefined,
                bgcolor: isMissing ? 'warning.lighter' : undefined,
              }}
            >
              {/* Row 1: Currency info + Status badges + Actions */}
              <Stack
                direction="row"
                spacing={1}
                sx={{
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 1.25,
                }}
              >
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Typography sx={{ fontSize: '1.3rem' }}>
                    {info.flag}
                  </Typography>
                  <Typography sx={{ fontWeight: 800 }}>
                    {currency}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {info.name}
                  </Typography>
                  {isMissing ? (
                    <Chip
                      size="small"
                      label="記帳使用中，需設定"
                      color="warning"
                    />
                  ) : null}
                </Stack>

                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                  <Tooltip title="抓取此幣別即時匯率">
                    <span>
                      <IconButton
                        size="small"
                        color="primary"
                        disabled={saving || isSingleFetching}
                        onClick={() => void handleFetchSingleRate(currency)}
                        aria-label={`更新 ${currency} 即時匯率`}
                      >
                        {isSingleFetching ? (
                          <CircularProgress size={14} color="inherit" />
                        ) : (
                          <RefreshRoundedIcon fontSize="small" />
                        )}
                      </IconButton>
                    </span>
                  </Tooltip>

                  <Tooltip title="反向換算小幫手 (以主要幣別輸入)">
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={() => openInverseCalculator(currency)}
                      aria-label={`反向計算 ${currency} 匯率`}
                    >
                      <SwapHorizRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>

                  <Tooltip title={`移除 ${currency}`}>
                    <IconButton
                      color="error"
                      size="small"
                      aria-label={`移除 ${currency} 匯率`}
                      onClick={() => onRemoveRateCurrency(currency)}
                    >
                      <DeleteOutlineRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Stack>

              {/* Row 2: Direct Rate Input */}
              <Box sx={{ mb: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label={`${currency} 匯率`}
                  value={rate?.toString() ?? ''}
                  disabled={saving}
                  placeholder="請輸入匯率 (例如 0.214)"
                  slotProps={{
                    htmlInput: {
                      min: 0.000001,
                      step: 'any',
                      inputMode: 'decimal',
                    },
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <Typography
                            variant="body2"
                            color="primary.main"
                            sx={{ fontWeight: 800, mr: 0.5 }}
                          >
                            1 {currency} =
                          </Typography>
                        </InputAdornment>
                      ),
                      endAdornment: (
                        <InputAdornment position="end">
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ fontWeight: 700 }}
                          >
                            {baseCurrency}
                          </Typography>
                        </InputAdornment>
                      ),
                    },
                  }}
                  onChange={(event) => onRateChange(currency, event.target.value)}
                />
              </Box>

              {/* Row 3: Bidirectional Hints & Live Conversion Preview */}
              {hasValidRate ? (
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1}
                  sx={{
                    justifyContent: 'space-between',
                    alignItems: { xs: 'flex-start', sm: 'center' },
                    pt: 0.5,
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    💡 反向對照：1 {baseCurrency} ≈ <strong>{inverseRate}</strong> {currency}
                  </Typography>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`試算：${info.symbol} ${sampleForeignAmount.toLocaleString()} ≈ ${baseInfo.symbol} ${sampleConverted?.toLocaleString()} ${baseCurrency}`}
                  />
                </Stack>
              ) : (
                <Typography variant="caption" color="error">
                  ⚠️ 尚未輸入有效匯率，請輸入數值或點擊「抓取即時匯率」
                </Typography>
              )}
            </Paper>
          )
        })}
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
      <Dialog
        open={Boolean(inverseModalCurrency)}
        onClose={() => setInverseModalCurrency(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>
          反向匯率小幫手
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            若您習慣以「1 {baseCurrency} 可以換多少 {inverseModalCurrency}」來思考（例如 1 TWD = 4.67 JPY），請在此輸入：
          </Typography>
          <TextField
            autoFocus
            fullWidth
            type="number"
            label={`1 ${baseCurrency} 等於多少 ${inverseModalCurrency}`}
            placeholder="例如：4.67"
            value={inverseInputValue}
            slotProps={{
              htmlInput: { min: 0.000001, step: 'any', inputMode: 'decimal' },
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    {inverseModalCurrency}
                  </InputAdornment>
                ),
              },
            }}
            onChange={(e) => setInverseInputValue(e.target.value)}
          />
          {Number(inverseInputValue) > 0 ? (
            <Typography variant="caption" color="primary" sx={{ mt: 1.5, display: 'block', fontWeight: 700 }}>
              💡 自動換算：1 {inverseModalCurrency} ≈ {Number((1 / Number(inverseInputValue)).toPrecision(6))} {baseCurrency}
            </Typography>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setInverseModalCurrency(null)}>取消</Button>
          <Button
            variant="contained"
            disabled={!Number(inverseInputValue) || Number(inverseInputValue) <= 0}
            onClick={handleApplyInverseRate}
          >
            套用換算
          </Button>
        </DialogActions>
      </Dialog>

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
