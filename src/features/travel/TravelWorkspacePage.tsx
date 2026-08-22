import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  Alert,
  Box,
  Container,
} from '@mui/material'
import type { MapLocation } from './MapPickerDialog'
import { missingExchangeRateCurrencies } from '../../lib/currencies'
import {
  convertExpenseAmount,
  daysForRange,
  emptyAttraction,
  emptyDay,
  formatDate,
  recalculateDayTimes,
  type WorkspaceRoute,
  type WorkspaceSection,
  type WorkspaceView,
} from './travelWorkspaceUtils'
import { ExpenseSection } from './components/ExpenseSection'
import { OverviewSection } from './components/OverviewSection'
import { ScheduleSection } from './components/ScheduleSection'
import { TodoSection } from './components/TodoSection'
import { TravelEditorDialog } from './components/TravelInfo'
import { TripListPage } from './components/TripListPage'
import { AttractionEditorDialog } from './components/AttractionEditorDialog'
import { TripEditorDialog } from './components/TripEditorDialog'
import { TravelWorkspaceHeader } from './components/TravelWorkspaceHeader'
import {
  WorkspaceBottomNav,
  WorkspaceDesktopTabs,
} from './components/navigation/WorkspaceNavigation'
import type {
  Attraction,
  Expense,
  Itinerary,
  TodoItem,
  TripDay,
} from '../../types/database'
export type { WorkspaceRoute, WorkspaceSection, WorkspaceView } from './travelWorkspaceUtils'

