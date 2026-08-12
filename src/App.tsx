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
} from './features/travel/TravelWorkspacePage'
import { useExpenseWorkflow } from './features/expenses/useExpenseWorkflow'
import { useBrowserNavigation } from './hooks/useBrowserNavigation'
import {
  deleteExpense,
  deleteItinerary,
  deleteTodo,
  deleteReceiptImages,
  fetchExpenses,
  fetchItineraries,
  fetchTodos,
  saveItinerary,
  saveTodo,
} from './lib/expensesApi'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import {
  appErrorAtom,
  appLoadingAtom,
  authReadyAtom,
  expensesAtom,
  itinerariesAtom,
  sessionAtom,
} from './state/appAtoms'
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

function App() {
  const { t } = useTranslation()
  const [session, setSession] = useAtom(sessionAtom)
  const [authReady, setAuthReady] = useAtom(authReadyAtom)
  const [expenses, setExpenses] = useAtom(expensesAtom)
  const [itineraries, setItineraries] = useAtom(itinerariesAtom)
  const [todos, setTodos] = useState<TodoItem[]>([])
  const loading = useAtomValue(appLoadingAtom)
  const setLoading = useSetAtom(appLoadingAtom)
  const [error, setError] = useAtom(appErrorAtom)
  const [selectedItineraryId, setSelectedItineraryId] = useState<string | null>(null)
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
        const currentRoute = getWorkspaceRoute()
        setItineraries(nextItineraries)
        setExpenses(nextExpenses)
        setTodos(nextTodos)
        setSelectedItineraryId((current) =>
          currentRoute.itineraryId &&
          nextItineraries.some((itinerary) => itinerary.id === currentRoute.itineraryId)
            ? currentRoute.itineraryId
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
  }, [getWorkspaceRoute, setError, setExpenses, setItineraries, setLoading, t])

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
    loadData,
    markDataMutation,
    showNotice,
    unexpectedErrorMessage: t('app.unexpectedError'),
    savedMessage: t('app.saved'),
  })

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
