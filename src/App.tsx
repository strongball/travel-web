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
  deleteReceiptImages,
  downloadReceiptFiles,
  fetchExpenses,
  fetchItineraries,
  saveExpense,
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
} from './types/database'
import type { ReceiptScanResult } from './types/receipt'

type View = 'list' | 'editor' | 'review'

const ExpenseListPage = lazy(() =>
  import('./features/expenses/ExpenseListPage').then((module) => ({
    default: module.ExpenseListPage,
  })),
)
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
  const [draft, setDraft] = useAtom(expenseDraftAtom)
  const [receiptResult, setReceiptResult] = useAtom(receiptResultAtom)
  const loading = useAtomValue(appLoadingAtom)
  const setLoading = useSetAtom(appLoadingAtom)
  const [error, setError] = useAtom(appErrorAtom)
  const [view, setView] = useState<View>('list')
  const [authLoading, setAuthLoading] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [storedImageUrls, setStoredImageUrls] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const originalImagePaths = useRef<string[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextItineraries, nextExpenses] = await Promise.all([
        fetchItineraries(),
        fetchExpenses(),
      ])
      setItineraries(nextItineraries)
      setExpenses(nextExpenses)
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
    setView('editor')
  }

  const handleAdd = () => {
    const itinerary = itineraries[0]
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
      setView('review')
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
            receiptSourceLocale: result.sourceLocale,
            receiptTargetLocale: result.targetLocale,
            receiptScannedAt: new Date().toISOString(),
          }
        : current,
    )
    setReceiptResult(null)
    setView('editor')
  }

  const handleSave = async () => {
    if (!draft) return
    setIsSaving(true)
    setError(null)
    let uploaded: string[] = []
    let saved = false
    try {
      uploaded = await uploadReceiptImages(draft.imageFiles)
      const nextDraft = {
        ...draft,
        receiptImagePaths: [...draft.receiptImagePaths, ...uploaded],
        imageFiles: [],
      }
      await saveExpense(nextDraft)
      saved = true
      const removed = originalImagePaths.current.filter(
        (reference) => !nextDraft.receiptImagePaths.includes(reference),
      )
      await deleteReceiptImages(removed).catch(() => undefined)
      setDraft(null)
      setView('list')
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
    if (saved) await loadData()
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setExpenses([])
    setItineraries([])
    setView('list')
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
        {view === 'list' ? (
          <ExpenseListPage
            expenses={expenses}
            loading={loading}
            error={error}
            onAdd={handleAdd}
            onEdit={handleEdit}
            onRefresh={loadData}
            onSignOut={signOut}
            locale={navigator.language}
          />
        ) : null}
        {view === 'editor' && draft ? (
          <ExpenseEditorPage
            draft={draft}
            itineraries={itineraries}
            onChange={setDraft}
            onScan={handleScan}
            onSave={handleSave}
            onCancel={() => {
              setDraft(null)
              setError(null)
              setView('list')
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
              setView('editor')
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
