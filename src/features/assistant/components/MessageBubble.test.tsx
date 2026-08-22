import { fireEvent, render, screen } from '@testing-library/react'
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

  it('renders collapsible tool indicator when message has grounding metadata and expands on click', () => {
    const msgWithGrounding: AssistantMessage = {
      ...assistantMessage,
      grounding: {
        webSearchQueries: ['2026 東京 淺草寺 營業時間'],
        sources: [
          { title: '淺草寺官方網站', uri: 'https://senso-ji.jp' },
          { title: '東京觀光官方指南', uri: 'https://gotokyo.org' },
        ],
      },
    }

    render(<MessageBubble message={msgWithGrounding} />)

    // Micro capsule button
    const badgeButton = screen.getByRole('button', { name: '查看工具調用細節' })
    expect(badgeButton).toBeInTheDocument()
    expect(badgeButton).toHaveTextContent('🔍 參考了 2 個來源')

    // Click to expand
    fireEvent.click(badgeButton)

    expect(screen.getByText('2026 東京 淺草寺 營業時間')).toBeInTheDocument()
    expect(screen.getByText('淺草寺官方網站')).toBeInTheDocument()
    expect(screen.getByText('東京觀光官方指南')).toBeInTheDocument()
  })

  it('renders code execution details when message has python executions', () => {
    const msgWithCode: AssistantMessage = {
      ...assistantMessage,
      codeExecutions: [
        {
          language: 'PYTHON',
          code: 'total = 1000 * 1.05 ** 10\nprint(round(total))',
          outcome: 'OUTCOME_OK',
          output: '1629\n',
        },
      ],
    }

    render(<MessageBubble message={msgWithCode} />)

    const badgeButton = screen.getByRole('button', { name: '查看工具調用細節' })
    expect(badgeButton).toBeInTheDocument()
    expect(badgeButton).toHaveTextContent('🐍 執行了程式碼計算')

    fireEvent.click(badgeButton)

    expect(screen.getByText('Python 沙盒運算')).toBeInTheDocument()
    expect(screen.getByText(/total = 1000/)).toBeInTheDocument()
    expect(screen.getByText('1629')).toBeInTheDocument()
  })
})

