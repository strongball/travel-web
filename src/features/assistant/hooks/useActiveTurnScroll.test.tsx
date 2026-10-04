import { render, fireEvent, screen, act } from '@testing-library/react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { useActiveTurnScroll } from './useActiveTurnScroll'

type Message = { id: string; role: 'user' | 'assistant' }
let height = 1200
function TestComponent({ messages, activityKey, layoutKey, conversationKey }: { messages: Message[]; activityKey?: string; layoutKey?: string; conversationKey?: string }) {
  const scroll = useActiveTurnScroll(messages, true, { activityKey, layoutKey, conversationKey })
  return <div data-testid="area" onScroll={scroll.onScroll} ref={(element) => {
    if (element) {
      Object.defineProperty(element, 'clientHeight', { value: 600, configurable: true })
      Object.defineProperty(element, 'scrollHeight', { get: () => height, configurable: true })
    }
    scroll.messagesAreaRef.current = element
  }}>
    <div ref={scroll.contentRef}>{messages.map((message) => <div key={message.id}>{message.id}</div>)}</div>
    {scroll.hasNewReply ? <button onClick={scroll.scrollToLatest}>有新回覆</button> : null}
  </div>
}
const history: Message[] = [{ id: 'user', role: 'user' }, { id: 'assistant', role: 'assistant' }]
afterEach(() => { height = 1200; vi.unstubAllGlobals() })

describe('conversation scrolling', () => {
  it('scrolls only its own container to the real bottom without a viewport spacer', () => {
    render(<TestComponent messages={history} />)
    expect(screen.getByTestId('area').scrollTop).toBe(600)
  })
  it('follows a newly submitted prompt and growing content', () => {
    const { rerender } = render(<TestComponent messages={history} />)
    height = 1500
    rerender(<TestComponent messages={[...history, { id: 'next', role: 'user' }]} />)
    expect(screen.getByTestId('area').scrollTop).toBe(900)
    height = 1800
    rerender(<TestComponent messages={[...history, { id: 'next', role: 'user' }]} activityKey="new text" />)
    expect(screen.getByTestId('area').scrollTop).toBe(1200)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
  it('preserves reading position and shows the jump only for actual reply content', () => {
    const { rerender } = render(<TestComponent messages={history} />)
    const area = screen.getByTestId('area')
    area.scrollTop = 100
    fireEvent.scroll(area)
    rerender(<TestComponent messages={history} layoutKey="查詢工具" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    rerender(<TestComponent messages={history} activityKey="stream text" layoutKey="驗算工具" />)
    expect(area.scrollTop).toBe(100)
    fireEvent.click(screen.getByRole('button', { name: '有新回覆' }))
    expect(area.scrollTop).toBe(600)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
  it('does not notify for cleared streaming text or expanded history', () => {
    const { rerender } = render(<TestComponent messages={history} activityKey="text" />)
    const area = screen.getByTestId('area')
    area.scrollTop = 100
    fireEvent.scroll(area)
    rerender(<TestComponent messages={[{ id: 'old', role: 'assistant' }, ...history]} />)
    expect(area.scrollTop).toBe(100)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
  it('follows resizing only while the user stays at the bottom', () => {
    let resized: () => void = () => {}
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resized = callback } observe() {} disconnect = disconnect })
    const { unmount } = render(<TestComponent messages={history} />)
    const area = screen.getByTestId('area')
    height = 1500
    act(() => resized())
    expect(area.scrollTop).toBe(900)
    area.scrollTop = 100
    fireEvent.scroll(area)
    height = 1800
    act(() => resized())
    expect(area.scrollTop).toBe(100)
    unmount()
    expect(disconnect).toHaveBeenCalled()
  })
  it('clears unread status when returning to the bottom or switching conversations', () => {
    const { rerender } = render(<TestComponent messages={history} conversationKey="one" />)
    const area = screen.getByTestId('area')
    area.scrollTop = 100
    fireEvent.scroll(area)
    rerender(<TestComponent messages={history} conversationKey="one" activityKey="new text" />)
    expect(screen.getByRole('button')).toBeInTheDocument()
    area.scrollTop = 600
    fireEvent.scroll(area)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    rerender(<TestComponent messages={history} conversationKey="two" />)
    expect(area.scrollTop).toBe(600)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
