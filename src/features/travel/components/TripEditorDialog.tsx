import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from '@mui/material'
import { PageHeader } from '../../../components/PageHeader'
import { supportedCurrencies } from '../../../lib/currencies'
import type { Itinerary } from '../../../types/database'

interface TripEditorDialogProps {
  itinerary: Itinerary | null
  saving: boolean
  canDelete: boolean
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
  onClose,
  onChange,
  onDateChange,
  onDelete,
  onSave,
}: TripEditorDialogProps) {
  return (
    <Dialog open={Boolean(itinerary)} onClose={onClose} fullScreen>
      <PageHeader
        title={itinerary?.title ? '編輯行程' : '新增行程'}
        onBack={onClose}
      />
      <DialogContent sx={{ p: 0, bgcolor: 'background.default' }}>
        {itinerary ? (
          <Stack spacing={2} sx={{ width: '100%', maxWidth: 640, mx: 'auto', p: 2 }}>
            <TextField autoFocus label="行程名稱" value={itinerary.title} onChange={(event) => onChange({ ...itinerary, title: event.target.value })} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField type="date" label="開始日期" value={itinerary.startDate?.slice(0, 10) ?? ''} slotProps={{ inputLabel: { shrink: true } }} onChange={(event) => onDateChange('startDate', event.target.value)} />
              <TextField type="date" label="結束日期" value={itinerary.endDate?.slice(0, 10) ?? ''} slotProps={{ inputLabel: { shrink: true } }} onChange={(event) => onDateChange('endDate', event.target.value)} />
            </Stack>
            <FormControl fullWidth>
              <InputLabel id="trip-currency-label">主要幣別</InputLabel>
              <Select labelId="trip-currency-label" label="主要幣別" value={itinerary.currency} onChange={(event) => onChange({ ...itinerary, currency: event.target.value })}>
                {supportedCurrencies.map((currency) => <MenuItem key={currency} value={currency}>{currency}</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ position: 'sticky', bottom: 0, zIndex: 2 }}>
        {itinerary && canDelete ? <Button color="error" size="small" startIcon={<DeleteOutlineRoundedIcon />} onClick={onDelete}>刪除</Button> : null}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" disabled={saving || !itinerary?.title.trim()} onClick={onSave} startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined}>{saving ? '儲存中…' : '儲存行程'}</Button>
      </DialogActions>
    </Dialog>
  )
}
