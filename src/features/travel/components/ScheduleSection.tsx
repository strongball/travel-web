import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import MapRoundedIcon from '@mui/icons-material/MapRounded'
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded'
import SortRoundedIcon from '@mui/icons-material/SortRounded'
import { Alert, Avatar, Box, Button, Card, CardContent, Chip, Divider, IconButton, Paper, Stack, Tab, Tabs, TextField, Tooltip, Typography } from '@mui/material'
import type { Attraction, TripDay } from '../../../types/database'
import { googlePlaceUrl } from '../googleMaps'
import { attractionMapPoint, formatAmount, formatDate, recalculateDayTimes } from '../travelWorkspaceUtils'
import { AttractionSortDialog } from './AttractionSortDialog'
import { TravelInfoCard } from './TravelInfo'

const GoogleItineraryMapDialog = lazy(() => import('../GoogleItineraryMapDialog'))

export function ScheduleSection({
  days,
  currency,
  onAddAttraction,
  onEditAttraction,
  onEditTravelInfo,
  onDeleteAttraction,
  onStartTimeChange,
  onReorder,
}: {
  days: TripDay[]
  currency: string
  onAddAttraction: (dayId: string) => void
  onEditAttraction: (day: TripDay, attraction: Attraction) => void
  onEditTravelInfo: (origin: Attraction, attraction: Attraction) => void
  onDeleteAttraction: (day: TripDay, id: string) => void
  onStartTimeChange: (dayId: string, time: string) => void
  onReorder: (days: TripDay[]) => void | Promise<void>
}) {
  const [activeDayIndex, setActiveDayIndex] = useState(0)
  const [visibleDays, setVisibleDays] = useState(days)
  const [mapOpen, setMapOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const visibleDaysRef = useRef(visibleDays)
  const saveQueue = useRef(Promise.resolve())

  useEffect(() => {
    visibleDaysRef.current = days
    setVisibleDays(days)
  }, [days])

  useEffect(() => {
    if (activeDayIndex >= days.length) setActiveDayIndex(Math.max(days.length - 1, 0))
  }, [activeDayIndex, days.length])

  const applyAttractionOrder = (attractions: Attraction[]) => {
    const currentDays = visibleDaysRef.current
    const currentDay = currentDays[Math.min(activeDayIndex, currentDays.length - 1)]
    if (!currentDay) return
    const previousAttractionIds = currentDay.attractions.map((item) => item.id)
    const nextAttractions = attractions.map((attraction, index) => {
      const previousIndex = previousAttractionIds.indexOf(attraction.id)
      const previousOriginId = previousIndex > 0 ? previousAttractionIds[previousIndex - 1] : null
      const nextOriginId = index > 0 ? attractions[index - 1].id : null
      return previousOriginId === nextOriginId ? attraction : { ...attraction, travelTime: null }
    })
    const hasChanged = nextAttractions.some((attraction, index) => attraction.id !== previousAttractionIds[index])
    if (!hasChanged) {
      setSortOpen(false)
      return
    }
    const nextDays = currentDays.map((item) => item.id === currentDay.id ? recalculateDayTimes(item, nextAttractions) : item)
    visibleDaysRef.current = nextDays
    setVisibleDays(nextDays)
    setSortOpen(false)
    saveQueue.current = saveQueue.current
      .catch(() => undefined)
      .then(() => onReorder(nextDays))
  }

  if (days.length === 0) {
    return <Alert severity="info">這個行程還沒有日期資料，請先編輯行程日期。</Alert>
  }

  const activeDay = visibleDays[Math.min(activeDayIndex, visibleDays.length - 1)]

  return (
    <Stack spacing={2}>
      <Paper elevation={0} sx={{ borderBottom: 1, borderColor: 'divider', borderRadius: 0, overflow: 'hidden', bgcolor: 'transparent' }}>
        <Tabs
          value={activeDayIndex}
          onChange={(_, value: number) => setActiveDayIndex(value)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ minHeight: 64, '& .MuiTab-root': { minHeight: 64, minWidth: { xs: 82, sm: 104 } } }}
        >
          {days.map((day, index) => (
            <Tab
              key={day.id}
              value={index}
              label={
                <Stack spacing={0.15} sx={{ alignItems: 'center' }}>
                  <Typography variant="caption" sx={{ fontWeight: 800 }}>DAY {index + 1}</Typography>
                  <Typography variant="caption" color="text.secondary">{day.date.slice(5, 10).replace('-', '/')}</Typography>
                </Stack>
              }
            />
          ))}
        </Tabs>
      </Paper>

      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: { xs: 1, md: 1.5 } }}>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0, flex: 1 }}>
            <Avatar sx={{ bgcolor: 'secondary.main', color: 'common.white', width: 34, height: 34, fontWeight: 900 }}>{activeDayIndex + 1}</Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 800 }}>DAY {activeDayIndex + 1}</Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 900 }} noWrap>{formatDate(activeDay.date)}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                {activeDay.startTime?.slice(11, 16) ?? '09:00'} 開始 · {activeDay.attractions.length} 個景點
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={0.25} sx={{ flexShrink: 0 }}>
            <Tooltip title={`查看 ${formatDate(activeDay.date)} 景點地圖`}>
              <IconButton
                color="primary"
                aria-label="查看今日景點地圖"
                onClick={() => setMapOpen(true)}
                sx={{ width: 40, height: 40, bgcolor: 'rgba(13, 118, 110, 0.07)' }}
              >
                <MapRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="編排今日景點順序">
              <IconButton
                color="primary"
                aria-label="編排今日景點順序"
                onClick={() => setSortOpen(true)}
                sx={{ width: 40, height: 40, bgcolor: 'rgba(13, 118, 110, 0.07)' }}
              >
                <SortRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>
        <Divider sx={{ my: 1 }} />
          {activeDay.attractions.length === 0 ? (
            <Box sx={{ bgcolor: 'action.hover', borderRadius: 2, p: 2.5, textAlign: 'center' }}>
              <PlaceRoundedIcon color="disabled" />
              <Typography color="text.secondary" variant="body2">這天還沒有排景點</Typography>
            </Box>
          ) : (
            <Stack spacing={1.25}>
              {activeDay.attractions.map((attraction, attractionIndex) => (
                <Box key={attraction.id} sx={{ borderRadius: 2 }}>
                  {attractionIndex === 0 ? (
                    <Paper
                      variant="outlined"
                      sx={{
                        width: { xs: 'calc(100% - 50px)', sm: 'calc(100% - 64px)' },
                        ml: { xs: '50px', sm: '64px' },
                        mb: 1,
                        p: 0.65,
                        borderRadius: 2,
                        borderColor: 'primary.main',
                        bgcolor: 'rgba(13, 118, 110, 0.06)',
                      }}
                    >
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <Box sx={{ width: 28, height: 28, display: 'grid', placeItems: 'center', borderRadius: '50%', bgcolor: 'primary.main', color: 'common.white', flexShrink: 0 }}>
                          <AccessTimeRoundedIcon sx={{ fontSize: 17 }} />
                        </Box>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant="caption" color="primary.main" sx={{ display: 'block', fontWeight: 900 }}>當日開始</Typography>
                        </Box>
                        <TextField
                          size="small"
                          type="time"
                          value={activeDay.startTime?.slice(11, 16) ?? '09:00'}
                          slotProps={{ htmlInput: { step: 300, 'aria-label': '每日開始時間' } }}
                          onChange={(event) => onStartTimeChange(activeDay.id, event.target.value)}
                          sx={{
                            width: { xs: 148, sm: 164 },
                            '& .MuiOutlinedInput-root': { bgcolor: 'background.paper', borderRadius: 1.5 },
                            '& input': { py: 0.6, fontSize: '0.84rem', fontWeight: 800, letterSpacing: 0.1 },
                          }}
                        />
                      </Stack>
                    </Paper>
                  ) : null}
                  {attractionIndex > 0 ? <TravelInfoCard origin={activeDay.attractions[attractionIndex - 1]} attraction={attraction} onEdit={() => onEditTravelInfo(activeDay.attractions[attractionIndex - 1], attraction)} /> : null}
                  <Stack direction="row" spacing={1.25} sx={{ alignItems: 'stretch' }}>
                    <Box sx={{ width: { xs: 42, sm: 56 }, pt: 1, textAlign: 'right', flexShrink: 0 }}>
                      <Typography variant="caption" color="text.secondary">{attraction.startTime ? attraction.startTime.slice(11, 16) : `${9 + attractionIndex}:00`}</Typography>
                    </Box>
                    <Box sx={{ width: 2, bgcolor: 'primary.light', borderRadius: 2 }} />
                    <Card variant="outlined" sx={{ flex: 1, borderRadius: 2.5 }}>
                      <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
                      <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 800, overflowWrap: 'anywhere' }}>{attraction.name}</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{attraction.locationName || attraction.description || `${attraction.duration} 分鐘`}</Typography>
                          </Box>
                          <Stack direction="row" sx={{ alignItems: 'center' }}>
                            {attractionMapPoint(attraction) ? (
                              <Tooltip title="在 Google 地圖查看景點">
                                <IconButton
                                  component="a"
                                  size="small"
                                  href={googlePlaceUrl(attractionMapPoint(attraction), attraction.placeId)}
                                  target="_blank"
                                  rel="noreferrer"
                                  color="primary"
                                  aria-label={`在 Google 地圖查看 ${attraction.name}`}
                                >
                                  <PlaceRoundedIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            ) : null}
                            <IconButton size="small" aria-label={`編輯 ${attraction.name}`} onClick={() => onEditAttraction(activeDay, attraction)}><EditRoundedIcon fontSize="small" /></IconButton>
                            <IconButton size="small" color="error" aria-label={`刪除 ${attraction.name}`} onClick={() => onDeleteAttraction(activeDay, attraction.id)}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>
                          </Stack>
                        </Stack>
                        <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                          <Chip size="small" label={`${attraction.duration} 分鐘`} />
                          {attraction.cost > 0 ? <Chip size="small" label={formatAmount(attraction.cost, currency)} /> : null}
                        </Stack>
                      </CardContent>
                    </Card>
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
          <Button
            fullWidth
            variant="outlined"
            startIcon={<AddRoundedIcon />}
            onClick={() => onAddAttraction(activeDay.id)}
            sx={{ mt: 1.5 }}
          >
            新增景點
          </Button>
      </Paper>
      <AttractionSortDialog open={sortOpen} day={activeDay} onClose={() => setSortOpen(false)} onApply={applyAttractionOrder} />
      <Suspense fallback={null}>
        <GoogleItineraryMapDialog open={mapOpen} day={activeDay} onClose={() => setMapOpen(false)} />
      </Suspense>
    </Stack>
  )
}


