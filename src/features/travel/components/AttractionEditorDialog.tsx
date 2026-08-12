import MapRoundedIcon from '@mui/icons-material/MapRounded'
import {
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { PageHeader } from '../../../components/PageHeader'
import type { Attraction } from '../../../types/database'

interface AttractionEditorDialogProps {
  attraction: Attraction | null
  currency: string
  saving: boolean
  onClose: () => void
  onChange: (attraction: Attraction) => void
  onOpenMap: () => void
  onSave: () => void
}

export function AttractionEditorDialog({
  attraction,
  currency,
  saving,
  onClose,
  onChange,
  onOpenMap,
  onSave,
}: AttractionEditorDialogProps) {
  return (
    <Dialog open={Boolean(attraction)} onClose={onClose} fullScreen>
      <PageHeader
        title={attraction?.name ? '編輯景點' : '新增景點'}
        onBack={onClose}
      />
      <DialogContent sx={{ p: 0, bgcolor: 'background.default' }}>
        {attraction ? (
          <Stack spacing={2} sx={{ width: '100%', maxWidth: 640, mx: 'auto', p: 2 }}>
            <TextField autoFocus label="景點名稱" value={attraction.name} onChange={(event) => onChange({ ...attraction, name: event.target.value })} />
            <TextField label="地點／地址" value={attraction.locationName ?? ''} onChange={(event) => onChange({ ...attraction, locationName: event.target.value })} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
              <Button variant="outlined" startIcon={<MapRoundedIcon />} onClick={onOpenMap} sx={{ flexShrink: 0 }}>
                在地圖上選擇
              </Button>
              <Typography variant="caption" color="text.secondary">
                {attraction.latitude !== null && attraction.longitude !== null
                  ? `${attraction.latitude.toFixed(5)}, ${attraction.longitude.toFixed(5)}`
                  : '尚未設定座標'}
              </Typography>
            </Stack>
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2.5, bgcolor: 'background.paper' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                Google Maps 資料
              </Typography>
              <Stack direction="row" spacing={0.75} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 0.75 }}>
                <Chip
                  size="small"
                  color={attraction.latitude !== null && attraction.longitude !== null ? 'success' : 'warning'}
                  label={attraction.latitude !== null && attraction.longitude !== null ? '座標已設定' : '尚無座標'}
                />
                <Chip
                  size="small"
                  color={attraction.placeId ? 'success' : 'default'}
                  label={attraction.placeId ? '景點 ID 已設定' : '尚無景點 ID'}
                />
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                {attraction.latitude !== null && attraction.longitude !== null
                  ? `此景點可作為 Google 路線估算端點（${attraction.latitude.toFixed(5)}, ${attraction.longitude.toFixed(5)}）。`
                  : 'Google 路線估算需要座標；請使用上方地圖選擇來補上位置。'}
              </Typography>
              {attraction.placeId ? (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, overflowWrap: 'anywhere' }}>
                  景點 ID：{attraction.placeId}
                </Typography>
              ) : null}
            </Paper>
            <TextField label="備註" multiline minRows={2} value={attraction.description} onChange={(event) => onChange({ ...attraction, description: event.target.value })} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="停留分鐘" type="number" value={attraction.duration} onChange={(event) => onChange({ ...attraction, duration: Number(event.target.value) || 60 })} />
              <TextField label={`預估花費 (${currency})`} type="number" value={attraction.cost} onChange={(event) => onChange({ ...attraction, cost: Number(event.target.value) || 0 })} />
            </Stack>
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ position: 'sticky', bottom: 0, zIndex: 2 }}>
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" disabled={saving || !attraction?.name.trim()} onClick={onSave} startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined}>{saving ? '儲存中…' : '儲存景點'}</Button>
      </DialogActions>
    </Dialog>
  )
}
