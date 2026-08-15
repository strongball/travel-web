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
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2, sm: 2.5 },
        borderRadius: 3.5,
        border: '1px solid rgba(13, 118, 110, 0.16)',
        bgcolor: '#ffffff',
        boxShadow: '0 2px 12px rgba(13, 118, 110, 0.04)',
      }}
    >
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
            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#134e4a' }}>
              匯率換算設定
            </Typography>
            <Chip
              size="small"
              label={`基準：${baseInfo.flag} ${baseCurrency}`}
              sx={{
                fontWeight: 700,
                bgcolor: 'rgba(13, 118, 110, 0.1)',
                color: '#0d766e',
                fontSize: '0.75rem',
              }}
            />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: '0.825rem' }}>
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
          sx={{
            flexShrink: 0,
            borderRadius: 2.5,
            fontWeight: 700,
            textTransform: 'none',
            bgcolor: 'rgba(13, 118, 110, 0.04)',
            borderWidth: '1.5px',
            '&:hover': {
              bgcolor: 'rgba(13, 118, 110, 0.08)',
              borderWidth: '1.5px',
            },
          }}
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
              sx={{ fontWeight: 700, fontSize: '0.78rem' }}
            >
              一鍵自動補齊
            </Button>
          }
          sx={{
            mb: 2,
            borderRadius: 2.5,
            fontWeight: 600,
            fontSize: '0.85rem',
          }}
        >
          尚未設定：{missingCurrencies.join('、')} 匯率，請設定以避免總額計算錯誤。
        </Alert>
      </Collapse>

      {/* Base Currency Anchor Card */}
      <Paper
        elevation={0}
        sx={{
          p: 1.5,
          mb: 2,
          borderRadius: 2.5,
          bgcolor: 'rgba(13, 118, 110, 0.04)',
          border: '1px dashed rgba(13, 118, 110, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Typography sx={{ fontSize: '1.4rem', lineHeight: 1 }}>
            {baseInfo.flag}
          </Typography>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 800, color: '#0f766e' }}>
              {baseInfo.code} · {baseInfo.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              主要顯示貨幣 · 基準匯率 1.00
            </Typography>
          </Box>
        </Stack>
        <Chip
          size="small"
          label="基準固定"
          sx={{
            fontWeight: 700,
            bgcolor: 'rgba(13, 118, 110, 0.15)',
            color: '#0f766e',
            fontSize: '0.72rem',
          }}
        />
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
              elevation={0}
              sx={{
                p: { xs: 1.5, sm: 2 },
                borderRadius: 3,
                border: isMissing
                  ? '1.5px solid #f59e0b'
                  : '1px solid rgba(226, 232, 240, 0.9)',
                bgcolor: isMissing ? '#fffbeb' : '#fafafa',
                transition: 'all 0.2s ease',
                '&:hover': {
                  borderColor: isMissing ? '#f59e0b' : 'rgba(13, 118, 110, 0.3)',
                  bgcolor: isMissing ? '#fffbeb' : '#ffffff',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                },
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
                  <Typography sx={{ fontSize: '1.3rem', lineHeight: 1 }}>
                    {info.flag}
                  </Typography>
                  <Typography sx={{ fontWeight: 800, fontSize: '0.95rem' }}>
                    {currency}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    {info.name}
                  </Typography>
                  {isMissing ? (
                    <Chip
                      size="small"
                      label="記帳使用中，需設定"
                      color="warning"
                      sx={{ height: 22, fontSize: '0.7rem', fontWeight: 700 }}
                    />
                  ) : null}
                </Stack>

                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                  <Tooltip title="抓取此幣別即時匯率">
                    <span>
                      <IconButton
                        size="small"
                        disabled={saving || isSingleFetching}
                        onClick={() => void handleFetchSingleRate(currency)}
                        sx={{
                          color: '#0d766e',
                          bgcolor: 'rgba(13, 118, 110, 0.06)',
                          width: 32,
                          height: 32,
                          minWidth: 32,
                          minHeight: 32,
                          borderRadius: 2,
                          '&:hover': { bgcolor: 'rgba(13, 118, 110, 0.14)' },
                        }}
                        aria-label={`更新 ${currency} 即時匯率`}
                      >
                        {isSingleFetching ? (
                          <CircularProgress size={14} color="inherit" />
                        ) : (
                          <RefreshRoundedIcon sx={{ fontSize: 18 }} />
                        )}
                      </IconButton>
                    </span>
                  </Tooltip>

                  <Tooltip title="反向換算小幫手 (以主要幣別輸入)">
                    <IconButton
                      size="small"
                      onClick={() => openInverseCalculator(currency)}
                      sx={{
                        color: '#6366f1',
                        bgcolor: 'rgba(99, 102, 241, 0.08)',
                        width: 32,
                        height: 32,
                        minWidth: 32,
                        minHeight: 32,
                        borderRadius: 2,
                        '&:hover': { bgcolor: 'rgba(99, 102, 241, 0.16)' },
                      }}
                      aria-label={`反向計算 ${currency} 匯率`}
                    >
                      <SwapHorizRoundedIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Tooltip>

                  <Tooltip title={`移除 ${currency}`}>
                    <IconButton
                      color="error"
                      size="small"
                      aria-label={`移除 ${currency} 匯率`}
                      onClick={() => onRemoveRateCurrency(currency)}
                      sx={{
                        width: 32,
                        height: 32,
                        minWidth: 32,
                        minHeight: 32,
                        borderRadius: 2,
                        bgcolor: 'rgba(239, 68, 68, 0.06)',
                        '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.12)' },
                      }}
                    >
                      <DeleteOutlineRoundedIcon sx={{ fontSize: 18 }} />
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
                      style: { fontWeight: 700, fontSize: '0.95rem' },
                    },
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 800, color: '#0d766e', mr: 0.5 }}
                          >
                            1 {currency} =
                          </Typography>
                        </InputAdornment>
                      ),
                      endAdornment: (
                        <InputAdornment position="end">
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 700, color: 'text.secondary' }}
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
                    borderTop: '1px dashed rgba(0, 0, 0, 0.06)',
                  }}
                >
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                    💡 反向對照：1 {baseCurrency} ≈ <strong>{inverseRate}</strong> {currency}
                  </Typography>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`試算：${info.symbol} ${sampleForeignAmount.toLocaleString()} ≈ ${baseInfo.symbol} ${sampleConverted?.toLocaleString()} ${baseCurrency}`}
                    sx={{
                      height: 22,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      borderColor: 'rgba(13, 118, 110, 0.25)',
                      color: '#0f766e',
                      bgcolor: '#ffffff',
                    }}
                  />
                </Stack>
              ) : (
                <Typography variant="caption" color="error" sx={{ fontWeight: 600 }}>
                  ⚠️ 尚未輸入有效匯率，請輸入數值或點擊「抓取即時匯率」
                </Typography>
              )}
            </Paper>
          )
        })}
      </Stack>

      {/* Quick Add Popular Currencies Chips */}
      {quickAddCandidates.length > 0 ? (
        <Box sx={{ mt: 2.5, pt: 2, borderTop: '1px solid rgba(0, 0, 0, 0.06)' }}>
          <Typography
            variant="caption"
            sx={{ fontWeight: 800, color: 'text.secondary', display: 'block', mb: 1 }}
          >
            常用旅遊幣別快速新增（點擊直接加入並填入即時匯率）：
          </Typography>
          <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
            {quickAddCandidates.map((curr) => {
              const info = getCurrencyInfo(curr)
              return (
                <Chip
                  key={curr}
                  icon={<AddRoundedIcon sx={{ fontSize: 16 }} />}
                  label={`${info.flag} ${curr} ${info.name}`}
                  clickable
                  disabled={saving}
                  onClick={() => void handleQuickAddCurrency(curr)}
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    bgcolor: 'rgba(13, 118, 110, 0.06)',
                    borderColor: 'rgba(13, 118, 110, 0.2)',
                    color: '#0d766e',
                    '&:hover': {
                      bgcolor: 'rgba(13, 118, 110, 0.14)',
                      borderColor: '#0d766e',
                    },
                  }}
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
              sx={{
                minWidth: { sm: 120 },
                minHeight: 40,
                flexShrink: 0,
                borderRadius: 2,
                fontWeight: 700,
              }}
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
            <Typography variant="caption" sx={{ mt: 1.5, display: 'block', color: '#0d766e', fontWeight: 700 }}>
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
    </Paper>
  )
}
