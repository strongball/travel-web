import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useOnlineStatus } from './useOnlineStatus'

describe('useOnlineStatus', () => {
  afterEach(() => vi.restoreAllMocks())

  it('updates when the browser connection changes', () => {
    let online = true
    vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online)
    const { result } = renderHook(() => useOnlineStatus())

    expect(result.current).toBe(true)

    act(() => {
      online = false
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current).toBe(false)

    act(() => {
      online = true
      window.dispatchEvent(new Event('online'))
    })
    expect(result.current).toBe(true)
  })
})
