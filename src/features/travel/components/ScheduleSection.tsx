import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import MapRoundedIcon from '@mui/icons-material/MapRounded'
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded'
import SortRoundedIcon from '@mui/icons-material/SortRounded'
import { Alert, Avatar, Box, Button, Card, CardContent, Chip, Divider, IconButton, Paper, Stack, TextField, Tooltip, Typography } from '@mui/material'
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
      {/* Day Selector Tabs */}
      <Box
        sx={{
          pb: 0.5,
          overflowX: 'auto',
          '::-webkit-scrollbar': { display: 'none' },
          scrollbarWidth: 'none',
        }}
      >
        <Stack direction="row" spacing={1.25} sx={{ minWidth: 'max-content', py: 0.5 }}>
          {days.map((day, index) => {
            const isSelected = index === activeDayIndex
            return (
              <Paper
                key={day.id}
                elevation={0}
                onClick={() => setActiveDayIndex(index)}
                sx={{
                  cursor: 'pointer',
                  py: 1,
                  px: 2,
                  borderRadius: 3,
                  border: isSelected
                    ? '1.5px solid #0d766e'
                    : '1px solid rgba(13, 118, 110, 0.12)',
                  bgcolor: isSelected ? 'rgba(13, 118, 110, 0.08)' : '#ffffff',
                  boxShadow: isSelected
                    ? '0 4px 14px rgba(13, 118, 110, 0.12)'
                    : '0 2px 6px rgba(0, 0, 0, 0.02)',
                  textAlign: 'center',
                  transition: 'all 180ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                  minWidth: { xs: 84, sm: 96 },
                  '&:hover': {
                    bgcolor: isSelected ? 'rgba(13, 118, 110, 0.12)' : 'rgba(13, 118, 110, 0.04)',
                    transform: 'translateY(-1px)',
                  },
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    fontWeight: 900,
                    fontSize: '0.78rem',
                    color: isSelected ? '#0d766e' : 'text.secondary',
                    letterSpacing: '0.02em',
                  }}
                >
                  DAY {index + 1}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: isSelected ? 800 : 600,
                    color: isSelected ? '#075c57' : 'text.primary',
                    fontSize: '0.88rem',
                    mt: 0.2,
                  }}
                >
                  {day.date.slice(5, 10).replace('-', '/')}
                </Typography>
              </Paper>
            )
          })}
        </Stack>
      </Box>

      {/* Active Day Card & Timeline */}
      <Card sx={{ p: { xs: 1.5, sm: 2.25 } }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0, flex: 1 }}>
            <Avatar
              sx={{
                bgcolor: 'secondary.main',
                color: 'common.white',
                width: 38,
                height: 38,
                fontWeight: 900,
              }}
            >
              {activeDayIndex + 1}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 900 }} noWrap>
                {formatDate(activeDay.date)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {activeDay.startTime?.slice(11, 16) ?? '09:00'} 開始 · 共 {activeDay.attractions.length} 個景點
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0 }}>
            <Tooltip title={`查看 ${formatDate(activeDay.date)} 景點地圖`}>
              <IconButton
                aria-label={`查看 ${formatDate(activeDay.date)} 景點地圖`}
                disabled={activeDay.attractions.length === 0}
                onClick={() => setMapOpen(true)}
              >
                <MapRoundedIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="調整景點順序">
              <span>
                <IconButton
                  aria-label="調整景點順序"
                  disabled={activeDay.attractions.length < 2}
                  onClick={() => setSortOpen(true)}
                >
                  <SortRoundedIcon />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </Stack>

        <Divider sx={{ my: 2 }} />

        {activeDay.attractions.length === 0 ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <PlaceRoundedIcon color="disabled" sx={{ fontSize: 44, opacity: 0.6 }} />
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              這一天還沒有安排任何景點
            </Typography>
          </Box>
        ) : (
          <Stack spacing={1.5}>
            {activeDay.attractions.map((attraction, attractionIndex) => (
              <Box key={attraction.id}>
                {attractionIndex === 0 ? (
                  <Paper
                    variant="outlined"
                    sx={{
                      width: { xs: 'calc(100% - 46px)', sm: 'calc(100% - 60px)' },
                      ml: { xs: '46px', sm: '60px' },
                      mb: 1.25,
                      p: 1,
                      bgcolor: 'action.hover',
                    }}
                  >
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Box
                        sx={{
                          width: 26,
                          height: 26,
                          display: 'grid',
                          placeItems: 'center',
                          borderRadius: '50%',
                          bgcolor: 'primary.main',
                          color: 'common.white',
                          flexShrink: 0,
                        }}
                      >
                        <AccessTimeRoundedIcon sx={{ fontSize: 16 }} />
                      </Box>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography
                          variant="caption"
                          color="primary.main"
                          sx={{ display: 'block', fontWeight: 900 }}
                        >
                          出發時間
                        </Typography>
                      </Box>
                      <TextField
                        size="small"
                        type="time"
                        value={activeDay.startTime?.slice(11, 16) ?? '09:00'}
                        slotProps={{ htmlInput: { step: 300, 'aria-label': '每日開始時間' } }}
                        onChange={(event) => onStartTimeChange(activeDay.id, event.target.value)}
                        sx={{ width: { xs: 130, sm: 150 } }}
                      />
                    </Stack>
                  </Paper>
                ) : null}

                {attractionIndex > 0 ? (
                  <TravelInfoCard
                    origin={activeDay.attractions[attractionIndex - 1]}
                    attraction={attraction}
                    onEdit={() => onEditTravelInfo(activeDay.attractions[attractionIndex - 1], attraction)}
                  />
                ) : null}

                <Stack direction="row" spacing={1.25} sx={{ alignItems: 'stretch' }}>
                  <Box sx={{ width: { xs: 38, sm: 52 }, pt: 1, textAlign: 'right', flexShrink: 0 }}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontWeight: 750 }}
                    >
                      {attraction.startTime
                        ? attraction.startTime.slice(11, 16)
                        : `${9 + attractionIndex}:00`}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      width: 2,
                      bgcolor: 'primary.main',
                      opacity: 0.3,
                      borderRadius: 1,
                      my: 0.5,
                    }}
                  />
                  <Card
                    variant="outlined"
                    sx={{
                      flex: 1,
                      '&:hover': {
                        borderColor: 'primary.main',
                      },
                    }}
                  >
                    <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
                      >
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography
                            sx={{
                              fontWeight: 850,
                              overflowWrap: 'anywhere',
                            }}
                          >
                            {attraction.name}
                          </Typography>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{
                              overflowWrap: 'anywhere',
                              mt: 0.2,
                            }}
                          >
                            {attraction.locationName ||
                              attraction.description ||
                              `停留約 ${attraction.duration} 分鐘`}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center', flexShrink: 0 }}>
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
                          <IconButton
                            size="small"
                            aria-label={`編輯 ${attraction.name}`}
                            onClick={() => onEditAttraction(activeDay, attraction)}
                          >
                            <EditRoundedIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="error"
                            aria-label={`刪除 ${attraction.name}`}
                            onClick={() => onDeleteAttraction(activeDay, attraction.id)}
                          >
                            <DeleteOutlineRoundedIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      </Stack>
                      <Stack direction="row" spacing={0.75} sx={{ mt: 1.25, flexWrap: 'wrap', gap: 0.5 }}>
                        <Chip
                          size="small"
                          label={`${attraction.duration} 分鐘`}
                        />
                        {attraction.cost > 0 ? (
                          <Chip
                            size="small"
                            color="primary"
                            variant="outlined"
                            label={formatAmount(attraction.cost, currency)}
                          />
                        ) : null}
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
          sx={{
            mt: 2,
            borderStyle: 'dashed',
            '&:hover': {
              borderStyle: 'dashed',
            },
          }}
        >
          新增景點
        </Button>
      </Card>

      <AttractionSortDialog open={sortOpen} day={activeDay} onClose={() => setSortOpen(false)} onApply={applyAttractionOrder} />
      <Suspense fallback={null}>
        <GoogleItineraryMapDialog open={mapOpen} day={activeDay} onClose={() => setMapOpen(false)} />
      </Suspense>
    </Stack>
  )
}


