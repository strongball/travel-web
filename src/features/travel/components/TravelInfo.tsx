import { useEffect, useState } from 'react'
import DirectionsBikeRoundedIcon from '@mui/icons-material/DirectionsBikeRounded'
import DirectionsCarRoundedIcon from '@mui/icons-material/DirectionsCarRounded'
import DirectionsTransitRoundedIcon from '@mui/icons-material/DirectionsTransitRounded'
import DirectionsWalkRoundedIcon from '@mui/icons-material/DirectionsWalkRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import NavigationRoundedIcon from '@mui/icons-material/NavigationRounded'
import RouteRoundedIcon from '@mui/icons-material/RouteRounded'
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, IconButton, InputLabel, MenuItem, Paper, Select, Stack, TextField, Tooltip, Typography } from '@mui/material'
import type { Attraction } from '../../../types/database'
import { estimateGoogleRoute, googleDirectionsUrl, type GoogleRouteEstimate } from '../googleMaps'
import { attractionMapPoint, attractionRoutePoint, hasAttractionMapReference, transportLabel, transportOptions } from '../travelWorkspaceUtils'

const transportIcon = (mode: string | null) => {
  switch (mode) {
    case 'driving':
      return <DirectionsCarRoundedIcon />
    case 'walking':
      return <DirectionsWalkRoundedIcon />
    case 'bicycling':
      return <DirectionsBikeRoundedIcon />
    case 'transit':
      return <DirectionsTransitRoundedIcon />
    default:
      return <DirectionsTransitRoundedIcon />
  }
}

