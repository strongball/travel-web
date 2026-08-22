import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SwipeContainer } from './SwipeContainer'

describe('SwipeContainer', () => {
  it('renders children correctly', () => {
    render(
      <SwipeContainer>
        <div>Content Inside SwipeContainer</div>
      </SwipeContainer>,
    )
    expect(screen.getByText('Content Inside SwipeContainer')).toBeInTheDocument()
  })

  it('triggers onSwipeLeft when swiping left inside container', () => {
    const onSwipeLeft = vi.fn()
    const { container } = render(
      <SwipeContainer onSwipeLeft={onSwipeLeft}>
        <div>Swipeable area</div>
      </SwipeContainer>,
    )

    const swipeBox = container.firstChild as HTMLElement
    fireEvent.touchStart(swipeBox, { touches: [{ clientX: 200, clientY: 100 }] })
    fireEvent.touchMove(swipeBox, { touches: [{ clientX: 80, clientY: 102 }] })
    fireEvent.touchEnd(swipeBox)

    expect(onSwipeLeft).toHaveBeenCalledTimes(1)
  })

  it('triggers onSwipeRight when swiping right inside container', () => {
    const onSwipeRight = vi.fn()
    const { container } = render(
      <SwipeContainer onSwipeRight={onSwipeRight}>
        <div>Swipeable area</div>
      </SwipeContainer>,
    )

    const swipeBox = container.firstChild as HTMLElement
    fireEvent.touchStart(swipeBox, { touches: [{ clientX: 80, clientY: 100 }] })
    fireEvent.touchMove(swipeBox, { touches: [{ clientX: 200, clientY: 102 }] })
    fireEvent.touchEnd(swipeBox)

    expect(onSwipeRight).toHaveBeenCalledTimes(1)
  })
})
