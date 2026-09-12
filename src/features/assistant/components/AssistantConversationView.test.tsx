import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

  it('renders PageHeader and returns directly to itinerary on back button without jumping to list', async () => {
    const onBack = vi.fn()
    let browserBackHandler: (() => boolean) | null = null

    render(
      <RiverScope overrides={[{ original: userIdProvider, create: () => 'user-1' }]}>
        <AssistantConversationView
          itineraryId="itin-1"
          itinerary={mockItinerary}
          todos={[]}
          todoCategories={['行前準備']}
          onBack={onBack}
          onRegisterBrowserBackHandler={(handler) => {
            browserBackHandler = handler
          }}
        />
      </RiverScope>,
    )

    // Wait for threads to load and initial selection to happen
    await waitFor(() => {
      expect(screen.getAllByText('東京賞櫻諮詢').length).toBeGreaterThan(0)
    })

    // The PageHeader title should be the current thread's title
    const headerTitle = screen.getByRole('heading', { level: 1 })
    expect(headerTitle).toHaveTextContent('東京賞櫻諮詢')

    // Browser back handler should be registered
    expect(browserBackHandler).toBeTypeOf('function')

    // Click the back button on PageHeader - should directly return to itinerary
    const backButton = screen.getByRole('button', { name: '返回我的行程' })
    fireEvent.click(backButton)
    expect(onBack).toHaveBeenCalledTimes(1)

    // Invoke browser back handler - should also call onBack directly
    onBack.mockClear()
    const handled = (browserBackHandler as unknown as () => boolean)()
    expect(handled).toBe(true)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('treats conversation list as a subpage and leaving it returns to the conversation', async () => {
    const onBack = vi.fn()
    let browserBackHandler: (() => boolean) | null = null

    render(
      <RiverScope overrides={[{ original: userIdProvider, create: () => 'user-1' }]}>
        <AssistantConversationView
          itineraryId="itin-1"
          itinerary={mockItinerary}
          todos={[]}
          todoCategories={['行前準備']}
          onBack={onBack}
          onRegisterBrowserBackHandler={(handler) => {
            browserBackHandler = handler
          }}
        />
      </RiverScope>,
    )

    await waitFor(() => {
      expect(screen.getAllByText('東京賞櫻諮詢').length).toBeGreaterThan(0)
    })

    const headerTitle = screen.getByRole('heading', { level: 1 })
    expect(headerTitle).toHaveTextContent('東京賞櫻諮詢')

    // 1. Open conversation list subpage
    const listButton = screen.getByRole('button', { name: '對話清單' })
    fireEvent.click(listButton)

    await waitFor(() => {
      expect(headerTitle).toHaveTextContent('對話清單')
    })

    // 2. Click "返回對話" on PageHeader -> returns to conversation
    const backToChatButton = screen.getByRole('button', { name: '返回對話' })
    fireEvent.click(backToChatButton)

    expect(headerTitle).toHaveTextContent('東京賞櫻諮詢')
    expect(onBack).not.toHaveBeenCalled()

    // 3. Open conversation list again and test browser back -> returns to conversation
    const listButton2 = screen.getByRole('button', { name: '對話清單' })
    fireEvent.click(listButton2)
    expect(headerTitle).toHaveTextContent('對話清單')

    const handled = (browserBackHandler as unknown as () => boolean)()
    expect(handled).toBe(true)
    await waitFor(() => {
      expect(headerTitle).toHaveTextContent('東京賞櫻諮詢')
    })
    expect(onBack).not.toHaveBeenCalled()
  })
})
