import { Alert, Box, CircularProgress, Snackbar } from '@mui/material'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'

import { LoginPage, type AuthMode } from './features/auth/LoginPage'
import {
  TravelWorkspacePage,
  type WorkspaceRoute,
  type WorkspaceSection,
  type WorkspaceView,
} from './features/travel/TravelWorkspacePage'
import {
  deleteExpense,
  deleteItinerary,
  deleteTodo,
  deleteReceiptImages,
  downloadReceiptFiles,
  fetchExpenses,
  fetchItineraries,
  fetchTodos,
  saveExpense,
  saveItinerary,
  saveTodo,
  signedReceiptUrl,
  uploadReceiptImages,
} from './lib/expensesApi'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import {
  appErrorAtom,
  appLoadingAtom,
  authReadyAtom,
  expenseDraftAtom,
  expensesAtom,
  itinerariesAtom,
  receiptResultAtom,
  sessionAtom,
} from './state/appAtoms'
import {
  emptyExpenseDraft,
  type Expense,
  type ExpenseDraft,
  type Itinerary,
  type TodoItem,
} from './types/database'
import type { ReceiptScanResult } from './types/receipt'

type View = 'workspace' | 'editor' | 'review'
type BrowserBackHandler = () => boolean
type TravelHistoryState = {
  travelApp?: boolean
  travelView?: View
  travelGuard?: boolean
  travelSection?: WorkspaceSection
  travelWorkspaceView?: WorkspaceView
  travelItineraryId?: string | null
}

const defaultWorkspaceRoute: WorkspaceRoute = {
  section: 'schedule',
  workspaceView: 'trips',
  itineraryId: null,
}

const readWorkspaceRoute = (state: unknown): WorkspaceRoute => {
  const value = state && typeof state === 'object' ? state as TravelHistoryState : {}
  return {
    section: value.travelSection ?? defaultWorkspaceRoute.section,
    workspaceView: value.travelWorkspaceView ?? defaultWorkspaceRoute.workspaceView,
    itineraryId: value.travelItineraryId ?? defaultWorkspaceRoute.itineraryId,
  }
}
const ExpenseEditorPage = lazy(() =>
  import('./features/expenses/ExpenseEditorPage').then((module) => ({
    default: module.ExpenseEditorPage,
  })),
)
const ReceiptReviewPage = lazy(() =>
  import('./features/receipts/ReceiptReviewPage').then((module) => ({
    default: module.ReceiptReviewPage,
  })),
)

