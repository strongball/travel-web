import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  TextField,
  Typography,
} from '@mui/material'

interface InverseRateCalculatorDialogProps {
  open: boolean
  baseCurrency: string
  targetCurrency: string | null
  inputValue: string
  onInputChange: (value: string) => void
  onClose: () => void
  onApply: () => void
}

export function InverseRateCalculatorDialog({
  open,
  baseCurrency,
  targetCurrency,
  inputValue,
  onInputChange,
  onClose,
  onApply,
}: InverseRateCalculatorDialogProps) {
  const num = Number(inputValue)
  const isValid = Number.isFinite(num) && num > 0

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>
        反向匯率小幫手
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          若您習慣以「1 {baseCurrency} 可以換多少 {targetCurrency}」來思考（例如 1 TWD = 4.67 JPY），請在此輸入：
        </Typography>
        <TextField
          autoFocus
          fullWidth
          type="number"
          label={`1 ${baseCurrency} 等於多少 ${targetCurrency}`}
          placeholder="例如：4.67"
          value={inputValue}
          slotProps={{
            htmlInput: { min: 0.000001, step: 'any', inputMode: 'decimal' },
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  {targetCurrency}
                </InputAdornment>
              ),
            },
          }}
          onChange={(e) => onInputChange(e.target.value)}
        />
        {isValid ? (
          <Typography variant="caption" color="primary" sx={{ mt: 1.5, display: 'block', fontWeight: 700 }}>
            💡 自動換算：1 {targetCurrency} ≈ {Number((1 / num).toPrecision(6))} {baseCurrency}
          </Typography>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>取消</Button>
        <Button
          variant="contained"
          disabled={!isValid}
          onClick={onApply}
        >
          套用換算
        </Button>
      </DialogActions>
    </Dialog>
  )
}
