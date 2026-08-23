import { act, renderHook, waitFor } from '@testing-library/react'
import { RiverScope, useRiverRef, useRiverWatch } from '@stball/react-river'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Itinerary } from '../../types/database'
import type { AssistantGraphState, AssistantMessage, AssistantProposal } from './types'
import type { AssistantThread } from '../../lib/repositories/assistantRepository'
import { userIdProvider } from '../../providers/authProviders'
import {
  assistantConversationsProvider,
  assistantThreadsProvider,
  assistantTurnActionsProvider,
} from '../../providers'
import { friendlyError } from './assistantConversationUtils'

const mocks = vi.hoisted(() => ({
  applyAssistantOperations: vi.fn(),
  createAssistantThread: vi.fn(),
  deleteAssistantThread: vi.fn(),
  listAssistantMessages: vi.fn(),
  listAssistantThreads: vi.fn(),
  renameAssistantThread: vi.fn(),
  saveAssistantMessage: vi.fn(),
  updateAssistantThreadSummary: vi.fn(),
  deleteCheckpoint: vi.fn(),
  enrichAppliedProposalPlaces: vi.fn(),
  getState: vi.fn(),
  resumeTurn: vi.fn(),
  sendTurn: vi.fn(),
  summarizeThread: vi.fn(),
}))

vi.mock('../../lib/repositories/assistantRepository', () => ({
  applyAssistantOperations: mocks.applyAssistantOperations,
  createAssistantThread: mocks.createAssistantThread,
  deleteAssistantThread: mocks.deleteAssistantThread,
  listAssistantMessages: mocks.listAssistantMessages,
  listAssistantThreads: mocks.listAssistantThreads,
  renameAssistantThread: mocks.renameAssistantThread,
  saveAssistantMessage: mocks.saveAssistantMessage,
  updateAssistantThreadSummary: mocks.updateAssistantThreadSummary,
}))

vi.mock('../../lib/assistantCheckpointer', () => ({
  SupabaseAssistantCheckpointer: class {
    deleteThread = mocks.deleteCheckpoint
  },
}))

vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) } },
}))

vi.mock('../../hooks/useOnlineStatus', () => ({ useOnlineStatus: () => true }))

vi.mock('./tools', () => ({ enrichAppliedProposalPlaces: mocks.enrichAppliedProposalPlaces }))

vi.mock('./graph', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./graph')>()),
  createAssistantGraph: () => ({
    getState: mocks.getState,
    resumeTurn: mocks.resumeTurn,
    sendTurn: mocks.sendTurn,
    summarizeThread: mocks.summarizeThread,
  }),
}))

const itinerary: Itinerary = {
  id: 'trip-1',
  title: 'Tokyo',
  ownerId: 'user-1',
  currency: 'JPY',
  days: [],
}

const thread = (id: string): AssistantThread => ({
  id,
  title: '測試對話',
  summary: '',
  updatedAt: '2026-08-22T00:00:00.000Z',
})

const userMessage = (threadId: string): AssistantMessage => ({
  id: `message-${threadId}`,
  turnId: `turn-${threadId}`,
  role: 'user',
  content: '請看附件',
  createdAt: '2026-08-22T00:00:00.000Z',
})

const graphState = (overrides: Partial<AssistantGraphState> = {}): AssistantGraphState => ({
  graphVersion: 8,
  summary: '',
  messages: [],
  request: null,
  assistantMessage: null,
  pendingToolCall: null,
  modelMessages: [],
  toolRound: 0,
  ...overrides,
})

const makeProposal = (): AssistantProposal => ({
  id: 'turn-thread-1',
  threadId: 'thread-1',
  turnId: 'turn-thread-1',
  itineraryId: itinerary.id,
  title: '調整行程',
  explanation: '將行程延後一小時',
  status: 'pending',
  createdAt: '2026-08-22T00:00:00.000Z',
  expectedDayRevisions: {},
  beforeDays: [],
  afterDays: [],
  proposedTodos: [],
  proposedCategories: [],
})

function RiverTestScope({ children }: { children: ReactNode }) {
  return (
    <RiverScope overrides={[{ original: userIdProvider, create: () => 'user-1' }]}>
      {children}
    </RiverScope>
  )
}

/**
 * 模擬 AssistantConversationView 的接線：持有選取狀態、自動選取，
 * 對話載入由 provider build 處理，跨 provider 命令交給 turn actions。
 */