function App() {
  const { t } = useTranslation()
  const [session, setSession] = useAtom(sessionAtom)
  const [authReady, setAuthReady] = useAtom(authReadyAtom)
  const [expenses, setExpenses] = useAtom(expensesAtom)
  const [itineraries, setItineraries] = useAtom(itinerariesAtom)
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [draft, setDraft] = useAtom(expenseDraftAtom)
  const [receiptResult, setReceiptResult] = useAtom(receiptResultAtom)
  const loading = useAtomValue(appLoadingAtom)
  const setLoading = useSetAtom(appLoadingAtom)
  const [error, setError] = useAtom(appErrorAtom)
  const [view, setView] = useState<View>('workspace')
  const [workspaceRoute, setWorkspaceRoute] = useState<WorkspaceRoute>(() =>
    readWorkspaceRoute(window.history.state),
  )
  const [selectedItineraryId, setSelectedItineraryId] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [storedImageUrls, setStoredImageUrls] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const originalImagePaths = useRef<string[]>([])
  const dataMutationVersion = useRef(0)
  const browserHistoryInitialized = useRef(false)
  const browserBackHandler = useRef<BrowserBackHandler | null>(null)
  const workspaceRouteRef = useRef(workspaceRoute)

  const navigateView = useCallback((nextView: View, mode: 'push' | 'replace' = 'push') => {
    const route = workspaceRouteRef.current
    const nextState = {
      ...(window.history.state && typeof window.history.state === 'object'
        ? window.history.state
        : {}),
      travelApp: true,
      travelView: nextView,
      travelGuard: false,
      travelSection: route.section,
      travelWorkspaceView: route.workspaceView,
      travelItineraryId: route.itineraryId,
    }
    if (mode === 'replace') {
      window.history.replaceState(nextState, '')
    } else {
      window.history.pushState(nextState, '')
    }
    setView(nextView)
  }, [])

  const rememberWorkspaceRoute = useCallback((route: WorkspaceRoute) => {
    workspaceRouteRef.current = route
    setWorkspaceRoute(route)
    const currentState = window.history.state && typeof window.history.state === 'object'
      ? window.history.state
      : {}
    window.history.replaceState(
      {
        ...currentState,
        travelApp: true,
        travelSection: route.section,
        travelWorkspaceView: route.workspaceView,
        travelItineraryId: route.itineraryId,
      },
      '',
    )
  }, [])

  const registerBrowserBackHandler = useCallback((handler: BrowserBackHandler | null) => {
    browserBackHandler.current = handler
  }, [])

  const loadData = useCallback(async () => {
    const requestVersion = dataMutationVersion.current
    setLoading(true)
    setError(null)
    try {
      const [nextItineraries, nextExpenses, nextTodos] = await Promise.all([
        fetchItineraries(),
        fetchExpenses(),
        fetchTodos(),
      ])
      if (dataMutationVersion.current === requestVersion) {
        setItineraries(nextItineraries)
        setExpenses(nextExpenses)
        setTodos(nextTodos)
        setSelectedItineraryId((current) =>
          workspaceRouteRef.current.itineraryId &&
          nextItineraries.some((itinerary) => itinerary.id === workspaceRouteRef.current.itineraryId)
            ? workspaceRouteRef.current.itineraryId
            : current && nextItineraries.some((itinerary) => itinerary.id === current)
              ? current
            : nextItineraries[0]?.id ?? null,
        )
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : t('app.unexpectedError'),
      )
    } finally {
      setLoading(false)
    }
  }, [setError, setExpenses, setItineraries, setLoading, t])

  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setAuthReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setAuthReady(true)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [setAuthReady, setSession])

  useEffect(() => {
    if (session) void loadData()
  }, [session, loadData])

  useEffect(() => {
    if (!session) {
      browserHistoryInitialized.current = false
      browserBackHandler.current = null
      return
    }
    if (browserHistoryInitialized.current) return

    const initialRoute = readWorkspaceRoute(window.history.state)
    workspaceRouteRef.current = initialRoute
    setWorkspaceRoute(initialRoute)
    const baseState = {
      ...(window.history.state && typeof window.history.state === 'object'
        ? window.history.state
        : {}),
      travelApp: true,
      travelView: 'workspace' as const,
      travelGuard: false,
      travelSection: initialRoute.section,
      travelWorkspaceView: initialRoute.workspaceView,
      travelItineraryId: initialRoute.itineraryId,
    }
    window.history.replaceState(baseState, '')
    window.history.pushState({ ...baseState, travelGuard: true }, '')
    browserHistoryInitialized.current = true

    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as TravelHistoryState | null
      const nextView = state?.travelView
      const isKnownView = nextView === 'workspace' || nextView === 'editor' || nextView === 'review'

      if (browserBackHandler.current?.()) {
        const route = workspaceRouteRef.current
        window.history.pushState(
          state?.travelApp
            ? {
                ...state,
                travelGuard: true,
                travelSection: route.section,
                travelWorkspaceView: route.workspaceView,
                travelItineraryId: route.itineraryId,
              }
            : {
                travelApp: true,
                travelView: 'workspace',
                travelGuard: true,
                travelSection: route.section,
                travelWorkspaceView: route.workspaceView,
                travelItineraryId: route.itineraryId,
              },
          '',
        )
        return
      }

      if (state?.travelApp && isKnownView) {
        const nextRoute = readWorkspaceRoute(state)
        workspaceRouteRef.current = nextRoute
        setWorkspaceRoute(nextRoute)
        setView(nextView)
        if (!state.travelGuard && nextView === 'workspace') {
          window.history.pushState(
            { ...state, travelView: 'workspace', travelGuard: true },
            '',
          )
        }
        return
      }

      window.history.pushState(
        {
          travelApp: true,
          travelView: 'workspace',
          travelGuard: true,
          travelSection: workspaceRouteRef.current.section,
          travelWorkspaceView: workspaceRouteRef.current.workspaceView,
          travelItineraryId: workspaceRouteRef.current.itineraryId,
        },
        '',
      )
      setView('workspace')
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [session])

  useEffect(() => {
    let active = true
    const references = draft?.receiptImagePaths ?? []
    void Promise.all(
      references.map((reference) => signedReceiptUrl(reference).catch(() => '')),
    ).then((urls) => {
      if (active) setStoredImageUrls(urls)
    })
    return () => {
      active = false
    }
  }, [draft?.receiptImagePaths])

  const handleAuth = async (email: string, password: string, mode: AuthMode) => {
    setAuthLoading(true)
    setError(null)
    try {
      if (mode === 'signUp') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.href.split('#')[0] },
        })
        if (signUpError) throw signUpError
        if (!data.session) setNotice(t('app.signUpVerify'))
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (signInError) throw signInError
      }
    } catch (authError) {
      setError(
        authError instanceof Error
          ? authError.message
          : t('app.unexpectedError'),
      )
    } finally {
      setAuthLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setAuthLoading(true)
    setError(null)
    const redirectTo = `${window.location.origin}${window.location.pathname}`
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
    if (oauthError) {
      setError(oauthError.message)
      setAuthLoading(false)
    }
  }

  const openDraft = (nextDraft: ExpenseDraft) => {
    setError(null)
    setDraft(nextDraft)
    originalImagePaths.current = [...nextDraft.receiptImagePaths]
    navigateView('editor')
  }

  const handleAdd = (itineraryId?: string) => {
    const itinerary =
      itineraries.find((item) => item.id === itineraryId) ??
      itineraries.find((item) => item.id === selectedItineraryId) ??
      itineraries[0]
    openDraft({
      ...emptyExpenseDraft(itinerary?.id ?? ''),
      currency: itinerary?.currency ?? 'TWD',
    })
  }

  const handleEdit = (expense: Expense) => {
    openDraft({
      ...expense,
      date: expense.date.slice(0, 10),
      imageFiles: [],
    })
  }

  const handleScan = async () => {
    if (!draft) return
    setIsScanning(true)
    setError(null)
    try {
      const storedFiles = await downloadReceiptFiles(draft.receiptImagePaths)
      const { compressReceiptImages } = await import('./lib/receiptImages')
      const images = await compressReceiptImages([
        ...storedFiles,
        ...draft.imageFiles,
      ])
      const { scanReceipt } = await import('./lib/receiptApi')
      const result = await scanReceipt({
        targetLocale: navigator.language || 'zh-TW',
        currencyHint: draft.currency,
        images,
      })
      setReceiptResult(result)
      navigateView('review')
    } catch (scanError) {
      setError(
        scanError instanceof Error
          ? scanError.message
          : t('app.unexpectedError'),
      )
    } finally {
      setIsScanning(false)
    }
  }

  const applyReceipt = (result: ReceiptScanResult) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            items: result.items,
            amount: result.receiptTotal ?? current.amount,
            currency: result.detectedCurrency ?? current.currency,
            receiptSourceLocale: result.sourceLocale,
            receiptTargetLocale: result.targetLocale,
            receiptScannedAt: new Date().toISOString(),
          }
        : current,
    )
    setReceiptResult(null)
    navigateView('editor', 'replace')
  }

  const handleSave = async () => {
    if (!draft) return
    dataMutationVersion.current += 1
    setIsSaving(true)
    setError(null)
    let uploaded: string[] = []
    let saved = false
    try {
      uploaded = await uploadReceiptImages(draft.imageFiles)
      const nextDraft = {
        ...draft,
        id: draft.id ?? crypto.randomUUID(),
        receiptImagePaths: [...draft.receiptImagePaths, ...uploaded],
        imageFiles: [],
      }
      await saveExpense(nextDraft)
      saved = true
      const removed = originalImagePaths.current.filter(
        (reference) => !nextDraft.receiptImagePaths.includes(reference),
      )
      await deleteReceiptImages(removed).catch(() => undefined)
      const savedExpense: Expense = {
        ...nextDraft,
        id: nextDraft.id,
        imageUrl: nextDraft.receiptImagePaths[0] ?? null,
        items: nextDraft.items,
      }
      setExpenses((current) => {
        const exists = current.some((expense) => expense.id === savedExpense.id)
        return exists
          ? current.map((expense) => (expense.id === savedExpense.id ? savedExpense : expense))
          : [savedExpense, ...current]
      })
      setDraft(null)
      navigateView('workspace', 'replace')
      setNotice(t('app.saved'))
    } catch (saveError) {
      if (!saved) await deleteReceiptImages(uploaded).catch(() => undefined)
      setError(
        saveError instanceof Error
          ? saveError.message
          : t('app.unexpectedError'),
      )
    } finally {
      setIsSaving(false)
    }
    if (saved) void loadData()
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setExpenses([])
    setItineraries([])
    setTodos([])
    setSelectedItineraryId(null)
    navigateView('workspace', 'replace')
  }

  const handleSaveItinerary = async (itinerary: Itinerary) => {
    dataMutationVersion.current += 1
    setError(null)
    try {
      await saveItinerary(itinerary)
      setItineraries((current) => {
        const exists = current.some((item) => item.id === itinerary.id)
        return exists
          ? current.map((item) => (item.id === itinerary.id ? itinerary : item))
          : [itinerary, ...current]
      })
      setSelectedItineraryId(itinerary.id)
      setNotice('行程已儲存')
      void loadData()
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : t('app.unexpectedError'),
      )
      throw saveError
    }
  }

  const handleSaveTodo = async (todo: TodoItem) => {
    dataMutationVersion.current += 1
    setError(null)
    try {
      await saveTodo(todo)
      setTodos((current) => {
        const exists = current.some((item) => item.id === todo.id)
        return exists
          ? current.map((item) => (item.id === todo.id ? todo : item))
          : [todo, ...current]
      })
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : t('app.unexpectedError'),
      )
    }
  }

  const handleDeleteTodo = async (id: string) => {
    setError(null)
    try {
      await deleteTodo(id)
      setTodos((current) => current.filter((todo) => todo.id !== id))
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t('app.unexpectedError'),
      )
    }
  }

  const handleDeleteExpense = async (expense: Expense) => {
    if (!window.confirm(`確定要刪除「${expense.title}」嗎？`)) return
    setError(null)
    try {
      await deleteExpense(expense.id)
      await deleteReceiptImages(expense.receiptImagePaths).catch(() => undefined)
      setNotice('費用已刪除')
      await loadData()
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t('app.unexpectedError'),
      )
    }
  }

  const handleDeleteItinerary = async (id: string) => {
    const itinerary = itineraries.find((item) => item.id === id)
    if (!itinerary || !window.confirm(`確定要刪除「${itinerary.title}」嗎？`)) return
    setError(null)
    try {
      await deleteItinerary(id)
      setNotice('行程已刪除')
      await loadData()
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t('app.unexpectedError'),
      )
    }
  }

  if (!authReady) {
    return (
      <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress aria-label={t('app.loadingAuth')} />
      </Box>
    )
  }

  if (!session) {
    return (
      <>
        {!isSupabaseConfigured ? (
          <Alert severity="warning" sx={{ borderRadius: 0 }}>
            {t('app.configureSupabase')}
          </Alert>
        ) : null}
        <LoginPage
          onSubmit={handleAuth}
          onGoogleSignIn={handleGoogleSignIn}
          loading={authLoading}
          error={error}
        />
        <Notice value={notice} onClose={() => setNotice(null)} />
      </>
    )
  }

  return (
    <>
      <Suspense fallback={<ScreenLoader label={t('list.loading')} />}>
        {view === 'workspace' ? (
          <TravelWorkspacePage
            itineraries={itineraries}
            expenses={expenses}
            todos={todos}
            selectedItineraryId={selectedItineraryId}
            loading={loading}
            error={error}
            onSelectItinerary={setSelectedItineraryId}
            onSaveItinerary={handleSaveItinerary}
            onSaveTodo={handleSaveTodo}
            onDeleteTodo={handleDeleteTodo}
            onDeleteItinerary={handleDeleteItinerary}
            onAddExpense={() => handleAdd()}
            onEditExpense={handleEdit}
            onDeleteExpense={handleDeleteExpense}
            onRefresh={loadData}
            onSignOut={signOut}
            onRegisterBrowserBackHandler={registerBrowserBackHandler}
            initialSection={workspaceRoute.section}
            initialWorkspaceView={workspaceRoute.workspaceView}
            onWorkspaceRouteChange={rememberWorkspaceRoute}
          />
        ) : null}
        {view === 'editor' && draft ? (
          <ExpenseEditorPage
            draft={draft}
            itineraries={itineraries}
            attractions={itineraries.find((itinerary) => itinerary.id === draft.itineraryId)?.days?.flatMap((day) => day.attractions) ?? []}
            onChange={setDraft}
            onScan={handleScan}
            onSave={handleSave}
            onCancel={() => {
              setDraft(null)
              setError(null)
              navigateView('workspace', 'replace')
            }}
            storedImageUrls={storedImageUrls}
            isScanning={isScanning}
            isSaving={isSaving}
            error={error}
          />
        ) : null}
        {view === 'review' && receiptResult && draft ? (
          <ReceiptReviewPage
            result={receiptResult}
            currency={draft.currency}
            onApply={applyReceipt}
            onCancel={() => {
              setReceiptResult(null)
              navigateView('editor', 'replace')
            }}
          />
        ) : null}
      </Suspense>
      <Notice value={notice} onClose={() => setNotice(null)} />
    </>
  )
}

function ScreenLoader({ label }: { label: string }) {
  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
      <CircularProgress aria-label={label} />
    </Box>
  )
}

function Notice({
  value,
  onClose,
}: {
  value: string | null
  onClose: () => void
}) {
  return (
    <Snackbar
      open={Boolean(value)}
      autoHideDuration={4000}
      message={value}
      onClose={onClose}
    />
  )
}

export default App
