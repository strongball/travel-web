import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded'
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import DragHandleRoundedIcon from '@mui/icons-material/DragHandleRounded'
import DirectionsBikeRoundedIcon from '@mui/icons-material/DirectionsBikeRounded'
import DirectionsCarRoundedIcon from '@mui/icons-material/DirectionsCarRounded'
import DirectionsTransitRoundedIcon from '@mui/icons-material/DirectionsTransitRounded'
import DirectionsWalkRoundedIcon from '@mui/icons-material/DirectionsWalkRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import EventNoteRoundedIcon from '@mui/icons-material/EventNoteRounded'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'
import FlightTakeoffRoundedIcon from '@mui/icons-material/FlightTakeoffRounded'
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded'
import MapRoundedIcon from '@mui/icons-material/MapRounded'
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded'
import NavigationRoundedIcon from '@mui/icons-material/NavigationRounded'
import PaidRoundedIcon from '@mui/icons-material/PaidRounded'
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import RouteRoundedIcon from '@mui/icons-material/RouteRounded'
import SortRoundedIcon from '@mui/icons-material/SortRounded'
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded'
import {
  Alert,
  Avatar,
  Box,
  Button,
  ButtonBase,
  BottomNavigation,
  BottomNavigationAction,
  Card,
  CardActionArea,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../../components/PageHeader'
import type { MapLocation } from './MapPickerDialog'
import { estimateGoogleRoute, googleDirectionsUrl, googlePlaceUrl, type GoogleRouteEstimate, type GoogleRoutePoint } from './googleMaps'
import { supportedCurrencies } from '../../lib/currencies'

import type {
  Attraction,
  Expense,
  Itinerary,
  TodoItem,
  TripDay,
} from '../../types/database'

export type WorkspaceSection = 'schedule' | 'todos' | 'expenses' | 'overview'
export type WorkspaceView = 'trips' | 'detail'
export type WorkspaceRoute = {
  section: WorkspaceSection
  workspaceView: WorkspaceView
  itineraryId: string | null
}

const MapPickerDialog = lazy(() => import('./MapPickerDialog'))
const GoogleItineraryMapDialog = lazy(() => import('./GoogleItineraryMapDialog'))

export interface TravelWorkspacePageProps {
  itineraries: Itinerary[]
  expenses: Expense[]
  todos: TodoItem[]
  selectedItineraryId: string | null
  loading?: boolean
  error?: string | null
  onSelectItinerary: (id: string) => void
  onSaveItinerary: (itinerary: Itinerary) => void | Promise<void>
  onSaveTodo: (todo: TodoItem) => void | Promise<void>
  onDeleteTodo: (id: string) => void | Promise<void>
  onDeleteItinerary: (id: string) => void | Promise<void>
  onAddExpense: () => void
  onEditExpense: (expense: Expense) => void
  onDeleteExpense: (expense: Expense) => void | Promise<void>
  onRefresh: () => void | Promise<void>
  onSignOut: () => void | Promise<void>
  onRegisterBrowserBackHandler?: (handler: (() => boolean) | null) => void
  initialSection?: WorkspaceSection
  initialWorkspaceView?: WorkspaceView
  onWorkspaceRouteChange?: (route: WorkspaceRoute) => void
}

const transportOptions = [
  { value: 'driving', label: '開車' },
  { value: 'walking', label: '步行' },
  { value: 'transit', label: '大眾運輸' },
  { value: 'bicycling', label: '單車' },
]

const transportLabel = (mode: string | null) =>
  transportOptions.find((option) => option.value === mode)?.label ?? '大眾運輸'

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

const formatDate = (value: string | undefined, locale = 'zh-TW') => {
  if (!value) return '尚未設定日期'
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

const formatAmount = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat('zh-TW', {
      style: 'currency',
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString('zh-TW')}`
  }
}

const convertExpenseAmount = (
  expense: Expense,
  itineraryCurrency: string,
  exchangeRates?: Record<string, number>,
) => {
  if (expense.currency === itineraryCurrency) return expense.amount
  return expense.amount * (exchangeRates?.[expense.currency] ?? 1)
}

const emptyDay = (itineraryId: string, date: string): TripDay => ({
  id: crypto.randomUUID(),
  itineraryId,
  date,
  startTime: `${date}T09:00:00`,
  attractions: [],
})

const daysForRange = (itinerary: Itinerary, startDate: string, endDate: string) => {
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return itinerary.days ?? []
  }
  const existing = new Map((itinerary.days ?? []).map((day) => [day.date.slice(0, 10), day]))
  const result: TripDay[] = []
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const date = cursor.toISOString().slice(0, 10)
    result.push(existing.get(date) ?? emptyDay(itinerary.id, date))
  }
  return result
}

const formatItineraryTime = (totalMinutes: number) => {
  const hours = Math.floor(totalMinutes / 60) % 24
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

const recalculateDayTimes = (day: TripDay, attractions: Attraction[]): TripDay => {
  const [startHour, startMinute] = (day.startTime?.slice(11, 16) ?? '09:00').split(':').map(Number)
  let currentMinutes = (Number.isFinite(startHour) ? startHour : 9) * 60 + (Number.isFinite(startMinute) ? startMinute : 0)
  return {
    ...day,
    attractions: attractions.map((attraction) => {
      currentMinutes += attraction.travelTime ?? 0
      const startTime = `${day.date.slice(0, 10)}T${formatItineraryTime(currentMinutes)}:00`
      currentMinutes += Math.max(attraction.duration, 0)
      const endTime = `${day.date.slice(0, 10)}T${formatItineraryTime(currentMinutes)}:00`
      return { ...attraction, startTime, endTime }
    }),
  }
}

const emptyAttraction = (dayId: string): Attraction => ({
  id: crypto.randomUUID(),
  dayId,
  name: '',
  description: '',
  startTime: null,
  endTime: null,
  cost: 0,
  latitude: null,
  longitude: null,
  duration: 60,
  transportMode: 'transit',
  travelTime: null,
  placeId: null,
  locationName: null,
})

const attractionMapPoint = (attraction: Attraction) =>
  attraction.latitude !== null && attraction.longitude !== null
    ? { lat: attraction.latitude, lng: attraction.longitude }
    : attraction.locationName?.trim() || attraction.name.trim()

const hasAttractionMapReference = (attraction: Attraction) =>
  Boolean(
    attraction.placeId ||
      (attraction.latitude !== null && attraction.longitude !== null),
  )

const attractionRoutePoint = (attraction: Attraction): GoogleRoutePoint | null => {
  const hasCoords = attraction.latitude !== null && attraction.longitude !== null
  const hasPlaceId = Boolean(attraction.placeId)
  const label = attraction.locationName?.trim() || attraction.name.trim() || null

  if (hasCoords || hasPlaceId || label) {
    return {
      lat: attraction.latitude,
      lng: attraction.longitude,
      placeId: attraction.placeId,
      label,
    }
  }
  return null
}

export function TravelWorkspacePage({
  itineraries,
  expenses,
  todos,
  selectedItineraryId,
  loading = false,
  error = null,
  onSelectItinerary,
  onSaveItinerary,
  onSaveTodo,
  onDeleteTodo,
  onDeleteItinerary,
  onAddExpense,
  onEditExpense,
  onDeleteExpense,
  onRefresh,
  onSignOut,
  onRegisterBrowserBackHandler,
  initialSection = 'schedule',
  initialWorkspaceView = 'trips',
  onWorkspaceRouteChange,
}: TravelWorkspacePageProps) {
  const { t } = useTranslation()
  const [section, setSection] = useState<WorkspaceSection>(initialSection)
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>(initialWorkspaceView)
  const [tripEditor, setTripEditor] = useState<Itinerary | null>(null)
  const [attractionEditor, setAttractionEditor] = useState<Attraction | null>(null)
  const [travelEditor, setTravelEditor] = useState<Attraction | null>(null)
  const [travelOrigin, setTravelOrigin] = useState<Attraction | null>(null)
  const [mapPickerOpen, setMapPickerOpen] = useState(false)
  const [attractionDayId, setAttractionDayId] = useState<string | null>(null)
  const [todoTitle, setTodoTitle] = useState('')
  const [todoCategory, setTodoCategory] = useState('行前準備')
  const [saving, setSaving] = useState(false)
  const [todoSaving, setTodoSaving] = useState(false)
  const [appBarMenuAnchor, setAppBarMenuAnchor] = useState<HTMLElement | null>(null)
  const isCompactHeader = useMediaQuery('(max-width: 600px)')

  const updateWorkspaceRoute = useCallback((
    next: Partial<WorkspaceRoute>,
    itineraryId = selectedItineraryId,
  ) => {
    const route: WorkspaceRoute = {
      section: next.section ?? section,
      workspaceView: next.workspaceView ?? workspaceView,
      itineraryId,
    }
    if (next.section) setSection(next.section)
    if (next.workspaceView) setWorkspaceView(next.workspaceView)
    onWorkspaceRouteChange?.(route)
  }, [onWorkspaceRouteChange, section, selectedItineraryId, workspaceView])

  useEffect(() => {
    if (!onRegisterBrowserBackHandler) return
    const handleBrowserBack = () => {
      if (mapPickerOpen) {
        setMapPickerOpen(false)
        return true
      }
      if (tripEditor) {
        setTripEditor(null)
        return true
      }
      if (travelEditor) {
        setTravelEditor(null)
        setTravelOrigin(null)
        return true
      }
      if (attractionEditor) {
        setAttractionEditor(null)
        return true
      }
      if (workspaceView === 'detail') {
        updateWorkspaceRoute({ workspaceView: 'trips' })
        return true
      }
      return false
    }

    onRegisterBrowserBackHandler(handleBrowserBack)
    return () => onRegisterBrowserBackHandler(null)
  }, [attractionEditor, mapPickerOpen, onRegisterBrowserBackHandler, travelEditor, tripEditor, updateWorkspaceRoute, workspaceView])

  const selectedItinerary = itineraries.find(
    (itinerary) => itinerary.id === selectedItineraryId,
  )
  const selectedExpenses = expenses.filter(
    (expense) => expense.itineraryId === selectedItinerary?.id,
  )
  const selectedTodos = todos.filter(
    (todo) => todo.itineraryId === selectedItinerary?.id,
  )
  const days = selectedItinerary?.days ?? []
  const totalAmount = selectedExpenses.reduce(
    (sum, expense) => sum + convertExpenseAmount(expense, selectedItinerary?.currency ?? 'TWD', selectedItinerary?.exchangeRates),
    0,
  )
  const completedTodos = selectedTodos.filter((todo) => todo.isCompleted).length
  const categories = useMemo(() => {
    const fromTrip = selectedItinerary?.todoCategories ?? []
    return Array.from(new Set([...fromTrip, '行前準備', '旅途中', '其他']))
  }, [selectedItinerary?.todoCategories])

  const openNewTrip = () => {
    const start = new Date().toISOString().slice(0, 10)
    const id = crypto.randomUUID()
    setTripEditor({
      id,
      title: '',
      ownerId: '',
      currency: 'TWD',
      startDate: start,
      endDate: start,
      days: [emptyDay(id, start)],
      exchangeRates: { TWD: 1 },
      todoCategories: ['行前準備', '旅途中', '其他'],
    })
  }

  const saveTrip = async () => {
    if (!tripEditor?.title.trim()) return
    setSaving(true)
    try {
      await onSaveItinerary(tripEditor)
      onSelectItinerary(tripEditor.id)
      updateWorkspaceRoute({ workspaceView: 'detail' }, tripEditor.id)
      setTripEditor(null)
    } finally {
      setSaving(false)
    }
  }

  const updateTrip = (next: Itinerary) => setTripEditor(next)

  const updateTripDate = (field: 'startDate' | 'endDate', value: string) => {
    if (!tripEditor) return
    const next = { ...tripEditor, [field]: value }
    setTripEditor({
      ...next,
      days: daysForRange(next, next.startDate?.slice(0, 10) ?? value, next.endDate?.slice(0, 10) ?? value),
    })
  }

  const openNewAttraction = (dayId: string) => {
    setAttractionDayId(dayId)
    setAttractionEditor(emptyAttraction(dayId))
  }

  const openEditAttraction = (day: TripDay, attraction: Attraction) => {
    setAttractionDayId(day.id)
    setAttractionEditor(attraction)
  }

  const saveAttraction = async () => {
    if (!selectedItinerary || !attractionEditor?.name.trim() || !attractionDayId) {
      return
    }
    setSaving(true)
    try {
      const nextDays = days.map((day) => {
        if (day.id !== attractionDayId) return day
        const exists = day.attractions.some((item) => item.id === attractionEditor.id)
        const nextAttractions = exists
          ? day.attractions.map((item) => item.id === attractionEditor.id ? attractionEditor : item)
          : [...day.attractions, attractionEditor]
        return recalculateDayTimes(day, nextAttractions)
      })
      await onSaveItinerary({ ...selectedItinerary, days: nextDays })
      setAttractionEditor(null)
      setAttractionDayId(null)
    } finally {
      setSaving(false)
    }
  }

  const openTravelEditor = (origin: Attraction, attraction: Attraction) => {
    setTravelOrigin({ ...origin })
    setTravelEditor({ ...attraction, transportMode: attraction.transportMode ?? 'transit' })
  }

  const saveTravelInfo = async () => {
    if (!selectedItinerary || !travelEditor) return
    setSaving(true)
    try {
      const nextDays = days.map((day) => {
        if (!day.attractions.some((attraction) => attraction.id === travelEditor.id)) return day
        const nextAttractions = day.attractions.map((attraction) =>
          attraction.id === travelEditor.id
            ? { ...attraction, transportMode: travelEditor.transportMode, travelTime: travelEditor.travelTime }
            : attraction,
        )
        return recalculateDayTimes(day, nextAttractions)
      })
      await onSaveItinerary({ ...selectedItinerary, days: nextDays })
      setTravelEditor(null)
      setTravelOrigin(null)
    } finally {
      setSaving(false)
    }
  }

  const selectMapLocation = (location: MapLocation) => {
    setAttractionEditor((current) =>
      current
        ? {
            ...current,
            latitude: location.latitude,
            longitude: location.longitude,
            locationName: location.label || current.locationName,
            placeId: location.placeId ?? current.placeId,
          }
        : current,
    )
    setMapPickerOpen(false)
  }

  const deleteAttraction = async (day: TripDay, attractionId: string) => {
    if (!selectedItinerary) return
    const nextDays = days.map((item) => {
      if (item.id !== day.id) return item
      return recalculateDayTimes(item, item.attractions.filter((entry) => entry.id !== attractionId))
    })
    await onSaveItinerary({ ...selectedItinerary, days: nextDays })
  }

  const updateDayStartTime = async (dayId: string, time: string) => {
    if (!selectedItinerary || !time) return
    const nextDays = days.map((day) => {
      if (day.id !== dayId) return day
      return recalculateDayTimes({ ...day, startTime: `${day.date.slice(0, 10)}T${time}:00` }, day.attractions)
    })
    await onSaveItinerary({ ...selectedItinerary, days: nextDays })
  }

  const saveReorderedDays = async (nextDays: TripDay[]) => {
    if (!selectedItinerary) return
    await onSaveItinerary({ ...selectedItinerary, days: nextDays })
  }

  const addTodo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedItinerary || !todoTitle.trim()) return
    setTodoSaving(true)
    try {
      await onSaveTodo({
        id: crypto.randomUUID(),
        itineraryId: selectedItinerary.id,
        title: todoTitle.trim(),
        isCompleted: false,
        category: todoCategory,
        imagePath: null,
        images: [],
      })
      setTodoTitle('')
    } finally {
      setTodoSaving(false)
    }
  }

  const openItinerary = (id: string) => {
    onSelectItinerary(id)
    updateWorkspaceRoute({ section: 'schedule', workspaceView: 'detail' }, id)
  }

  const mapFallbackLocation = (() => {
    const day = selectedItinerary?.days?.find((item) => item.id === attractionDayId)
    const attraction = day?.attractions.find((item) => item.latitude !== null && item.longitude !== null)
    return attraction && attraction.latitude !== null && attraction.longitude !== null
      ? { latitude: attraction.latitude, longitude: attraction.longitude, label: attraction.locationName ?? '', placeId: attraction.placeId }
      : undefined
  })()

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: '#eef5f2' }}>
      <PageHeader
        title={workspaceView === 'detail' ? selectedItinerary?.title ?? 'Travel' : 'Travel'}
        subtitle={workspaceView === 'detail'
          ? `${formatDate(selectedItinerary?.startDate)} — ${formatDate(selectedItinerary?.endDate)} · ${selectedItinerary?.currency ?? ''}`
          : '把每一段旅程放在同一個地方'}
        onBack={workspaceView === 'detail' ? () => updateWorkspaceRoute({ workspaceView: 'trips' }) : undefined}
        backLabel="返回我的行程"
        actions={(
          <>
            {workspaceView === 'detail' ? (
              <Tooltip title="編輯行程">
                <IconButton onClick={() => selectedItinerary && setTripEditor(selectedItinerary)} aria-label="編輯行程">
                  <EditRoundedIcon />
                </IconButton>
              </Tooltip>
            ) : null}
            {isCompactHeader ? (
              <>
                <Tooltip title="更多操作">
                  <IconButton
                    aria-label="更多操作"
                    aria-controls={appBarMenuAnchor ? 'travel-appbar-menu' : undefined}
                    aria-haspopup="true"
                    onClick={(event) => setAppBarMenuAnchor(event.currentTarget)}
                  >
                    <MoreVertRoundedIcon />
                  </IconButton>
                </Tooltip>
                <Menu
                  id="travel-appbar-menu"
                  anchorEl={appBarMenuAnchor}
                  open={Boolean(appBarMenuAnchor)}
                  onClose={() => setAppBarMenuAnchor(null)}
                  transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                >
                  <MenuItem
                    disabled={loading}
                    onClick={() => {
                      setAppBarMenuAnchor(null)
                      void onRefresh()
                    }}
                  >
                    <ListItemIcon><RefreshRoundedIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>重新整理</ListItemText>
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setAppBarMenuAnchor(null)
                      void onSignOut()
                    }}
                  >
                    <ListItemIcon><LogoutRoundedIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>{t('list.signOut')}</ListItemText>
                  </MenuItem>
                </Menu>
              </>
            ) : (
              <>
                <Tooltip title="重新整理">
                  <span>
                    <IconButton disabled={loading} onClick={() => void onRefresh()} aria-label="重新整理">
                      <RefreshRoundedIcon />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title={t('list.signOut')}>
                  <IconButton onClick={() => void onSignOut()} aria-label={t('list.signOut')}>
                    <LogoutRoundedIcon />
                  </IconButton>
                </Tooltip>
              </>
            )}
          </>
        )}
      />

      <Container maxWidth="xl" sx={{ px: { xs: 1.5, md: 4 }, pt: { xs: 1.5, md: 2.5 }, pb: { xs: 10, md: 4 } }}>
        {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
        {workspaceView === 'trips' ? (
          <TripListPage
            itineraries={itineraries}
            selectedItineraryId={selectedItineraryId}
            loading={loading}
            onOpen={openItinerary}
            onNew={openNewTrip}
          />
        ) : selectedItinerary ? (
          <Box component="main" sx={{ minWidth: 0 }}>
            <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
              <Tabs value={section} onChange={(_, value: WorkspaceSection) => updateWorkspaceRoute({ section: value })} variant="scrollable" scrollButtons="auto" sx={{ display: { xs: 'none', md: 'flex' }, px: 1 }}>
                <Tab value="schedule" label="日程" icon={<EventNoteRoundedIcon />} iconPosition="start" />
                <Tab value="todos" label={`待辦 ${selectedTodos.length ? `(${completedTodos}/${selectedTodos.length})` : ''}`} icon={<TaskAltRoundedIcon />} iconPosition="start" />
                <Tab value="expenses" label="費用" icon={<PaidRoundedIcon />} iconPosition="start" />
                <Tab value="overview" label="總覽" icon={<PlaceRoundedIcon />} iconPosition="start" />
              </Tabs>
            </Paper>

            <Box sx={{ mt: 2 }}>
              {section === 'schedule' ? (
                <ScheduleSection
                  days={days}
                  currency={selectedItinerary.currency}
                  onAddAttraction={openNewAttraction}
                  onEditAttraction={openEditAttraction}
                  onEditTravelInfo={openTravelEditor}
                  onDeleteAttraction={(day, id) => void deleteAttraction(day, id)}
                  onStartTimeChange={(dayId, time) => void updateDayStartTime(dayId, time)}
                  onReorder={(nextDays) => void saveReorderedDays(nextDays)}
                />
              ) : null}
              {section === 'todos' ? (
                <TodoSection
                  todos={selectedTodos}
                  categories={categories}
                  title={todoTitle}
                  category={todoCategory}
                  onTitleChange={setTodoTitle}
                  onCategoryChange={setTodoCategory}
                  onSubmit={addTodo}
                  saving={todoSaving}
                  onToggle={(todo) => void onSaveTodo({ ...todo, isCompleted: !todo.isCompleted })}
                  onDelete={(todo) => void onDeleteTodo(todo.id)}
                />
              ) : null}
              {section === 'expenses' ? (
                <ExpenseSection expenses={selectedExpenses} attractions={days.flatMap((day) => day.attractions)} currency={selectedItinerary.currency} exchangeRates={selectedItinerary.exchangeRates} onAdd={onAddExpense} onEdit={onEditExpense} onDelete={onDeleteExpense} />
              ) : null}
              {section === 'overview' ? (
                <OverviewSection itinerary={selectedItinerary} days={days} expenses={selectedExpenses} todos={selectedTodos} totalAmount={totalAmount} />
              ) : null}
            </Box>
          </Box>
        ) : (
          <TripListPage
            itineraries={itineraries}
            selectedItineraryId={selectedItineraryId}
            loading={loading}
            onOpen={openItinerary}
            onNew={openNewTrip}
          />
        )}
      </Container>

      <Paper
        elevation={8}
        sx={{
          display: { xs: workspaceView === 'detail' ? 'block' : 'none', md: 'none' },
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 30,
          borderRadius: 0,
          pb: 'env(safe-area-inset-bottom)',
        }}
      >
        <BottomNavigation value={section} onChange={(_, value: WorkspaceSection) => updateWorkspaceRoute({ section: value })} showLabels>
          <BottomNavigationAction value="schedule" label="行程" icon={<EventNoteRoundedIcon />} />
          <BottomNavigationAction value="todos" label="待辦" icon={<TaskAltRoundedIcon />} />
          <BottomNavigationAction value="expenses" label="費用" icon={<PaidRoundedIcon />} />
          <BottomNavigationAction value="overview" label="總覽" icon={<PlaceRoundedIcon />} />
        </BottomNavigation>
      </Paper>

      <Dialog open={Boolean(tripEditor)} onClose={() => setTripEditor(null)} fullScreen>
        <PageHeader
          title={tripEditor?.title ? '編輯行程' : '新增行程'}
          onBack={() => setTripEditor(null)}
        />
        <DialogContent sx={{ p: 0, bgcolor: 'background.default' }}>
          {tripEditor ? (
            <Stack spacing={2} sx={{ width: '100%', maxWidth: 640, mx: 'auto', p: 2 }}>
              <TextField autoFocus label="行程名稱" value={tripEditor.title} onChange={(event) => updateTrip({ ...tripEditor, title: event.target.value })} />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField type="date" label="開始日期" value={tripEditor.startDate?.slice(0, 10) ?? ''} slotProps={{ inputLabel: { shrink: true } }} onChange={(event) => updateTripDate('startDate', event.target.value)} />
                <TextField type="date" label="結束日期" value={tripEditor.endDate?.slice(0, 10) ?? ''} slotProps={{ inputLabel: { shrink: true } }} onChange={(event) => updateTripDate('endDate', event.target.value)} />
              </Stack>
              <FormControl fullWidth>
                <InputLabel id="trip-currency-label">主要幣別</InputLabel>
                <Select labelId="trip-currency-label" label="主要幣別" value={tripEditor.currency} onChange={(event) => updateTrip({ ...tripEditor, currency: event.target.value })}>
                  {supportedCurrencies.map((currency) => <MenuItem key={currency} value={currency}>{currency}</MenuItem>)}
                </Select>
              </FormControl>
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ position: 'sticky', bottom: 0, zIndex: 2, px: 2, py: 1.5, pb: 'max(12px, env(safe-area-inset-bottom))', bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider' }}>
          {tripEditor && itineraries.some((item) => item.id === tripEditor.id) ? <Button color="error" size="small" startIcon={<DeleteOutlineRoundedIcon />} onClick={() => { void onDeleteItinerary(tripEditor.id); setTripEditor(null); updateWorkspaceRoute({ workspaceView: 'trips' }) }}>刪除</Button> : null}
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setTripEditor(null)}>取消</Button>
          <Button variant="contained" disabled={saving || !tripEditor?.title.trim()} onClick={() => void saveTrip()} startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined}>{saving ? '儲存中…' : '儲存行程'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(attractionEditor)} onClose={() => setAttractionEditor(null)} fullScreen>
        <PageHeader
          title={attractionEditor?.name ? '編輯景點' : '新增景點'}
          onBack={() => setAttractionEditor(null)}
        />
        <DialogContent sx={{ p: 0, bgcolor: 'background.default' }}>
          {attractionEditor ? (
            <Stack spacing={2} sx={{ width: '100%', maxWidth: 640, mx: 'auto', p: 2 }}>
              <TextField autoFocus label="景點名稱" value={attractionEditor.name} onChange={(event) => setAttractionEditor({ ...attractionEditor, name: event.target.value })} />
              <TextField label="地點／地址" value={attractionEditor.locationName ?? ''} onChange={(event) => setAttractionEditor({ ...attractionEditor, locationName: event.target.value })} />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
                <Button variant="outlined" startIcon={<MapRoundedIcon />} onClick={() => setMapPickerOpen(true)} sx={{ flexShrink: 0 }}>
                  在地圖上選擇
                </Button>
                <Typography variant="caption" color="text.secondary">
                  {attractionEditor.latitude !== null && attractionEditor.longitude !== null
                    ? `${attractionEditor.latitude.toFixed(5)}, ${attractionEditor.longitude.toFixed(5)}`
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
                    color={attractionEditor.latitude !== null && attractionEditor.longitude !== null ? 'success' : 'warning'}
                    label={attractionEditor.latitude !== null && attractionEditor.longitude !== null ? '座標已設定' : '尚無座標'}
                  />
                  <Chip
                    size="small"
                    color={attractionEditor.placeId ? 'success' : 'default'}
                    label={attractionEditor.placeId ? '景點 ID 已設定' : '尚無景點 ID'}
                  />
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  {attractionEditor.latitude !== null && attractionEditor.longitude !== null
                    ? `此景點可作為 Google 路線估算端點（${attractionEditor.latitude.toFixed(5)}, ${attractionEditor.longitude.toFixed(5)}）。`
                    : 'Google 路線估算需要座標；請使用上方地圖選擇來補上位置。'}
                </Typography>
                {attractionEditor.placeId ? (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, overflowWrap: 'anywhere' }}>
                    景點 ID：{attractionEditor.placeId}
                  </Typography>
                ) : null}
              </Paper>
              <TextField label="備註" multiline minRows={2} value={attractionEditor.description} onChange={(event) => setAttractionEditor({ ...attractionEditor, description: event.target.value })} />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label="停留分鐘" type="number" value={attractionEditor.duration} onChange={(event) => setAttractionEditor({ ...attractionEditor, duration: Number(event.target.value) || 60 })} />
                <TextField label={`預估花費 (${selectedItinerary?.currency ?? 'TWD'})`} type="number" value={attractionEditor.cost} onChange={(event) => setAttractionEditor({ ...attractionEditor, cost: Number(event.target.value) || 0 })} />
              </Stack>
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ position: 'sticky', bottom: 0, zIndex: 2, px: 2, py: 1.5, pb: 'max(12px, env(safe-area-inset-bottom))', bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider' }}>
          <Button onClick={() => setAttractionEditor(null)}>取消</Button>
          <Button variant="contained" disabled={saving || !attractionEditor?.name.trim()} onClick={() => void saveAttraction()} startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined}>{saving ? '儲存中…' : '儲存景點'}</Button>
        </DialogActions>
      </Dialog>

      <TravelEditorDialog
        open={Boolean(travelEditor && travelOrigin)}
        origin={travelOrigin}
        attraction={travelEditor}
        saving={saving}
        onClose={() => {
          setTravelEditor(null)
          setTravelOrigin(null)
        }}
        onChange={setTravelEditor}
        onSave={() => void saveTravelInfo()}
      />

      <Suspense fallback={null}>
        <MapPickerDialog
          open={mapPickerOpen}
          initialLocation={
            attractionEditor && attractionEditor.latitude !== null && attractionEditor.longitude !== null
              ? { latitude: attractionEditor.latitude, longitude: attractionEditor.longitude, label: attractionEditor.locationName ?? '', placeId: attractionEditor.placeId }
              : undefined
          }
          fallbackLocation={mapFallbackLocation}
          onClose={() => setMapPickerOpen(false)}
          onSelect={selectMapLocation}
        />
      </Suspense>
    </Box>
  )
}

function TripListPage({
  itineraries,
  selectedItineraryId,
  loading,
  onOpen,
  onNew,
}: {
  itineraries: Itinerary[]
  selectedItineraryId: string | null
  loading: boolean
  onOpen: (id: string) => void
  onNew: () => void
}) {
  return (
    <Stack spacing={{ xs: 2, md: 3 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800 }}>
            我的行程
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: '-0.04em' }}>
            選擇一段旅程
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            進入旅程後，再管理日程、待辦與費用。
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={onNew} sx={{ alignSelf: { xs: 'stretch', sm: 'auto' } }}>
          新增行程
        </Button>
      </Stack>

      {loading ? (
        <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, p: 3 }}>
          <Typography color="text.secondary">正在載入行程…</Typography>
        </Paper>
      ) : itineraries.length === 0 ? (
        <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, p: { xs: 3, md: 6 }, textAlign: 'center' }}>
          <FlightTakeoffRoundedIcon color="primary" sx={{ fontSize: 52 }} />
          <Typography variant="h6" sx={{ mt: 1, fontWeight: 900 }}>還沒有行程</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>建立第一個旅程，開始安排每天的景點。</Typography>
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={onNew}>建立第一個行程</Button>
        </Paper>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
            gap: { xs: 1.5, md: 2 },
          }}
        >
          {itineraries.map((itinerary) => (
            <Card
              key={itinerary.id}
              elevation={0}
              sx={{
                border: 1,
                borderColor: itinerary.id === selectedItineraryId ? 'primary.main' : 'divider',
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <CardActionArea onClick={() => onOpen(itinerary.id)} sx={{ height: '100%' }}>
                <Box sx={{ height: 8, bgcolor: itinerary.id === selectedItineraryId ? 'primary.main' : 'secondary.main' }} />
                <CardContent sx={{ p: { xs: 2, md: 2.25 }, '&:last-child': { pb: { xs: 2, md: 2.25 } } }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <Typography variant="h6" noWrap sx={{ minWidth: 0, fontWeight: 900 }}>
                      {itinerary.title || '未命名行程'}
                    </Typography>
                    {itinerary.id === selectedItineraryId ? <Chip size="small" color="primary" label="目前" /> : null}
                  </Stack>
                  <Stack direction="row" spacing={0.75} sx={{ mt: 1.5, flexWrap: 'wrap' }}>
                    <Chip size="small" icon={<CalendarMonthRoundedIcon />} label={`${formatDate(itinerary.startDate)} — ${formatDate(itinerary.endDate)}`} />
                    <Chip size="small" label={itinerary.currency} />
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                    {itinerary.days?.length ?? 0} 天行程
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      )}
    </Stack>
  )
}

function AttractionSortDialog({
  open,
  day,
  onClose,
  onApply,
}: {
  open: boolean
  day: TripDay
  onClose: () => void
  onApply: (attractions: Attraction[]) => void
}) {
  const [draftAttractions, setDraftAttractions] = useState(day.attractions)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const draftRef = useRef(draftAttractions)
  const cleanupDrag = useRef<(() => void) | null>(null)
  const draggedIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!open) return
    draftRef.current = day.attractions
    setDraftAttractions(day.attractions)
    setDraggingId(null)
    cleanupDrag.current?.()
  }, [day, open])

  useEffect(() => () => cleanupDrag.current?.(), [])

  const moveDraft = (attractionId: string, overId: string, after: boolean) => {
    const current = draftRef.current
    const fromIndex = current.findIndex((item) => item.id === attractionId)
    const overIndex = current.findIndex((item) => item.id === overId)
    if (fromIndex < 0 || overIndex < 0 || fromIndex === overIndex) return
    const insertionIndex = after ? overIndex + 1 : overIndex
    const next = [...current]
    const [moved] = next.splice(fromIndex, 1)
    const adjustedIndex = fromIndex < insertionIndex ? insertionIndex - 1 : insertionIndex
    next.splice(adjustedIndex, 0, moved)
    draftRef.current = next
    setDraftAttractions(next)
  }

  const beginPointerDrag = (event: ReactPointerEvent<HTMLElement>, attractionId: string) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    cleanupDrag.current?.()
    draggedIdRef.current = attractionId
    setDraggingId(attractionId)
    const finish = () => {
      cleanupDrag.current?.()
      cleanupDrag.current = null
      draggedIdRef.current = null
      setDraggingId(null)
    }
    const handleMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault()
      const target = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest<HTMLElement>('[data-sort-id]')
      const overId = target?.dataset.sortId
      if (!overId || overId === draggedIdRef.current) return
      const bounds = target.getBoundingClientRect()
      moveDraft(attractionId, overId, moveEvent.clientY > bounds.top + bounds.height / 2)
    }
    window.addEventListener('pointermove', handleMove, { passive: false })
    window.addEventListener('pointerup', finish, { once: true })
    window.addEventListener('pointercancel', finish, { once: true })
    cleanupDrag.current = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ pb: 1 }}>編排景點順序</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          這裡先預覽新的順序，按「套用排序」後才會更新行程。
        </Typography>
        {draftAttractions.length === 0 ? (
          <Alert severity="info">這天還沒有可以排序的景點。</Alert>
        ) : (
          <Stack spacing={1}>
            {draftAttractions.map((attraction, index) => (
              <Paper
                key={attraction.id}
                data-sort-id={attraction.id}
                variant="outlined"
                sx={{
                  p: 0.75,
                  borderRadius: 1.5,
                  opacity: draggingId === attraction.id ? 0.48 : 1,
                  transition: 'opacity 120ms ease, border-color 120ms ease',
                  borderColor: draggingId === attraction.id ? 'primary.main' : 'divider',
                }}
              >
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <IconButton
                    size="small"
                    aria-label={`拖曳排序 ${attraction.name}`}
                    onPointerDown={(event) => beginPointerDrag(event, attraction.id)}
                    sx={{ width: 42, height: 42, touchAction: 'none', cursor: draggingId === attraction.id ? 'grabbing' : 'grab', color: 'primary.main', bgcolor: 'rgba(13, 118, 110, 0.08)' }}
                  >
                    <DragHandleRoundedIcon />
                  </IconButton>
                  <Avatar sx={{ width: 28, height: 28, fontSize: '0.8rem', bgcolor: 'action.hover', color: 'text.secondary' }}>{index + 1}</Avatar>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography sx={{ fontWeight: 800, overflowWrap: 'anywhere' }}>{attraction.name || '未命名景點'}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                      {attraction.startTime?.slice(11, 16) ?? '尚未安排時間'} · {attraction.duration} 分鐘
                    </Typography>
                  </Box>
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" onClick={() => onApply(draftAttractions)}>套用排序</Button>
      </DialogActions>
    </Dialog>
  )
}

function ScheduleSection({
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

function TravelEditorDialog({
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

function TravelInfoCard({
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
      sx={{
        display: 'block',
        width: { xs: 'calc(100% - 50px)', sm: 'calc(100% - 64px)' },
        ml: { xs: '50px', sm: '64px' },
        mb: 0.75,
        p: 0.75,
        textAlign: 'left',
        alignItems: 'center',
        gap: 1,
        borderRadius: 1.5,
        borderStyle: 'dashed',
        bgcolor: 'action.hover',
        color: 'inherit',
      }}
    >
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Box sx={{ color: 'text.secondary', display: 'grid', placeItems: 'center' }}>
          {transportIcon(attraction.transportMode)}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {transportLabel(attraction.transportMode)}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
            {attraction.travelTime !== null ? `${attraction.travelTime} 分鐘` : '尚未估算移動時間'}
          </Typography>
        </Box>
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
              aria-label="在 Google 地圖開啟導航"
              sx={{ width: 40, height: 40 }}
            >
              <NavigationRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : null}
        <IconButton size="small" aria-label="編輯交通方式" onClick={onEdit}><EditRoundedIcon fontSize="small" /></IconButton>
      </Stack>
    </Paper>
  )
}

function TodoSection({
  todos,
  categories,
  title,
  category,
  onTitleChange,
  onCategoryChange,
  onSubmit,
  saving,
  onToggle,
  onDelete,
}: {
  todos: TodoItem[]
  categories: string[]
  title: string
  category: string
  onTitleChange: (value: string) => void
  onCategoryChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  saving: boolean
  onToggle: (todo: TodoItem) => void
  onDelete: (todo: TodoItem) => void
}) {
  const grouped = todos.reduce<Record<string, TodoItem[]>>((result, todo) => {
    result[todo.category] = [...(result[todo.category] ?? []), todo]
    return result
  }, {})
  return (
    <Stack spacing={2}>
      <Paper component="form" onSubmit={onSubmit} elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 4, p: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField label="新增待辦" value={title} onChange={(event) => onTitleChange(event.target.value)} sx={{ flex: 1 }} />
          <FormControl sx={{ minWidth: { sm: 140 } }}>
            <InputLabel id="todo-category-label">分類</InputLabel>
            <Select labelId="todo-category-label" label="分類" value={category} onChange={(event) => onCategoryChange(event.target.value)}>
              {categories.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
            </Select>
          </FormControl>
          <Button type="submit" variant="contained" disabled={saving || !title.trim()} startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <AddRoundedIcon />}>{saving ? '新增中…' : '新增'}</Button>
        </Stack>
      </Paper>
      {Object.entries(grouped).map(([group, items]) => (
        <Paper key={group} elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 4, overflow: 'hidden' }}>
          <Typography sx={{ px: 2, pt: 2, fontWeight: 900 }}>{group}</Typography>
          <Stack divider={<Divider />}>
            {items.map((todo) => (
              <Stack key={todo.id} direction="row" spacing={1} sx={{ alignItems: 'center', px: 1.5, py: 0.5 }}>
                <Checkbox checked={todo.isCompleted} onChange={() => onToggle(todo)} icon={<TaskAltRoundedIcon color="disabled" />} checkedIcon={<CheckRoundedIcon color="primary" />} slotProps={{ input: { 'aria-label': `完成 ${todo.title}` } }} />
                <Typography sx={{ flex: 1, textDecoration: todo.isCompleted ? 'line-through' : 'none', color: todo.isCompleted ? 'text.secondary' : 'text.primary' }}>{todo.title}</Typography>
                <IconButton size="small" color="error" aria-label={`刪除 ${todo.title}`} onClick={() => onDelete(todo)}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>
              </Stack>
            ))}
          </Stack>
        </Paper>
      ))}
      {todos.length === 0 ? <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 4, p: 4, textAlign: 'center' }}><TaskAltRoundedIcon color="disabled" sx={{ fontSize: 44 }} /><Typography color="text.secondary" sx={{ mt: 1 }}>還沒有待辦事項</Typography></Paper> : null}
    </Stack>
  )
}

function ExpenseSection({
  expenses,
  attractions,
  currency,
  exchangeRates,
  onAdd,
  onEdit,
  onDelete,
}: {
  expenses: Expense[]
  attractions: Attraction[]
  currency: string
  exchangeRates?: Record<string, number>
  onAdd: () => void
  onEdit: (expense: Expense) => void
  onDelete: (expense: Expense) => void | Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const total = expenses.reduce(
    (sum, expense) => sum + convertExpenseAmount(expense, currency, exchangeRates),
    0,
  )
  const visibleExpenses = expenses.filter((expense) => {
    const haystack = [
      expense.title,
      expense.note,
      ...expense.items.map((item) => item.localizedName || item.sourceName),
    ].join(' ').toLowerCase()
    return haystack.includes(query.trim().toLowerCase())
  })

  const attractionById = useMemo(
    () => new Map(attractions.map((attraction) => [attraction.id, attraction])),
    [attractions],
  )
  const groupedExpenses = useMemo(() => {
    const groups = new Map<string, { id: string | null; title: string; expenses: Expense[] }>()
    visibleExpenses.forEach((expense) => {
      const groupId = expense.attractionId ?? '__general__'
      const attraction = expense.attractionId ? attractionById.get(expense.attractionId) : null
      const group = groups.get(groupId) ?? {
        id: expense.attractionId,
        title: attraction?.name ?? (expense.attractionId ? '未命名景點' : '一般花費'),
        expenses: [],
      }
      group.expenses.push(expense)
      groups.set(groupId, group)
    })
    return Array.from(groups.values()).sort((a, b) => {
      if (a.id === null) return 1
      if (b.id === null) return -1
      return attractions.findIndex((attraction) => attraction.id === a.id) -
        attractions.findIndex((attraction) => attraction.id === b.id)
    })
  }, [attractionById, attractions, visibleExpenses])

  const toggleGroup = (groupId: string | null) => {
    const key = groupId ?? '__general__'
    setCollapsedGroups((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <Stack spacing={2}>
      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, p: { xs: 1.75, sm: 2 } }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
          <Box><Typography variant="body2" color="text.secondary">旅程總花費</Typography><Typography variant="h4" sx={{ fontWeight: 900 }}>{formatAmount(total, currency)}</Typography></Box>
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={onAdd}>新增費用</Button>
        </Stack>
      </Paper>
      <TextField placeholder="搜尋費用或收據品項" value={query} onChange={(event) => setQuery(event.target.value)} />
      {groupedExpenses.map((group) => {
        const groupKey = group.id ?? '__general__'
        const isCollapsed = collapsedGroups.has(groupKey)
        const groupTotal = group.expenses.reduce(
          (sum, expense) => sum + convertExpenseAmount(expense, currency, exchangeRates),
          0,
        )
        return (
          <Paper key={groupKey} elevation={0} variant="outlined" sx={{ overflow: 'hidden', borderRadius: 3 }}>
            <ButtonBase
              onClick={() => toggleGroup(group.id)}
              sx={{ display: 'block', width: '100%', textAlign: 'left' }}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: { xs: 1.5, sm: 2 }, py: 1.25 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontWeight: 800 }}>{group.title}</Typography>
                  <Typography variant="caption" color="text.secondary">{group.expenses.length} 筆</Typography>
                </Box>
                <Typography color="primary.main" sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
                  {formatAmount(groupTotal, currency)}
                </Typography>
                <ExpandMoreRoundedIcon
                  color="action"
                  sx={{
                    transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)',
                    transition: 'transform 160ms ease',
                  }}
                />
              </Stack>
            </ButtonBase>
            <Collapse in={!isCollapsed} timeout="auto" unmountOnExit>
              <Stack divider={<Divider />}>
                {group.expenses.map((expense) => (
                  <Card key={expense.id} elevation={0} sx={{ borderRadius: 0 }}>
                    <CardActionArea onClick={() => onEdit(expense)}>
                      <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
                        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography noWrap sx={{ fontWeight: 750 }}>{expense.title}</Typography>
                            <Typography variant="caption" color="text.secondary">{formatDate(expense.date)}</Typography>
                          </Box>
                          <Box sx={{ textAlign: 'right' }}>
                            <Typography color="primary.main" sx={{ fontWeight: 850, whiteSpace: 'nowrap' }}>
                              {formatAmount(convertExpenseAmount(expense, currency, exchangeRates), currency)}
                            </Typography>
                            {expense.currency !== currency ? (
                              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                                {formatAmount(expense.amount, expense.currency)}
                              </Typography>
                            ) : null}
                          </Box>
                          <IconButton
                            size="small"
                            color="error"
                            aria-label={`刪除 ${expense.title}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              void onDelete(expense)
                            }}
                          >
                            <DeleteOutlineRoundedIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                        {expense.items.length ? (
                          <Stack direction="row" spacing={0.75} sx={{ mt: 0.5, alignItems: 'center', minWidth: 0 }}>
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0, flex: 1 }}>
                              {expense.items.slice(0, 1).map((item) => item.localizedName || item.sourceName).join(' · ')}
                            </Typography>
                            {expense.items.length > 1 ? (
                              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                                +{expense.items.length - 1} 項
                              </Typography>
                            ) : null}
                          </Stack>
                        ) : null}
                      </CardContent>
                    </CardActionArea>
                  </Card>
                ))}
              </Stack>
            </Collapse>
          </Paper>
        )
      })}
      {expenses.length === 0 ? <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, p: 4, textAlign: 'center' }}><PaidRoundedIcon color="disabled" sx={{ fontSize: 44 }} /><Typography color="text.secondary" sx={{ mt: 1 }}>這趟旅程還沒有費用</Typography><Button sx={{ mt: 2 }} onClick={onAdd}>新增第一筆費用</Button></Paper> : null}
      {expenses.length > 0 && groupedExpenses.length === 0 ? <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, p: 3, textAlign: 'center' }}><Typography color="text.secondary">找不到符合的費用</Typography></Paper> : null}
    </Stack>
  )
}

