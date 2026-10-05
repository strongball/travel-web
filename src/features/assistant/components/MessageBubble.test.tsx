import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
  it('groups tools, search and calculation in one panel with independent second-level disclosures', () => {
    const { container } = render(<MessageBubble message={{ ...assistantMessage,
      toolCalls: [
        { id: 'read', name: 'view_itinerary', label: '讀取行程', args: { dayNumbers: [2] } },
        { id: 'plan', name: 'propose_itinerary_edit', label: '提出提案', args: { operations: [] } },
      ],
      grounding: { sources: [{ title: '官方網站', uri: 'https://example.com/' }] },
      codeExecutions: [{ language: 'python', code: 'print(1)', output: '1' }],
    }} />)
    expect(screen.getAllByRole('button', { name: /執行步驟/ })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /執行步驟/ }))
    const details = container.querySelectorAll('details')
    expect(details).toHaveLength(4)
    expect(container.querySelectorAll('details details')).toHaveLength(0)
    fireEvent.click(details[0].querySelector('summary')!)
    expect(details[0]).toHaveAttribute('open')
    expect(details[1]).not.toHaveAttribute('open')
    fireEvent.click(details[1].querySelector('summary')!)
    expect(details[0]).toHaveAttribute('open')
    expect(details[1]).toHaveAttribute('open')
    expect(screen.getByRole('link', { name: '官方網站' })).toHaveAttribute('href', 'https://example.com/')
  })
  it('places expandable steps above the reply and elapsed time below it', () => {
    render(<MessageBubble message={{ ...assistantMessage, content: '生成失敗', durationMs: 12000,
      executionSteps: [{ label: '讀取行程', startedAt: 1000, finishedAt: 2000,
        toolCalls: [{ id: 'read', name: 'view_itinerary', label: '讀取行程', args: { dayNumbers: [3] } }],
        results: [{ id: 'read', status: 'error', content: '找不到日期' }],
      }],
    }} />)
    const toggle = screen.getByRole('button', { name: /執行步驟/ })
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const details = screen.getByText(/讀取行程 · 參數與結果/).closest('details')!
    fireEvent.click(screen.getByText(/讀取行程 · 參數與結果/))
    expect(details.textContent).toContain('dayNumbers')
    expect(details.textContent).toContain('找不到日期')
    const reply = screen.getByText('生成失敗')
    expect(toggle.compareDocumentPosition(reply) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(reply.compareDocumentPosition(screen.getByText('執行時間 12 秒')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('places manual retry inside the bubble and disables it offline or while streaming', () => {
    const onRetry = vi.fn()
    const { rerender } = render(<MessageBubble message={{ ...assistantMessage, content: '生成失敗' }} onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: '重試' }))
    expect(onRetry).toHaveBeenCalledOnce()
    rerender(<MessageBubble message={assistantMessage} onRetry={onRetry} retryDisabled />)
    expect(screen.getByRole('button', { name: '重試' })).toBeDisabled()
    rerender(<MessageBubble message={assistantMessage} onRetry={onRetry} streaming />)
    expect(screen.getByRole('button', { name: '重試' })).toBeDisabled()
  })

  it('renders streamed Markdown with a separate loading indicator', () => {
    const { container } = render(<MessageBubble message={assistantMessage} streaming />)

    expect(screen.getByText('即時 Markdown')).toBeInTheDocument()
    expect(screen.getByText('正在產生回覆')).toBeInTheDocument()
    expect(container.querySelector('[data-streaming="true"]')).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelector('.assistant-typing-caret')).toBeNull()
    expect(screen.getByRole('status', { name: '助理正在生成回覆' })).toBeInTheDocument()
  })

  it('shows dots without an empty bubble while waiting for the first token', () => {
    const { container, rerender } = render(<MessageBubble message={{ ...assistantMessage, content: '' }} streaming />)
    expect(screen.getByRole('status', { name: '助理正在生成回覆' })).toBeInTheDocument()
    expect(container.querySelector('.MuiPaper-root')).toBeNull()
    rerender(<MessageBubble message={assistantMessage} />)
    expect(screen.queryByRole('status')).toBeNull()
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

    // One group contains an independently expandable search row
    const badgeButton = screen.getByRole('button', { name: /執行步驟/ })
    expect(badgeButton).toBeInTheDocument()
    expect(badgeButton).toHaveTextContent('執行步驟 · 1 項')

    // Click to expand
    fireEvent.click(badgeButton)

    fireEvent.click(screen.getByText('網路搜尋 · 2 個來源'))
    expect(screen.getByText('2026 東京 淺草寺 營業時間')).toBeVisible()
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

    const badgeButton = screen.getByRole('button', { name: /執行步驟/ })
    expect(badgeButton).toBeInTheDocument()
    expect(badgeButton).toHaveTextContent('執行步驟 · 1 項')

    fireEvent.click(badgeButton)

    fireEvent.click(screen.getByText('程式碼計算 1 · PYTHON'))
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

    const badgeButton = screen.getByRole('button', { name: /執行步驟/ })
    expect(badgeButton).toBeInTheDocument()
    expect(badgeButton).toHaveTextContent('執行步驟 · 1 項')

    fireEvent.click(badgeButton)

    fireEvent.click(screen.getByText(/1\. 檢視第 1 天行程/))
    expect(screen.getByText('view_itinerary · 參數')).toBeVisible()
    expect(screen.getByText(/"dayNumber": 1/)).toBeVisible()
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

    const badgeButton = screen.getByRole('button', { name: /執行步驟/ })
    expect(badgeButton).toHaveTextContent('執行步驟 · 2 項')

    fireEvent.click(badgeButton)

    expect(screen.getByText(/1\. 檢視第 1 天行程/)).toBeVisible()
    fireEvent.click(screen.getByText(/2\. 搜尋「晴空塔 門票」/))
    expect(screen.getByText(/"query": "晴空塔 門票"/)).toBeVisible()
  })
})
