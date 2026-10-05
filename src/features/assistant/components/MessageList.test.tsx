import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AssistantTurnOverlay } from '../providers/assistantConversationsProvider'
import { MessageList } from './MessageList'

const mocks = vi.hoisted(() => ({ snapshot: {
  data: {
    messages: [{ id: 'user', turnId: 'turn', role: 'user', content: '晚餐 6:30', createdAt: '2026-10-04T09:00:00Z' }],
    turn: { phase: 'error', error: '生成失敗', canRetry: true } as AssistantTurnOverlay,
  }, isLoading: false, hasData: true,
} }))
vi.mock('@stball/react-river', async (importOriginal) => ({
  ...await importOriginal<typeof import('@stball/react-river')>(), useRiverWatch: () => mocks.snapshot,
}))
vi.mock('../hooks', () => ({ useActiveTurnScroll: () => ({
  activeTurnSpacerHeight: 0, activeTurnSpacerRef: null, lastUserMessageIndex: 0,
  lastUserMessageRef: null, messagesAreaRef: null, messagesEndRef: null,
}) }))
afterEach(cleanup)

describe('MessageList failure bubble', () => {
  it('shows retry with the failed assistant bubble without adding history messages', () => {
    const onRetry = vi.fn()
    render(<MessageList itineraryId="trip" threadId="thread" online onQuickPrompt={vi.fn()} onDecision={vi.fn()} onRetry={onRetry} />)
    const bubble = screen.getByRole('alert')
    expect(bubble).toHaveTextContent('生成失敗')
    const retry = screen.getByRole('button', { name: '重試' })
    expect(bubble).toContainElement(retry)
    fireEvent.click(retry)
    expect(onRetry).toHaveBeenCalledOnce()
    expect(mocks.snapshot.data.messages).toHaveLength(1)
  })

  it('disables bubble retry offline', () => {
    render(<MessageList itineraryId="trip" threadId="thread" online={false} onQuickPrompt={vi.fn()} onDecision={vi.fn()} onRetry={vi.fn()} />)
    expect(screen.getByRole('button', { name: '重試' })).toBeDisabled()
  })
})

it('keeps the real tool progress visible alongside streamed text', () => {
  const previous = mocks.snapshot.data.turn
  mocks.snapshot.data.turn = {
    phase: 'running', error: null, pendingToolCall: null,
    executionSteps: [{ label: '正在檢視第 5 天行程（第 1 輪）', startedAt: Date.now() }],
    progressLabel: '正在檢視第 5 天行程（第 1 輪）', startedAt: Date.now() - 40_000,
    streaming: { id: 'stream', turnId: 'turn', role: 'assistant', content: '我先確認第五天安排', createdAt: '2026-10-04T09:00:00Z' },
  }
  try {
    render(<MessageList itineraryId="trip" threadId="thread" online onQuickPrompt={vi.fn()} onDecision={vi.fn()} />)
    expect(screen.getByText('我先確認第五天安排')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /執行步驟.*正在檢視第 5 天行程/ })).toBeInTheDocument()
    expect(screen.getByText(/已進行 40 秒/)).toBeInTheDocument()
  } finally {
    mocks.snapshot.data.turn = previous
  }
})
