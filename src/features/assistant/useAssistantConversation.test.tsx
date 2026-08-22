import { act, renderHook, waitFor } from '@testing-library/react'
import { RiverScope, useRiverWatch } from '@stball/react-river'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FormEvent, ReactNode } from 'react'
import type { Itinerary } from '../../types/database'
import type { AssistantGraphState, AssistantMessage, AssistantProposal } from './types'
import type { AssistantThread } from '../../lib/repositories/assistantRepository'
import { userIdProvider } from '../../providers/authProviders'
import { assistantConversationsProvider, assistantThreadsProvider } from '../../providers'

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

import { useAssistantConversation } from './useAssistantConversation'

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

const userMessage = (threadId: string, attachments: AssistantMessage['attachments'] = null): AssistantMessage => ({
  id: `message-${threadId}`,
  turnId: `turn-${threadId}`,
  role: 'user',
  content: '請看附件',
  createdAt: '2026-08-22T00:00:00.000Z',
  attachments,
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

const submitEvent = () => ({ preventDefault: vi.fn() }) as unknown as FormEvent

function RiverTestScope({ children }: { children: ReactNode }) {
  return (
    <RiverScope overrides={[{ original: userIdProvider, create: () => 'user-1' }]}>
      {children}
    </RiverScope>
  )
}

const renderConversationHook = (onItineraryApplied: () => void | Promise<void>) =>
  renderHook(() => {
    const controller = useAssistantConversation(itinerary, onItineraryApplied)
    const conversation = useRiverWatch(assistantConversationsProvider(controller.threadId ?? ''))
    const threadState = useRiverWatch(assistantThreadsProvider(controller.itineraryId))
    const view = {
      messages: conversation.data?.messages ?? [],
      turn: conversation.data?.turn ?? null,
      loading: conversation.isLoading && !conversation.hasData,
    }
    const threads = threadState.data ?? []
    return { controller, view, threads }
  }, {
    wrapper: RiverTestScope,
  })

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

describe('useAssistantConversation', () => {
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

    const onItineraryApplied = vi.fn()
    const { result } = renderConversationHook(onItineraryApplied)

    await waitFor(() => expect(result.current.view.messages).toContainEqual(recovered))
    expect(result.current.view.turn).toBeNull()
    expect(mocks.saveAssistantMessage).toHaveBeenCalledWith('thread-1', recovered)
  })

  it('serializes proposal decisions and blocks deletion during a turn', async () => {
    const proposal: AssistantProposal = {
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
    }
    const pendingState = graphState({
      pendingToolCall: { id: 'tool-1', name: 'propose_itinerary_edit', proposal },
    })
    const resume = deferred<AssistantGraphState>()
    mocks.getState.mockResolvedValue(pendingState)
    mocks.resumeTurn.mockReturnValue(resume.promise)

    const onItineraryApplied = vi.fn()
    const { result } = renderConversationHook(onItineraryApplied)
    await waitFor(() => expect(result.current.view.turn?.pendingToolCall?.proposal.id).toBe(proposal.id))

    let first!: Promise<void>
    let second!: Promise<void>
    act(() => {
      first = result.current.controller.actions.decideProposal(proposal, true)
      second = result.current.controller.actions.decideProposal(proposal, true)
    })
    await act(async () => {
      await result.current.controller.threads.deleteThread(proposal.threadId)
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
      deletePromise = result.current.controller.threads.deleteThread(proposal.threadId)
    })
    await act(async () => {
      await result.current.controller.actions.decideProposal(proposal, true)
    })
    expect(mocks.resumeTurn).toHaveBeenCalledTimes(1)
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

    const onItineraryApplied = vi.fn()
    const { result } = renderConversationHook(onItineraryApplied)
    await waitFor(() => expect(result.current.controller.threadId).toBe(firstThread.id))
    await waitFor(() => expect(result.current.view.loading).toBe(false))

    act(() => result.current.controller.composer.setText('新的問題'))
    let sendPromise!: Promise<void>
    act(() => {
      sendPromise = result.current.controller.actions.send(submitEvent())
    })
    await waitFor(() => expect(mocks.sendTurn).toHaveBeenCalledTimes(1))

    act(() => result.current.controller.threads.selectThread(secondThread.id))
    await waitFor(() => expect(result.current.controller.threadId).toBe(secondThread.id))
    turn.reject(new Error('舊對話失敗'))
    await act(async () => {
      await sendPromise
    })

    expect(result.current.controller.feedback.error).toBeNull()
  })

  it('updates renamed thread cache without refetching the collection', async () => {
    const firstThread = thread('thread-1')
    const secondThread = thread('thread-2')
    mocks.listAssistantThreads.mockResolvedValueOnce([firstThread, secondThread])

    const onItineraryApplied = vi.fn()
    const { result } = renderConversationHook(onItineraryApplied)
    await waitFor(() => expect(result.current.controller.threadId).toBe(firstThread.id))

    await act(async () => {
      await result.current.controller.threads.renameThread(firstThread.id, '新標題')
    })
    act(() => result.current.controller.threads.selectThread(secondThread.id))

    expect(result.current.controller.threadId).toBe(secondThread.id)
    expect(result.current.threads.find((item) => item.id === firstThread.id)?.title).toBe('新標題')
    expect(mocks.listAssistantThreads).toHaveBeenCalledTimes(1)
  })
})
