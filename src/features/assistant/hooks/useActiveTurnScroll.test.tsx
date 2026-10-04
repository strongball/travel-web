import { render, act, fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { useActiveTurnScroll } from './useActiveTurnScroll'

type MockMessage = { id: string; role: 'user' | 'assistant'; content: string }

const scrollToSpy = vi.fn()

function TestComponent({ messages, isBusy, activityKey }: { messages: MockMessage[]; isBusy: boolean; activityKey?: string }) {
  const scroll = useActiveTurnScroll(messages, isBusy, { activityKey })
  return (
    <div onScroll={scroll.onScroll}
      ref={(el) => {
        if (el) {
          Object.defineProperty(el, 'clientHeight', { value: 600, configurable: true })
          Object.defineProperty(el, 'scrollHeight', { value: 1200, configurable: true })
          el.scrollTop = 0
          el.scrollTo = scrollToSpy
          el.getBoundingClientRect = vi.fn().mockReturnValue({ top: 100, bottom: 700, height: 600 })
        }
        scroll.messagesAreaRef.current = el
      }}
    >
      {messages.map((m, idx) => (
        <div
          key={m.id}
          ref={(el) => {
            if (el && idx === scroll.lastUserMessageIndex) {
              el.getBoundingClientRect = vi.fn().mockReturnValue({ top: 500, bottom: 550, height: 50 })
              scroll.lastUserMessageRef.current = el
            }
          }}
        >
          {m.content}
        </div>
      ))}
      <div ref={scroll.activeTurnSpacerRef} />
      <div ref={scroll.messagesEndRef} />
      {scroll.hasNewReply ? <button onClick={scroll.scrollToLatest}>有新回覆</button> : null}
    </div>
  )
}

describe('useActiveTurnScroll', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 0
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('scrolls to bottom on initial mount with history messages when not busy', () => {
    const messages: MockMessage[] = [
      { id: '1', role: 'user', content: 'hello' },
      { id: '2', role: 'assistant', content: 'hi' },
    ]

    const { container } = render(<TestComponent messages={messages} isBusy={false} />)
    const scrollContainer = container.firstElementChild as HTMLDivElement

    expect(scrollContainer.scrollTop).toBe(scrollContainer.scrollHeight)
  })

  it('scrolls the last user message to the top when a new user message is submitted', () => {
    const initialMessages: MockMessage[] = [
      { id: '1', role: 'user', content: 'first prompt' },
      { id: '2', role: 'assistant', content: 'first response' },
    ]

    const { rerender } = render(<TestComponent messages={initialMessages} isBusy={false} />)

    const updatedMessages: MockMessage[] = [
      ...initialMessages,
      { id: '3', role: 'user', content: 'second prompt' },
    ]

    act(() => {
      rerender(<TestComponent messages={updatedMessages} isBusy={true} />)
    })

    // targetScrollTop = scrollTop(0) + (messageTop(500) - containerTop(100)) - 16 = 384
    expect(scrollToSpy).toHaveBeenCalledWith({
      top: 384,
      behavior: 'smooth',
    })
  })

  it('handles first user message in an empty conversation and scrolls to top', () => {
    scrollToSpy.mockClear()
    const { rerender } = render(<TestComponent messages={[]} isBusy={false} />)

    const firstMessage: MockMessage[] = [{ id: 'user-msg-1', role: 'user', content: 'first ever' }]

    act(() => {
      rerender(<TestComponent messages={firstMessage} isBusy={true} />)
    })

    expect(scrollToSpy).toHaveBeenCalledWith({
      top: 384,
      behavior: 'smooth',
    })
  })
  it('leaves readers in place when a reply arrives and offers a jump to the new reply', () => {
    const initial: MockMessage[] = [{ id: 'u', role: 'user', content: '問題' }]
    const { container, rerender } = render(<TestComponent messages={initial} isBusy={true} activityKey="第一段" />)
    const area = container.firstElementChild as HTMLDivElement
    area.scrollTop = 100
    fireEvent.scroll(area)
    const latest = area.children[area.children.length - 1] as HTMLDivElement
    latest.scrollIntoView = vi.fn()
    rerender(<TestComponent messages={initial} isBusy={true} activityKey="第一段第二段" />)
    expect(screen.getByRole('button', { name: '有新回覆' })).toBeInTheDocument()
    expect(latest.scrollIntoView).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '有新回覆' }))
    expect(latest.scrollIntoView).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '有新回覆' })).not.toBeInTheDocument()
  })

  it('follows replies near the bottom and does not mistake expanded history for a new reply', () => {
    const initial: MockMessage[] = [{ id: 'u', role: 'user', content: '問題' }]
    const { container, rerender } = render(<TestComponent messages={initial} isBusy={true} />)
    const area = container.firstElementChild as HTMLDivElement
    area.scrollTop = 600
    fireEvent.scroll(area)
    const latest = area.children[area.children.length - 1] as HTMLDivElement
    latest.scrollIntoView = vi.fn()
    const complete: MockMessage[] = [...initial, { id: 'a', role: 'assistant', content: '完成' }]
    rerender(<TestComponent messages={complete} isBusy={false} />)
    expect(latest.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto' })
    expect(screen.queryByRole('button', { name: '有新回覆' })).not.toBeInTheDocument()
    area.scrollTop = 100
    fireEvent.scroll(area)
    vi.mocked(latest.scrollIntoView).mockClear()
    rerender(<TestComponent messages={[{ id: 'older', role: 'assistant', content: '較早訊息' }, ...complete]} isBusy={false} />)
    expect(latest.scrollIntoView).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '有新回覆' })).not.toBeInTheDocument()
  })

})
