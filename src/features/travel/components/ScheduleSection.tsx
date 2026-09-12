import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import MapRoundedIcon from '@mui/icons-material/MapRounded'
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded'
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded'
import ShareRoundedIcon from '@mui/icons-material/ShareRounded'
import SortRoundedIcon from '@mui/icons-material/SortRounded'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import type { Attraction, Itinerary, TripDay } from '../../../types/database'
import { triggerHaptic } from '../../../lib/haptics'
import { SwipeContainer } from '../../../components/SwipeContainer'
import { formatDate, recalculateDayTimes } from '../travelWorkspaceUtils'
import { AttractionSortDialog } from './AttractionSortDialog'
import { DaySelectorTabs } from './schedule/DaySelectorTabs'
import { AttractionTimelineItem } from './schedule/AttractionTimelineItem'
import { ItineraryShareDialog } from './schedule/ItineraryShareDialog'

const GoogleItineraryMapDialog = lazy(() => import('../GoogleItineraryMapDialog'))

export function ScheduleSection({
  itinerary,
  days,
  currency,
  activeDayIndex: controlledActiveDayIndex,
  onActiveDayChange,
  onAddAttraction,
  onEditAttraction,
  onDuplicateAttraction,
  onEditTravelInfo,
  onDeleteAttraction,
  onStartTimeChange,
  onReorder,
}: {
  itinerary?: Itinerary
  days: TripDay[]
  currency: string
  activeDayIndex?: number
  onActiveDayChange?: (index: number) => void
  onAddAttraction: (dayId: string) => void
  onEditAttraction: (day: TripDay, attraction: Attraction) => void
  onDuplicateAttraction?: (day: TripDay, attraction: Attraction) => void
  onEditTravelInfo: (origin: Attraction, attraction: Attraction) => void
  onDeleteAttraction: (day: TripDay, id: string) => void
  onStartTimeChange: (dayId: string, time: string) => void
  onReorder: (days: TripDay[]) => void | Promise<void>
}) {
  const [internalActiveDayIndex, setInternalActiveDayIndex] = useState(0)
  const activeDayIndex = controlledActiveDayIndex ?? internalActiveDayIndex
  const setActiveDay = useCallback((updater: number | ((prev: number) => number)) => {
    const nextIndex = typeof updater === 'function' ? updater(activeDayIndex) : updater
    setInternalActiveDayIndex(nextIndex)
    onActiveDayChange?.(nextIndex)
  }, [activeDayIndex, onActiveDayChange])

  const [visibleDays, setVisibleDays] = useState(days)
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null)
  const [mapOpen, setMapOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [headerMenuAnchorEl, setHeaderMenuAnchorEl] = useState<null | HTMLElement>(null)
  const [startTimeDialogOpen, setStartTimeDialogOpen] = useState(false)
  const [editStartTime, setEditStartTime] = useState('09:00')
  const visibleDaysRef = useRef(visibleDays)
  const saveQueue = useRef(Promise.resolve())

  useEffect(() => {
    visibleDaysRef.current = days
    setVisibleDays(days)
  }, [days])

  useEffect(() => {
    if (activeDayIndex >= days.length && days.length > 0) {
      setActiveDay(Math.max(days.length - 1, 0))
    }
  }, [activeDayIndex, days.length, setActiveDay])

  const goToNextDay = useCallback(() => {
    if (activeDayIndex < days.length - 1) {
      triggerHaptic('light')
      setSlideDirection('left')
      setActiveDay((prev) => prev + 1)
    }
  }, [activeDayIndex, days.length, setActiveDay])

  const goToPrevDay = useCallback(() => {
    if (activeDayIndex > 0) {
      triggerHaptic('light')
      setSlideDirection('right')
      setActiveDay((prev) => prev - 1)
    }
  }, [activeDayIndex, setActiveDay])

  const handleTabSelectDay = (index: number) => {
    setSlideDirection(index > activeDayIndex ? 'left' : 'right')
    setActiveDay(index)
  }

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
        onSelectDay={handleTabSelectDay}
      />

      {/* Active Day Card with Touch Gesture Support */}
      <SwipeContainer
        onSwipeLeft={goToNextDay}
        onSwipeRight={goToPrevDay}
        minSwipeDistance={50}
        maxPerpendicularDistance={65}
        disabled={days.length <= 1}
      >
        <Card
          key={activeDay.id}
          sx={{
            p: { xs: 1.5, sm: 2.25 },
            animation: slideDirection === 'left' ? 'slideInFromRight 220ms cubic-bezier(0.16, 1, 0.3, 1)' : slideDirection === 'right' ? 'slideInFromLeft 220ms cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
            '@keyframes slideInFromRight': {
              '0%': { transform: 'translateX(14px)', opacity: 0.8 },
              '100%': { transform: 'translateX(0)', opacity: 1 },
            },
            '@keyframes slideInFromLeft': {
              '0%': { transform: 'translateX(-14px)', opacity: 0.8 },
              '100%': { transform: 'translateX(0)', opacity: 1 },
            },
          }}
        >
          {/* Day Header with Quick Navigation & Actions */}
          <Stack
            direction="row"
            spacing={1}
            sx={{
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0, flex: 1 }}>
              <Avatar
                sx={{
                  bgcolor: 'secondary.main',
                  color: 'common.white',
                  width: 38,
                  height: 38,
                  fontWeight: 900,
                  fontSize: '0.95rem',
                  flexShrink: 0,
                  boxShadow: (theme) => theme.palette.cardShadow,
                }}
              >
                {activeDayIndex + 1}
              </Avatar>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 850, lineHeight: 1.25 }} noWrap>
                  {formatDate(activeDay.date)}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  onClick={() => {
                    setEditStartTime(activeDay.startTime?.slice(11, 16) ?? '09:00')
                    setStartTimeDialogOpen(true)
                  }}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.4,
                    fontWeight: 650,
                    cursor: 'pointer',
                    mt: 0.2,
                    borderRadius: 1,
                    px: 0.5,
                    py: 0.1,
                    ml: -0.5,
                    transition: 'background-color 150ms ease, color 150ms ease',
                    '&:hover': {
                      bgcolor: 'action.hover',
                      color: 'primary.main',
                    },
                  }}
                  title="點擊修改每日出發時間"
                >
                  <AccessTimeRoundedIcon sx={{ fontSize: 13, opacity: 0.75 }} />
                  <span>{activeDay.startTime?.slice(11, 16) ?? '09:00'} 出發</span>
                  <span>·</span>
                  <span>{activeDay.attractions.length} 個景點</span>
                </Typography>
              </Box>
            </Stack>

            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
              <Tooltip title="新增景點">
                <IconButton
                  size="small"
                  color="primary"
                  aria-label="新增景點"
                  onClick={() => onAddAttraction(activeDay.id)}
                >
                  <AddRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>

              <Tooltip title={`查看 ${formatDate(activeDay.date)} 景點地圖`}>
                <span>
                  <IconButton
                    size="small"
                    aria-label={`查看 ${formatDate(activeDay.date)} 景點地圖`}
                    disabled={activeDay.attractions.length === 0}
                    onClick={() => setMapOpen(true)}
                  >
                    <MapRoundedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>

              <Tooltip title="更多選項">
                <IconButton
                  size="small"
                  aria-label="更多日程選項"
                  aria-haspopup="true"
                  aria-expanded={Boolean(headerMenuAnchorEl)}
                  onClick={(e) => setHeaderMenuAnchorEl(e.currentTarget)}
                >
                  <MoreVertRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>

              <Menu
                anchorEl={headerMenuAnchorEl}
                open={Boolean(headerMenuAnchorEl)}
                onClose={() => setHeaderMenuAnchorEl(null)}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
              >
                <MenuItem
                  onClick={() => {
                    setHeaderMenuAnchorEl(null)
                    setEditStartTime(activeDay.startTime?.slice(11, 16) ?? '09:00')
                    setStartTimeDialogOpen(true)
                  }}
                >
                  <ListItemIcon>
                    <AccessTimeRoundedIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>設定出發時間</ListItemText>
                </MenuItem>
                <MenuItem
                  disabled={activeDay.attractions.length < 2}
                  onClick={() => {
                    setHeaderMenuAnchorEl(null)
                    setSortOpen(true)
                  }}
                >
                  <ListItemIcon>
                    <SortRoundedIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>調整景點順序</ListItemText>
                </MenuItem>
                {itinerary ? (
                  <MenuItem
                    onClick={() => {
                      setHeaderMenuAnchorEl(null)
                      setShareOpen(true)
                    }}
                  >
                    <ListItemIcon>
                      <ShareRoundedIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>分享 / 匯出行程文字</ListItemText>
                  </MenuItem>
                ) : null}
              </Menu>
            </Stack>
          </Stack>

          <Divider sx={{ my: 1.5 }} />

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
                  onDuplicateAttraction={onDuplicateAttraction}
                  onEditTravelInfo={onEditTravelInfo}
                  onDeleteAttraction={onDeleteAttraction}
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
              py: 0.9,
              borderRadius: 2.5,
              fontWeight: 750,
              fontSize: '0.86rem',
              borderStyle: 'dashed',
              bgcolor: 'surfaceSubtle',
              borderColor: 'surfaceSubtleBorder',
              color: 'primary.main',
              '&:hover': {
                borderStyle: 'dashed',
                bgcolor: 'surfaceSubtleHover',
                borderColor: 'primary.main',
              },
            }}
          >
            新增景點
          </Button>
        </Card>
      </SwipeContainer>

      <AttractionSortDialog open={sortOpen} day={activeDay} onClose={() => setSortOpen(false)} onApply={applyAttractionOrder} />
      <Suspense fallback={null}>
        <GoogleItineraryMapDialog open={mapOpen} day={activeDay} onClose={() => setMapOpen(false)} />
      </Suspense>
      {itinerary ? (
        <ItineraryShareDialog
          open={shareOpen}
          itinerary={itinerary}
          activeDayIndex={activeDayIndex}
          onClose={() => setShareOpen(false)}
        />
      ) : null}

      <Dialog
        open={startTimeDialogOpen}
        onClose={() => setStartTimeDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>設定出發時間</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <TextField
            type="time"
            fullWidth
            label="每日開始出發時間"
            value={editStartTime}
            onChange={(e) => setEditStartTime(e.target.value)}
            slotProps={{ htmlInput: { step: 300 } }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStartTimeDialogOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={() => {
              onStartTimeChange(activeDay.id, editStartTime)
              setStartTimeDialogOpen(false)
            }}
          >
            儲存
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}

