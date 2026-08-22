import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MessageBubble } from './MessageBubble'
import type { AssistantMessage } from '../types'

const assistantMessage: AssistantMessage = {
  id: 'assistant-1',
  turnId: 'turn-1',
  role: 'assistant',
  content: '**即時 Markdown**\n\n正在產生回覆',
  createdAt: '2026-08-22T11:00:00Z',
}

describe('MessageBubble', () => {
  it('renders streamed Markdown with an active typing caret', () => {
    const { container } = render(<MessageBubble message={assistantMessage} streaming />)

    expect(screen.getByText('即時 Markdown')).toBeInTheDocument()
    expect(screen.getByText('正在產生回覆')).toBeInTheDocument()
    expect(container.querySelector('[data-streaming="true"]')).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelector('.assistant-typing-caret')).toHaveTextContent('▍')
  })

  it('does not render the typing caret for completed messages', () => {
    const { container } = render(<MessageBubble message={assistantMessage} />)

    expect(container.querySelector('[data-streaming="true"]')).toBeNull()
    expect(container.querySelector('.assistant-typing-caret')).toBeNull()
  })
})
