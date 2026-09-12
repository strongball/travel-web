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

  it('renders tool call badge and details when message has toolCalls', () => {
    const msgWithTools: AssistantMessage = {
      ...assistantMessage,
      toolCalls: [
        {
          name: 'view_itinerary',
          label: '檢視第 1 天行程',
          args: { dayNumber: 1 },
        },
      ],
    }

    render(<MessageBubble message={msgWithTools} />)

    const badgeButton = screen.getByRole('button', { name: '查看工具調用細節' })
    expect(badgeButton).toBeInTheDocument()
    expect(badgeButton).toHaveTextContent('🛠️ 呼叫了工具：檢視第 1 天行程')

    fireEvent.click(badgeButton)

    expect(screen.getByText('調用工具 (1)')).toBeInTheDocument()
    expect(screen.getByText('檢視第 1 天行程')).toBeInTheDocument()
    expect(screen.getByText('view_itinerary')).toBeInTheDocument()
    expect(screen.getByText(/dayNumber: 1/)).toBeInTheDocument()
  })

  it('renders combined label and multiple tools when multiple toolCalls exist', () => {
    const msgWithMultipleTools: AssistantMessage = {
      ...assistantMessage,
      toolCalls: [
        {
          name: 'view_itinerary',
          label: '檢視第 1 天行程',
          args: { dayNumber: 1 },
        },
        {
          name: 'search_web_information',
          label: '搜尋「晴空塔 門票」',
          args: { query: '晴空塔 門票' },
        },
      ],
    }

    render(<MessageBubble message={msgWithMultipleTools} />)

    const badgeButton = screen.getByRole('button', { name: '查看工具調用細節' })
    expect(badgeButton).toHaveTextContent('🛠️ 呼叫了 2 個工具')

    fireEvent.click(badgeButton)

    expect(screen.getByText('調用工具 (2)')).toBeInTheDocument()
    expect(screen.getByText('檢視第 1 天行程')).toBeInTheDocument()
    expect(screen.getByText('搜尋「晴空塔 門票」')).toBeInTheDocument()
    expect(screen.getByText(/query: "晴空塔 門票"/)).toBeInTheDocument()
  })
})


