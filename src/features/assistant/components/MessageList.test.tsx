import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageList } from './MessageList'

const mocks = vi.hoisted(() => ({ snapshot: {
  data: {
    messages: [{ id: 'user', turnId: 'turn', role: 'user', content: '晚餐 6:30', createdAt: '2026-10-04T09:00:00Z' }],
    turn: { phase: 'error', error: '生成失敗', canRetry: true },
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
