import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded'
import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { getCurrencyInfo } from '../../../../lib/currencies'

interface ExchangeRateRowProps {
  currency: string
  baseCurrency: string
  rate: number | null
  isMissing: boolean
  saving: boolean
  isSingleFetching: boolean
  onRateChange: (currency: string, value: string) => void
  onFetchSingleRate: (currency: string) => void
  onOpenInverseCalculator: (currency: string) => void
  onRemoveRateCurrency: (currency: string) => void
}

export function ExchangeRateRow({
  currency,
  baseCurrency,
  rate,
  isMissing,
  saving,
  isSingleFetching,
  onRateChange,
  onFetchSingleRate,
  onOpenInverseCalculator,
  onRemoveRateCurrency,
}: ExchangeRateRowProps) {
  const info = getCurrencyInfo(currency)
  const baseInfo = getCurrencyInfo(baseCurrency)

  const hasValidRate = typeof rate === 'number' && rate > 0
  const inverseRate = hasValidRate ? Number((1 / rate).toPrecision(5)) : null
  const sampleForeignAmount =
    currency === 'JPY' || currency === 'KRW' || currency === 'VND' ? 1000 : 100
  const sampleConverted = hasValidRate
    ? Number((sampleForeignAmount * rate).toFixed(2))
    : null

  return (
    <Paper
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
                onClick={() => onFetchSingleRate(currency)}
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
              onClick={() => onOpenInverseCalculator(currency)}
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
}