function useConversationHarness() {
  const ref = useRiverRef()
  const [threadId, setThreadId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const threadProvider = assistantThreadsProvider(itinerary.id)
  const threadsState = useRiverWatch(threadProvider)
  const conversationState = useRiverWatch(
    assistantConversationsProvider({ itineraryId: itinerary.id, threadId: threadId ?? '' }),
    { enabled: Boolean(threadId) },
  )
  const turnActions = useRiverWatch(assistantTurnActionsProvider(itinerary.id))

  useEffect(() => {
    if (!threadsState.hasData) return
    const list = threadsState.data ?? []
    const currentValid = threadId && list.some((item) => item.id === threadId) ? threadId : null
    const next = currentValid ?? list[0]?.id ?? null
    if (next !== threadId) setThreadId(next)
  }, [threadId, threadsState])

  const actions = useMemo(() => ({
    select: setThreadId,
    send: (text: string) =>
      turnActions.sendMessage({
        threadId,
        text,
        attachments: [],
        context: { itinerary, todos: [], todoCategories: [] },
      })
        .catch((sendError: unknown) => {
          setError(friendlyError(sendError, '助理暫時無法回覆'))
          return null
        }),
    decide: (proposal: AssistantProposal, approved: boolean) =>
      turnActions.decideProposal({ threadId, proposal, approved }),
    remove: async (targetId: string) => {
      try {
        const deleted = await turnActions.deleteThread(targetId)
        if (deleted) setThreadId((current) => (current === targetId ? null : current))
      } catch (deleteError) {
        setError(friendlyError(deleteError, '無法刪除對話'))
      }
    },
    rename: async (targetId: string, title: string) => {
      try {
        await ref.read(threadProvider.notifier).rename(targetId, title)
      } catch (renameError) {
        setError(friendlyError(renameError, '無法重新命名對話'))
      }
    },
  }), [ref, threadId, threadProvider, turnActions])

  return {
    error,
    threadId,
    messages: conversationState?.data?.messages ?? [],
    turn: conversationState?.data?.turn ?? null,
    loading: Boolean(conversationState?.isLoading && !conversationState.hasData),
    threads: threadsState.data ?? [],
    actions,
  }
}

const renderHarness = () =>
  renderHook(() => useConversationHarness(), { wrapper: RiverTestScope })

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  mocks.listAssistantThreads.mockResolvedValue([thread('thread-1')])
  mocks.listAssistantMessages.mockResolvedValue([])
  mocks.getState.mockResolvedValue(null)
  mocks.saveAssistantMessage.mockResolvedValue(undefined)
  mocks.updateAssistantThreadSummary.mockResolvedValue(undefined)
  mocks.enrichAppliedProposalPlaces.mockResolvedValue({ failed: 0 })
})