const MapPickerDialog = lazy(() => import('./MapPickerDialog'))
const AssistantSection = lazy(() => import('../assistant/AssistantSection'))

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
  onOpenGoogleMapsTest: () => void
  onRegisterBrowserBackHandler?: (handler: (() => boolean) | null) => void
  initialSection?: WorkspaceSection
  initialWorkspaceView?: WorkspaceView
  onWorkspaceRouteChange?: (route: WorkspaceRoute) => void
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
  onOpenGoogleMapsTest,
  onRegisterBrowserBackHandler,
  initialSection = 'schedule',
  initialWorkspaceView = 'trips',
  onWorkspaceRouteChange,
}: TravelWorkspacePageProps) {
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
  const [assistantToolbar, setAssistantToolbar] = useState<ReactNode>(null)
  const handleAssistantToolbarChange = useCallback((toolbar: ReactNode) => {
    setAssistantToolbar(toolbar)
  }, [])

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
    if (section !== 'assistant') setAssistantToolbar(null)
  }, [section])

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
      if (workspaceView === 'detail' && section === 'assistant') {
        updateWorkspaceRoute({ section: 'schedule' })
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
  }, [attractionEditor, mapPickerOpen, onRegisterBrowserBackHandler, section, travelEditor, tripEditor, updateWorkspaceRoute, workspaceView])

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
  const missingExpenseCurrencies = selectedItinerary
    ? missingExchangeRateCurrencies(
        selectedExpenses.map((expense) => expense.currency),
        selectedItinerary.currency,
        selectedItinerary.exchangeRates,
      )
    : []
  const totalAmount = missingExpenseCurrencies.length === 0
    ? selectedExpenses.reduce(
        (sum, expense) => sum + convertExpenseAmount(expense, selectedItinerary?.currency ?? 'TWD', selectedItinerary?.exchangeRates),
        0,
      )
    : null
  const completedTodos = selectedTodos.filter((todo) => todo.isCompleted).length
  const categories = useMemo(() => {
    const fromTrip = selectedItinerary?.todoCategories ?? []
    const fromTodos = selectedTodos.map((todo) => todo.category).filter(Boolean)
    const merged = Array.from(new Set([...fromTrip, ...fromTodos]))
    return merged.length > 0 ? merged : ['行前準備', '旅途中', '其他']
  }, [selectedItinerary?.todoCategories, selectedTodos])

  useEffect(() => {
    if (!categories.includes(todoCategory)) {
      setTodoCategory(categories[0] ?? '其他')
    }
  }, [categories, todoCategory])

  const handleSaveCategories = useCallback(
    async (nextCategories: string[]) => {
      if (!selectedItinerary) return
      await onSaveItinerary({
        ...selectedItinerary,
        todoCategories: nextCategories,
      })
    },
    [onSaveItinerary, selectedItinerary],
  )

  const handleRenameCategory = useCallback(
    async (oldName: string, newName: string) => {
      if (!selectedItinerary || !oldName || !newName || oldName === newName) return
      const currentCats =
        selectedItinerary.todoCategories && selectedItinerary.todoCategories.length > 0
          ? selectedItinerary.todoCategories
          : ['行前準備', '旅途中', '其他']
      const nextCats = currentCats.map((cat) => (cat === oldName ? newName : cat))
      await onSaveItinerary({
        ...selectedItinerary,
        todoCategories: nextCats,
      })

      const todosToUpdate = selectedTodos.filter((todo) => todo.category === oldName)
      for (const todo of todosToUpdate) {
        await onSaveTodo({ ...todo, category: newName })
      }
      if (todoCategory === oldName) {
        setTodoCategory(newName)
      }
    },
    [onSaveItinerary, onSaveTodo, selectedItinerary, selectedTodos, todoCategory],
  )

  const handleDeleteCategory = useCallback(
    async (categoryName: string) => {
      if (!selectedItinerary || !categoryName) return
      const currentCats =
        selectedItinerary.todoCategories && selectedItinerary.todoCategories.length > 0
          ? selectedItinerary.todoCategories
          : ['行前準備', '旅途中', '其他']
      const nextCats = currentCats.filter((cat) => cat !== categoryName)
      const validNextCats = nextCats.length > 0 ? nextCats : ['其他']
      await onSaveItinerary({
        ...selectedItinerary,
        todoCategories: validNextCats,
      })

      const fallback = validNextCats[0] || '其他'
      const todosToUpdate = selectedTodos.filter((todo) => todo.category === categoryName)
      await Promise.all(todosToUpdate.map((todo) => onSaveTodo({ ...todo, category: fallback })))
      if (todoCategory === categoryName) {
        setTodoCategory(fallback)
      }
    },
    [onSaveItinerary, onSaveTodo, selectedItinerary, selectedTodos, todoCategory],
  )
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
    <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default' }}>
      <TravelWorkspaceHeader
        title={workspaceView === 'detail' && section === 'assistant' ? '旅程助理' : workspaceView === 'detail' ? selectedItinerary?.title ?? 'Travel' : 'Travel'}
        subtitle={workspaceView === 'detail' && section === 'assistant'
          ? selectedItinerary?.title ?? 'Travel'
          : workspaceView === 'detail'
          ? `${formatDate(selectedItinerary?.startDate)} — ${formatDate(selectedItinerary?.endDate)} · ${selectedItinerary?.currency ?? ''}`
          : '把每一段旅程放在同一個地方'}
        loading={loading}
        showBack={workspaceView === 'detail'}
        canEdit={workspaceView === 'detail' && section !== 'assistant' && Boolean(selectedItinerary)}
        canOpenAssistant={workspaceView === 'detail' && section !== 'assistant' && Boolean(selectedItinerary)}
        assistantMode={workspaceView === 'detail' && section === 'assistant'}
        assistantActions={assistantToolbar}
        onBack={() => section === 'assistant' ? updateWorkspaceRoute({ section: 'schedule' }) : updateWorkspaceRoute({ workspaceView: 'trips' })}
        onEdit={() => selectedItinerary && setTripEditor(selectedItinerary)}
        onOpenAssistant={() => updateWorkspaceRoute({ section: 'assistant' })}
        onOpenGoogleMapsTest={onOpenGoogleMapsTest}
        onRefresh={onRefresh}
        onSignOut={onSignOut}
      />

      <Container maxWidth={section === 'assistant' ? false : 'xl'} sx={{ px: section === 'assistant' ? 0 : { xs: 1.5, md: 4 }, pt: section === 'assistant' ? 0 : { xs: 1.5, md: 2.5 }, pb: section === 'assistant' ? 0 : { xs: 10, md: 4 } }}>
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
            {section !== 'assistant' ? (
              <WorkspaceDesktopTabs
                section={section}
                todoCount={selectedTodos.length}
                completedTodoCount={completedTodos}
                onSectionChange={(value) => updateWorkspaceRoute({ section: value })}
              />
            ) : null}

            <Box sx={{ mt: section === 'assistant' ? 0 : { xs: 0, md: 2 } }}>
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
              {section === 'assistant' ? (
                <Suspense fallback={<Box sx={{ display: 'grid', placeItems: 'center', minHeight: 300 }}>載入旅程助理…</Box>}>
                  <AssistantSection
                    itinerary={selectedItinerary}
                    todos={selectedTodos}
                    todoCategories={categories}
                    onItineraryApplied={onRefresh}
                    fullPage
                    onAssistantToolbarChange={handleAssistantToolbarChange}
                  />
                </Suspense>
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
                  onSaveTodo={(todo) => void onSaveTodo(todo)}
                  onSaveCategories={(cats) => void handleSaveCategories(cats)}
                  onRenameCategory={(oldName, newName) => void handleRenameCategory(oldName, newName)}
                  onDeleteCategory={(cat) => void handleDeleteCategory(cat)}
                />
              ) : null}
              {section === 'expenses' ? (
                <ExpenseSection
                  expenses={selectedExpenses}
                  attractions={days.flatMap((day) => day.attractions)}
                  currency={selectedItinerary.currency}
                  exchangeRates={selectedItinerary.exchangeRates}
                  onAdd={onAddExpense}
                  onEdit={onEditExpense}
                  onDelete={onDeleteExpense}
                  onEditTrip={() => setTripEditor(selectedItinerary)}
                />
              ) : null}
              {section === 'overview' ? (
                <OverviewSection
                  itinerary={selectedItinerary}
                  days={days}
                  expenses={selectedExpenses}
                  todos={selectedTodos}
                  totalAmount={totalAmount}
                  onEditTrip={() => setTripEditor(selectedItinerary)}
                />
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

      <WorkspaceBottomNav
        section={section}
        visible={workspaceView === 'detail' && section !== 'assistant'}
        onSectionChange={(value) => updateWorkspaceRoute({ section: value })}
      />

      <TripEditorDialog
        itinerary={tripEditor}
        saving={saving}
        canDelete={Boolean(tripEditor && itineraries.some((item) => item.id === tripEditor.id))}
        expenseCurrencies={tripEditor ? expenses.filter((expense) => expense.itineraryId === tripEditor.id).map((expense) => expense.currency) : []}
        onClose={() => setTripEditor(null)}
        onChange={updateTrip}
        onDateChange={updateTripDate}
        onDelete={() => {
          if (!tripEditor) return
          void onDeleteItinerary(tripEditor.id)
          setTripEditor(null)
          updateWorkspaceRoute({ workspaceView: 'trips' })
        }}
        onSave={() => void saveTrip()}
      />

      <AttractionEditorDialog
        attraction={attractionEditor}
        currency={selectedItinerary?.currency ?? 'TWD'}
        saving={saving}
        onClose={() => setAttractionEditor(null)}
        onChange={setAttractionEditor}
        onOpenMap={() => setMapPickerOpen(true)}
        onSave={() => void saveAttraction()}
      />

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

export default TravelWorkspacePage