export function TravelEditorDialog({
  open,
  origin,
  attraction,
  saving,
  onClose,
  onChange,
  onSave,
}: {
  open: boolean
  origin: Attraction | null
  attraction: Attraction | null
  saving: boolean
  onClose: () => void
  onChange: (attraction: Attraction) => void
  onSave: () => void
}) {
  const [estimate, setEstimate] = useState<GoogleRouteEstimate | null>(null)
  const [estimating, setEstimating] = useState(false)
  const [estimateError, setEstimateError] = useState<string | null>(null)

  useEffect(() => {
    setEstimate(null)
    setEstimateError(null)
  }, [attraction?.id, open])

  const originRoutePoint = origin ? attractionRoutePoint(origin) : null
  const destinationRoutePoint = attraction ? attractionRoutePoint(attraction) : null
  const canEstimate = Boolean(originRoutePoint && destinationRoutePoint)
  const estimateMode = attraction?.transportMode ?? 'transit'
  const estimateModeLabel = transportLabel(estimateMode)

  const estimateRoute = async () => {
    if (!originRoutePoint || !destinationRoutePoint) return
    setEstimating(true)
    setEstimateError(null)
    try {
      const nextEstimate = await estimateGoogleRoute(
        originRoutePoint,
        destinationRoutePoint,
        estimateMode,
      )
      setEstimate(nextEstimate)
      if (attraction) {
        onChange({
          ...attraction,
          transportMode: attraction.transportMode ?? 'transit',
          travelTime: nextEstimate.durationMinutes,
        })
      }
    } catch (error) {
      setEstimateError(error instanceof Error ? error.message : 'Google 路線估算失敗')
    } finally {
      setEstimating(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>交通方式</DialogTitle>
      <DialogContent>
        {attraction ? (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <FormControl fullWidth>
              <InputLabel id="transport-mode-label">移動方式</InputLabel>
              <Select
                labelId="transport-mode-label"
                label="移動方式"
                value={attraction.transportMode ?? 'transit'}
                onChange={(event) => onChange({ ...attraction, transportMode: event.target.value || null })}
              >
                {transportOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField
              label="移動時間（分鐘）"
              type="number"
              value={attraction.travelTime ?? ''}
              slotProps={{ htmlInput: { min: 0, step: 5, inputMode: 'numeric' } }}
              onChange={(event) => onChange({ ...attraction, travelTime: event.target.value ? Number(event.target.value) : null })}
            />
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2.5 }}>
              <Stack spacing={1}>
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Google 路線估算</Typography>
                  <Typography variant="caption" color="text.secondary">
                    目前方式：{transportLabel(attraction.transportMode ?? 'transit')}
                  </Typography>
                </Box>
                <Tooltip title={canEstimate ? '依目前選擇的交通方式估算' : '起點與景點至少都要有座標或景點 ID'}>
                  <span>
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={estimating ? <CircularProgress size={18} /> : <RouteRoundedIcon />}
                      disabled={!canEstimate || estimating}
                      onClick={() => void estimateRoute()}
                    >
                      {estimating ? '估算中…' : `以${estimateModeLabel}估算`}
                    </Button>
                  </span>
                </Tooltip>
                {estimate ? (
                  <Stack spacing={0.75}>
                    <Typography variant="body2" color="text.secondary">
                      距離：{estimate.distanceMeters >= 1000 ? `${(estimate.distanceMeters / 1000).toFixed(1)} 公里` : `${Math.round(estimate.distanceMeters)} 公尺`} · 約 {estimate.durationMinutes} 分鐘
                    </Typography>
                    <Typography variant="caption" color="primary.main" sx={{ fontWeight: 700 }}>
                      已自動帶入移動時間，可直接儲存或手動調整。
                    </Typography>
                  </Stack>
                ) : null}
                {estimateError ? <Typography variant="caption" color="error">{estimateError}</Typography> : null}
              </Stack>
            </Paper>
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" disabled={saving || !attraction} onClick={onSave} startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined}>
          {saving ? '儲存中…' : '儲存'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export function TravelInfoCard({
  origin,
  attraction,
  onEdit,
}: {
  origin: Attraction
  attraction: Attraction
  onEdit: () => void
}) {
  const originHasReference = hasAttractionMapReference(origin)
  const destinationHasReference = hasAttractionMapReference(attraction)
  const originPoint = originHasReference ? attractionMapPoint(origin) : null
  const destinationPoint = destinationHasReference ? attractionMapPoint(attraction) : null
  const canNavigate = Boolean(destinationPoint)
  return (
    <Paper
      variant="outlined"
      onClick={onEdit}
      sx={{
        display: 'block',
        width: { xs: 'calc(100% - 46px)', sm: 'calc(100% - 60px)' },
        ml: { xs: '46px', sm: '60px' },
        my: 0.75,
        py: 0.4,
        px: 1,
        borderStyle: 'dashed',
        borderColor: 'divider',
        bgcolor: 'action.hover',
        cursor: 'pointer',
        borderRadius: 1.5,
        transition: 'border-color 150ms ease, background-color 150ms ease',
        '&:hover': {
          borderColor: 'primary.main',
          bgcolor: 'action.selected',
        },
      }}
    >
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
        <Box
          sx={{
            color: 'primary.main',
            display: 'grid',
            placeItems: 'center',
            width: 22,
            height: 22,
            borderRadius: '50%',
            bgcolor: 'action.selected',
            flexShrink: 0,
            '& svg': { fontSize: 13 },
          }}
        >
          {transportIcon(attraction.transportMode)}
        </Box>
        <Stack
          direction="row"
          spacing={0.5}
          sx={{ flex: 1, minWidth: 0, alignItems: 'center', overflow: 'hidden' }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 750, flexShrink: 0, fontSize: '0.75rem' }}
          >
            {transportLabel(attraction.transportMode)}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              fontSize: '0.75rem',
              color: attraction.travelTime !== null ? 'primary.main' : 'text.disabled',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {attraction.travelTime !== null ? `· 約 ${attraction.travelTime} 分鐘` : '· 點擊估算'}
          </Typography>
        </Stack>
        {canNavigate && destinationPoint ? (
          <Tooltip title={originPoint ? '在 Google 地圖開啟導航' : '在 Google 地圖開啟導航（使用目前位置）'}>
            <IconButton
              component="a"
              href={googleDirectionsUrl(
                originPoint,
                destinationPoint,
                attraction.transportMode,
                origin.placeId,
                attraction.placeId,
              )}
              target="_blank"
              rel="noreferrer"
              color="primary"
              size="small"
              sx={{ p: 0.25 }}
              aria-label="在 Google 地圖開啟導航"
              onClick={(e) => e.stopPropagation()}
            >
              <NavigationRoundedIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        ) : null}
        <IconButton
          size="small"
          sx={{ p: 0.25 }}
          aria-label="編輯交通方式"
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
        >
          <EditRoundedIcon sx={{ fontSize: 15 }} />
        </IconButton>
      </Stack>
    </Paper>
  )
}