function OverviewSection({
  itinerary,
  days,
  expenses,
  todos,
  totalAmount,
}: {
  itinerary: Itinerary
  days: TripDay[]
  expenses: Expense[]
  todos: TodoItem[]
  totalAmount: number
}) {
  const attractionCount = days.reduce((sum, day) => sum + day.attractions.length, 0)
  const completed = todos.filter((todo) => todo.isCompleted).length
  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
        <StatCard label="行程天數" value={`${days.length} 天`} icon={<CalendarMonthRoundedIcon />} />
        <StatCard label="景點" value={`${attractionCount}`} icon={<PlaceRoundedIcon />} />
        <StatCard label="待辦完成" value={`${completed}/${todos.length || 0}`} icon={<TaskAltRoundedIcon />} />
        <StatCard label="總花費" value={formatAmount(totalAmount, itinerary.currency)} icon={<PaidRoundedIcon />} />
      </Box>
      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 4, p: 2.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 900 }}>旅程摘要</Typography>
        <Stack spacing={1.5} sx={{ mt: 2 }}>
          <SummaryRow label="日期" value={`${formatDate(itinerary.startDate)} — ${formatDate(itinerary.endDate)}`} />
          <SummaryRow label="主要幣別" value={itinerary.currency} />
          <SummaryRow label="費用筆數" value={`${expenses.length} 筆`} />
          <SummaryRow label="自訂匯率" value={`${Object.keys(itinerary.exchangeRates ?? {}).length} 種幣別`} />
        </Stack>
      </Paper>
    </Stack>
  )
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, p: { xs: 1.5, md: 2 }, minWidth: 0 }}><Stack spacing={1} sx={{ minWidth: 0 }}><Box sx={{ color: 'primary.main' }}>{icon}</Box><Typography variant="caption" color="text.secondary" noWrap>{label}</Typography><Typography sx={{ fontWeight: 900, fontSize: { xs: '0.95rem', md: '1.15rem' }, overflowWrap: 'anywhere' }}>{value}</Typography></Stack></Paper>
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}><Typography color="text.secondary">{label}</Typography><Typography sx={{ fontWeight: 700, textAlign: 'right' }}>{value}</Typography></Stack>
}

export default TravelWorkspacePage
