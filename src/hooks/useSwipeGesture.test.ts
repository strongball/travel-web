import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSwipeGesture } from './useSwipeGesture'
import type { TouchEvent } from 'react'

function createTouchEvent(clientX: number, clientY: number): TouchEvent {
  return {
    touches: [{ clientX, clientY }],
  } as unknown as TouchEvent
}

describe('useSwipeGesture', () => {
  it('triggers onSwipeLeft when swiping left beyond minSwipeDistance', () => {
    const onSwipeLeft = vi.fn()
    const onSwipeRight = vi.fn()
    const { result } = renderHook(() =>
      useSwipeGesture({
        minSwipeDistance: 40,
        onSwipeLeft,
        onSwipeRight,
      }),
    )

    act(() => {
      result.current.touchHandlers.onTouchStart(createTouchEvent(150, 100))
      result.current.touchHandlers.onTouchMove(createTouchEvent(80, 105))
      result.current.touchHandlers.onTouchEnd()
    })

    expect(onSwipeLeft).toHaveBeenCalledTimes(1)
    expect(onSwipeRight).not.toHaveBeenCalled()
  })

  it('triggers onSwipeRight when swiping right beyond minSwipeDistance', () => {
    const onSwipeLeft = vi.fn()
    const onSwipeRight = vi.fn()
    const { result } = renderHook(() =>
      useSwipeGesture({
        minSwipeDistance: 40,
        onSwipeLeft,
        onSwipeRight,
      }),
    )

    act(() => {
      result.current.touchHandlers.onTouchStart(createTouchEvent(50, 100))
      result.current.touchHandlers.onTouchMove(createTouchEvent(120, 102))
      result.current.touchHandlers.onTouchEnd()
    })

    expect(onSwipeRight).toHaveBeenCalledTimes(1)
    expect(onSwipeLeft).not.toHaveBeenCalled()
  })

  it('does not trigger swipe when swipe distance is less than threshold', () => {
    const onSwipeLeft = vi.fn()
    const onSwipeRight = vi.fn()
    const { result } = renderHook(() =>
      useSwipeGesture({
        minSwipeDistance: 50,
        onSwipeLeft,
        onSwipeRight,
      }),
    )

    act(() => {
      result.current.touchHandlers.onTouchStart(createTouchEvent(100, 100))
      result.current.touchHandlers.onTouchMove(createTouchEvent(80, 100)) // deltaX = -20
      result.current.touchHandlers.onTouchEnd()
    })

    expect(onSwipeLeft).not.toHaveBeenCalled()
    expect(onSwipeRight).not.toHaveBeenCalled()
  })

  it('does not trigger horizontal swipe when vertical movement is too large (scrolling)', () => {
    const onSwipeLeft = vi.fn()
    const onSwipeRight = vi.fn()
    const { result } = renderHook(() =>
      useSwipeGesture({
        minSwipeDistance: 40,
        maxPerpendicularDistance: 50,
        onSwipeLeft,
        onSwipeRight,
      }),
    )

    act(() => {
      result.current.touchHandlers.onTouchStart(createTouchEvent(100, 100))
      result.current.touchHandlers.onTouchMove(createTouchEvent(50, 200)) // deltaX = -50, deltaY = 100
      result.current.touchHandlers.onTouchEnd()
    })

    expect(onSwipeLeft).not.toHaveBeenCalled()
    expect(onSwipeRight).not.toHaveBeenCalled()
  })

  it('does nothing when disabled is true', () => {
    const onSwipeLeft = vi.fn()
    const onSwipeRight = vi.fn()
    const { result } = renderHook(() =>
      useSwipeGesture({
        disabled: true,
        onSwipeLeft,
        onSwipeRight,
      }),
    )

    act(() => {
      result.current.touchHandlers.onTouchStart(createTouchEvent(150, 100))
      result.current.touchHandlers.onTouchMove(createTouchEvent(50, 100))
      result.current.touchHandlers.onTouchEnd()
    })

    expect(onSwipeLeft).not.toHaveBeenCalled()
    expect(onSwipeRight).not.toHaveBeenCalled()
  })
})