describe('assistant turn actions', () => {
  it('repairs a completed checkpoint message missing from canonical history', async () => {
    const incomplete = userMessage('thread-1')
    const recovered: AssistantMessage = {
      id: 'assistant-1',
      turnId: incomplete.turnId,
      role: 'assistant',
      content: '已從 checkpoint 完成',
      createdAt: '2026-08-22T00:01:00.000Z',
    }
    mocks.listAssistantMessages.mockResolvedValue([incomplete])
    mocks.getState.mockResolvedValue(graphState({
      messages: [incomplete, recovered],
      assistantMessage: recovered,
    }))

    const { result } = renderHarness()

    await waitFor(() => expect(result.current.messages).toContainEqual(recovered))
    expect(result.current.turn).toBeNull()
    expect(mocks.saveAssistantMessage).toHaveBeenCalledWith('thread-1', recovered)
  })

  it('serializes proposal decisions and blocks deletion during a turn', async () => {
    const proposal = makeProposal()
    const pendingState = graphState({
      pendingToolCall: { id: 'tool-1', name: 'propose_itinerary_edit', proposal },
    })
    const resume = deferred<AssistantGraphState>()
    mocks.getState.mockResolvedValue(pendingState)
    mocks.resumeTurn.mockReturnValue(resume.promise)

    const { result } = renderHarness()
    await waitFor(() => expect(result.current.turn?.pendingToolCall?.proposal.id).toBe(proposal.id))

    let first!: Promise<void>
    let second!: Promise<void>
    act(() => {
      first = result.current.actions.decide(proposal, true)
      second = result.current.actions.decide(proposal, true)
    })
    await act(async () => {
      await result.current.actions.remove(proposal.threadId)
    })
    resume.resolve(pendingState)
    await act(async () => {
      await Promise.all([first, second])
    })

    expect(mocks.resumeTurn).toHaveBeenCalledTimes(1)
    expect(mocks.deleteAssistantThread).not.toHaveBeenCalled()

    const deletion = deferred<void>()
    mocks.deleteAssistantThread.mockReturnValue(deletion.promise)
    let deletePromise!: Promise<void>
    act(() => {
      deletePromise = result.current.actions.remove(proposal.threadId)
    })
    await act(async () => {
      await result.current.actions.decide(proposal, true)
    })
    expect(mocks.resumeTurn).toHaveBeenCalledTimes(1)
    deletion.resolve()
    await act(async () => {
      await deletePromise
    })
  })

  it('keeps the selected thread when deletion is blocked by an active turn', async () => {
    const turn = deferred<AssistantGraphState>()
    mocks.sendTurn.mockReturnValue(turn.promise)

    const { result } = renderHarness()
    await waitFor(() => expect(result.current.threadId).toBe('thread-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let sendPromise!: Promise<string | null>
    act(() => {
      sendPromise = result.current.actions.send('進行中的問題')
    })
    await waitFor(() => expect(mocks.sendTurn).toHaveBeenCalledTimes(1))

    await act(async () => {
      await result.current.actions.remove('thread-1')
    })

    expect(result.current.threadId).toBe('thread-1')
    expect(mocks.deleteAssistantThread).not.toHaveBeenCalled()

    turn.resolve(graphState({
      assistantMessage: {
        id: 'assistant-active',
        turnId: 'turn-active',
        role: 'assistant',
        content: '已完成',
        createdAt: '2026-08-22T00:01:00.000Z',
      },
    }))
    await act(async () => {
      await sendPromise
    })
  })

  it('does not start a turn while the thread deletion is pending', async () => {
    const deletion = deferred<void>()
    mocks.deleteAssistantThread.mockReturnValue(deletion.promise)

    const { result } = renderHarness()
    await waitFor(() => expect(result.current.threadId).toBe('thread-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let deletePromise!: Promise<void>
    act(() => {
      deletePromise = result.current.actions.remove('thread-1')
    })
    await waitFor(() => expect(mocks.deleteAssistantThread).toHaveBeenCalledWith('thread-1'))

    await act(async () => {
      await result.current.actions.send('不應送出的問題')
    })

    expect(mocks.sendTurn).not.toHaveBeenCalled()
    expect(result.current.error).toBe('對話正在刪除或已不存在')

    deletion.resolve()
    await act(async () => {
      await deletePromise
    })
  })

  it('does not surface a failed turn after the user switches threads', async () => {
    const firstThread = thread('thread-1')
    const secondThread = thread('thread-2')
    const turn = deferred<AssistantGraphState>()
    mocks.listAssistantThreads.mockResolvedValue([firstThread, secondThread])
    mocks.listAssistantMessages.mockImplementation(async (id: string) =>
      id === firstThread.id ? [] : [userMessage(secondThread.id)])
    mocks.sendTurn.mockReturnValue(turn.promise)

    const { result } = renderHarness()
    await waitFor(() => expect(result.current.threadId).toBe(firstThread.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let sendPromise!: Promise<string | null>
    act(() => {
      sendPromise = result.current.actions.send('新的問題')
    })
    await waitFor(() => expect(mocks.sendTurn).toHaveBeenCalledTimes(1))

    act(() => result.current.actions.select(secondThread.id))
    await waitFor(() => expect(result.current.threadId).toBe(secondThread.id))
    turn.reject(new Error('舊對話失敗'))
    await act(async () => {
      await sendPromise
    })

    expect(result.current.error).toBeNull()
  })

  it('updates renamed thread cache without refetching the collection', async () => {
    const firstThread = thread('thread-1')
    const secondThread = thread('thread-2')
    mocks.listAssistantThreads.mockResolvedValueOnce([firstThread, secondThread])

    const { result } = renderHarness()
    await waitFor(() => expect(result.current.threadId).toBe(firstThread.id))

    await act(async () => {
      await result.current.actions.rename(firstThread.id, '新標題')
    })
    act(() => result.current.actions.select(secondThread.id))

    expect(result.current.threadId).toBe(secondThread.id)
    expect(result.current.threads.find((item) => item.id === firstThread.id)?.title).toBe('新標題')
    expect(mocks.listAssistantThreads).toHaveBeenCalledTimes(1)
  })
})
