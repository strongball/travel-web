import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import MapRoundedIcon from '@mui/icons-material/MapRounded'
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded'
import SortRoundedIcon from '@mui/icons-material/SortRounded'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import type { Attraction, TripDay } from '../../../types/database'
import { formatDate, recalculateDayTimes } from '../travelWorkspaceUtils'
import { AttractionSortDialog } from './AttractionSortDialog'
import { DaySelectorTabs } from './schedule/DaySelectorTabs'
import { AttractionTimelineItem } from './schedule/AttractionTimelineItem'

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
      <DaySelectorTabs
        days={days}
        activeDayIndex={activeDayIndex}
        onSelectDay={setActiveDayIndex}
      />

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
              <AttractionTimelineItem
                key={attraction.id}
                day={activeDay}
                attraction={attraction}
                index={attractionIndex}
                previousAttraction={attractionIndex > 0 ? activeDay.attractions[attractionIndex - 1] : undefined}
                currency={currency}
                onEditAttraction={onEditAttraction}
                onEditTravelInfo={onEditTravelInfo}
                onDeleteAttraction={onDeleteAttraction}
                onStartTimeChange={onStartTimeChange}
              />
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
