import { act, render, screen, waitFor } from '@testing-library/react'
import { RiverScope } from '@stball/react-river'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantConversationView } from './AssistantConversationView'
import { userIdProvider } from '../../../providers/authProviders'
import type { Itinerary } from '../../../types/database'

const mockThreads = [
  { id: 'thread-1', title: '東京賞櫻諮詢', summary: '', updatedAt: '2026-03-01T10:00:00Z' },
  { id: 'thread-2', title: '預算分析', summary: '', updatedAt: '2026-03-02T10:00:00Z' },
]

const repositoryMocks = vi.hoisted(() => ({
  listAssistantThreads: vi.fn(),
  listAssistantMessages: vi.fn(),
  createAssistantThread: vi.fn(),
  deleteAssistantThread: vi.fn(),
  renameAssistantThread: vi.fn(),
  saveAssistantMessage: vi.fn(),
  updateAssistantThreadSummary: vi.fn(),
}))

vi.mock('../../../lib/repositories/assistantRepository', () => ({
  listAssistantThreads: repositoryMocks.listAssistantThreads,
  listAssistantMessages: repositoryMocks.listAssistantMessages,
  createAssistantThread: repositoryMocks.createAssistantThread,
  deleteAssistantThread: repositoryMocks.deleteAssistantThread,
  renameAssistantThread: repositoryMocks.renameAssistantThread,
  saveAssistantMessage: repositoryMocks.saveAssistantMessage,
  updateAssistantThreadSummary: repositoryMocks.updateAssistantThreadSummary,
}))

vi.mock('../../../lib/supabase', () => ({
  supabase: { auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) } },
}))

vi.mock('../../../hooks/useOnlineStatus', () => ({ useOnlineStatus: () => true }))

const mockItinerary: Itinerary = {
  id: 'itin-1',
  ownerId: 'user-1',
  title: '東京五日遊',
  startDate: '2026-04-01',
  endDate: '2026-04-05',
  days: [],
  currency: 'TWD',
  exchangeRates: {},
  todoCategories: ['行前準備'],
}

describe('AssistantConversationView Mobile & Thread Selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    repositoryMocks.listAssistantThreads.mockResolvedValue([...mockThreads])
    repositoryMocks.listAssistantMessages.mockResolvedValue([])
  })

  it('allows deselecting thread and navigating back to conversation list', async () => {
    const threadChangeCalls: Array<{ id: string | null; title?: string }> = []
    let backHandler: (() => boolean) | null = null

    render(
      <RiverScope overrides={[{ original: userIdProvider, create: () => 'user-1' }]}>
        <AssistantConversationView
          itineraryId="itin-1"
          itinerary={mockItinerary}
          todos={[]}
          todoCategories={['行前準備']}
          fullPage={true}
          onAssistantToolbarChange={() => {}}
          onThreadChange={(id, title) => {
            threadChangeCalls.push({ id, title })
          }}
          onRegisterBackHandler={(handler) => {
            backHandler = handler
          }}
        />
      </RiverScope>,
    )

    // Wait for threads to load and initial selection to happen
    await waitFor(() => {
      expect(screen.getByText('東京賞櫻諮詢')).toBeInTheDocument()
    })

    // Initially, thread-1 should be selected
    await waitFor(() => {
      expect(threadChangeCalls.some((c) => c.id === 'thread-1')).toBe(true)
    })

    // Back handler should be registered when a thread is active
    expect(backHandler).toBeTypeOf('function')

    // Simulate clicking back or opening conversation list (backHandler returns true)
    act(() => {
      const handled = backHandler!()
      expect(handled).toBe(true)
    })

    // Now threadId should become null, allowing conversation list to be opened
    await waitFor(() => {
      const lastCall = threadChangeCalls[threadChangeCalls.length - 1]
      expect(lastCall.id).toBeNull()
    })

    // And backHandler should now be unregistered (null)
    expect(backHandler).toBeNull()

    // The conversation list header should be rendered
    expect(screen.getByText('對話列表')).toBeInTheDocument()
    expect(screen.getByText('點選對話繼續討論行程')).toBeInTheDocument()
  })
})
