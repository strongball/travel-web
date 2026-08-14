import { Alert, Box, CircularProgress, Snackbar } from '@mui/material'
import { useRiverRef, useRiverWatch } from '@stball/react-river'
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
import { SyncNotice } from './components/SyncNotice'
import {
  TravelWorkspacePage,
} from './features/travel/TravelWorkspacePage'
import { useExpenseWorkflow } from './features/expenses/useExpenseWorkflow'
import { useBrowserNavigation } from './hooks/useBrowserNavigation'
import { useOfflineSync } from './hooks/useOfflineSync'
import { saveSnapshot } from './lib/offlineStore'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import {
  appErrorProvider,
  authReadyProvider,
  expensesProvider,
  itinerariesProvider,
  selectedItineraryIdProvider,
  sessionProvider,
  todosProvider,
} from './providers'
import {
  type Expense,
  type Itinerary,
  type TodoItem,
} from './types/database'

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
const GoogleMapsApiTestPage = lazy(() => import('./features/google/GoogleMapsApiTestPage'))

const EMPTY_ITINERARIES: Itinerary[] = []
const EMPTY_EXPENSES: Expense[] = []
const EMPTY_TODOS: TodoItem[] = []

function App() {
  const { t } = useTranslation()
  const ref = useRiverRef()

  const session = useRiverWatch(sessionProvider)
  const authReady = useRiverWatch(authReadyProvider)
  const itinerariesAsync = useRiverWatch(itinerariesProvider)
  const expensesAsync = useRiverWatch(expensesProvider)
  const todosAsync = useRiverWatch(todosProvider)
  const selectedItineraryId = useRiverWatch(selectedItineraryIdProvider)
  const error = useRiverWatch(appErrorProvider)

  const itineraries = itinerariesAsync.data ?? EMPTY_ITINERARIES
  const expenses = expensesAsync.data ?? EMPTY_EXPENSES
  const todos = todosAsync.data ?? EMPTY_TODOS
  const isRefreshing =
    itinerariesAsync.isLoading ||
    expensesAsync.isLoading ||
    todosAsync.isLoading
  const loading =
    (itinerariesAsync.isLoading && itineraries.length === 0) ||
    (expensesAsync.isLoading && expenses.length === 0)

  const [authLoading, setAuthLoading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const dataMutationVersion = useRef(0)

  const {
    getWorkspaceRoute,
    navigateView,
    registerBrowserBackHandler,
    rememberWorkspaceRoute,
    view,
    workspaceRoute,
  } = useBrowserNavigation(Boolean(session))

  const userId = session?.user.id ?? null

  const setSelectedItineraryId = useCallback(
    (value: string | null | ((current: string | null) => string | null)) => {
      ref.set(selectedItineraryIdProvider, value)
    },
    [ref],
  )

  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      ref.set(sessionProvider, data.session)
      ref.set(authReadyProvider, true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      ref.set(sessionProvider, nextSession)
      ref.set(authReadyProvider, true)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [ref])

  // Select initial or active itinerary once itineraries load
  useEffect(() => {
    if (itineraries.length === 0) return
    const currentRoute = getWorkspaceRoute()
    ref.set(selectedItineraryIdProvider, (current) =>
      currentRoute.itineraryId &&
      itineraries.some((itinerary) => itinerary.id === currentRoute.itineraryId)
        ? currentRoute.itineraryId
        : current && itineraries.some((itinerary) => itinerary.id === current)
          ? current
          : itineraries[0]?.id ?? null,
    )
  }, [getWorkspaceRoute, itineraries, ref])

  // Persist snapshot to offline store when settled
  useEffect(() => {
    if (!userId || itinerariesAsync.status !== 'data') return
    void saveSnapshot({ userId, itineraries, expenses, todos })
  }, [expenses, itineraries, itinerariesAsync.status, todos, userId])

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      ref.read(itinerariesProvider.notifier).refresh(),
      ref.read(expensesProvider.notifier).refresh(),
      ref.read(todosProvider.notifier).refresh(),
    ])
  }, [ref])

  const {
    enqueue: enqueueOfflineMutation,
    flush: flushOfflineMutations,
    pendingCount,
    syncError,
    syncState,
  } = useOfflineSync(userId, handleRefresh)

  const handleAuth = async (email: string, password: string, mode: AuthMode) => {
    setAuthLoading(true)
    ref.set(appErrorProvider, null)
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
      ref.set(
        appErrorProvider,
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
    ref.set(appErrorProvider, null)
    const redirectTo = `${window.location.origin}${window.location.pathname}`
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
    if (oauthError) {
      ref.set(appErrorProvider, oauthError.message)
      setAuthLoading(false)
    }
  }

  const markDataMutation = useCallback(() => {
    dataMutationVersion.current += 1
  }, [])
  const showNotice = useCallback((message: string) => setNotice(message), [])
  const {
    applyReceipt,
    cancelEditor,
    cancelReview,
    draft,
    handleAdd,
    handleEdit,
    handleSave,
    handleScan,
    isSaving,
    isScanning,
    receiptResult,
    setDraft,
    storedImageUrls,
  } = useExpenseWorkflow({
    itineraries,
    selectedItineraryId,
    navigateView,
    enqueueOfflineMutation,
    markDataMutation,
    showNotice,
    queuedMessage: navigator.onLine ? t('app.queued') : t('app.savedOffline'),
    unexpectedErrorMessage: t('app.unexpectedError'),
    savedMessage: t('app.saved'),
  })

  const signOut = async () => {
    await supabase.auth.signOut()
    ref.set(selectedItineraryIdProvider, null)
    navigateView('workspace', 'replace')
  }

  const handleSaveItinerary = async (itinerary: Itinerary) => {
    dataMutationVersion.current += 1
    ref.set(appErrorProvider, null)
    try {
      await ref.read(itinerariesProvider.notifier).save(itinerary, enqueueOfflineMutation)
      ref.set(selectedItineraryIdProvider, itinerary.id)
      setNotice(navigator.onLine ? t('app.queued') : t('app.savedOffline'))
    } catch (saveError) {
      ref.set(
        appErrorProvider,
        saveError instanceof Error ? saveError.message : t('app.unexpectedError'),
      )
      throw saveError
    }
  }

  const handleSaveTodo = async (todo: TodoItem) => {
    dataMutationVersion.current += 1
    ref.set(appErrorProvider, null)
    try {
      await ref.read(todosProvider.notifier).save(todo, enqueueOfflineMutation)
    } catch (saveError) {
      ref.set(
        appErrorProvider,
        saveError instanceof Error ? saveError.message : t('app.unexpectedError'),
      )
    }
  }

  const handleDeleteTodo = async (id: string) => {
    ref.set(appErrorProvider, null)
    try {
      await ref.read(todosProvider.notifier).delete(id, enqueueOfflineMutation)
    } catch (deleteError) {
      ref.set(
        appErrorProvider,
        deleteError instanceof Error
          ? deleteError.message
          : t('app.unexpectedError'),
      )
    }
  }

  const handleDeleteExpense = async (expense: Expense) => {
    if (!window.confirm(`確定要刪除「${expense.title}」嗎？`)) return
    ref.set(appErrorProvider, null)
    try {
      await ref.read(expensesProvider.notifier).delete(
        expense.id,
        expense.receiptImagePaths,
        enqueueOfflineMutation,
      )
      setNotice(navigator.onLine ? t('app.queued') : t('app.savedOffline'))
    } catch (deleteError) {
      ref.set(
        appErrorProvider,
        deleteError instanceof Error
          ? deleteError.message
          : t('app.unexpectedError'),
      )
    }
  }

  const handleDeleteItinerary = async (id: string) => {
    const itinerary = itineraries.find((item) => item.id === id)
    if (!itinerary || !window.confirm(`確定要刪除「${itinerary.title}」嗎？`)) return
    ref.set(appErrorProvider, null)
    try {
      await ref.read(itinerariesProvider.notifier).delete(id, enqueueOfflineMutation)
      ref.set(selectedItineraryIdProvider, (current) => current === id ? null : current)
      setNotice(navigator.onLine ? t('app.queued') : t('app.savedOffline'))
    } catch (deleteError) {
      ref.set(
        appErrorProvider,
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
            loading={loading || isRefreshing}
            error={error}
            onSelectItinerary={setSelectedItineraryId}
            onSaveItinerary={handleSaveItinerary}
            onSaveTodo={handleSaveTodo}
            onDeleteTodo={handleDeleteTodo}
            onDeleteItinerary={handleDeleteItinerary}
            onAddExpense={() => handleAdd()}
            onEditExpense={handleEdit}
            onDeleteExpense={handleDeleteExpense}
            onRefresh={handleRefresh}
            onSignOut={signOut}
            onOpenGoogleMapsTest={() => navigateView('google-maps-test')}
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
            onCancel={cancelEditor}
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
            onCancel={cancelReview}
          />
        ) : null}
        {view === 'google-maps-test' ? (
          <GoogleMapsApiTestPage onBack={() => navigateView('workspace')} />
        ) : null}
      </Suspense>
      <Notice value={notice} onClose={() => setNotice(null)} />
      <SyncNotice
        count={pendingCount}
        state={syncState}
        error={syncError}
        onRetry={() => void flushOfflineMutations()}
      />
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
