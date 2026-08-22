import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { triggerHaptic } from './haptics'

describe('triggerHaptic', () => {
  const originalVibrate = navigator.vibrate

  beforeEach(() => {
    navigator.vibrate = vi.fn().mockReturnValue(true)
  })

  afterEach(() => {
    navigator.vibrate = originalVibrate
  })

  it('calls navigator.vibrate with short vibration for light type', () => {
    triggerHaptic('light')
    expect(navigator.vibrate).toHaveBeenCalledWith(10)
  })

  it('calls navigator.vibrate with medium vibration for medium type', () => {
    triggerHaptic('medium')
    expect(navigator.vibrate).toHaveBeenCalledWith(20)
  })

  it('calls navigator.vibrate with pattern for success type', () => {
    triggerHaptic('success')
    expect(navigator.vibrate).toHaveBeenCalledWith([10, 30, 15])
  })

  it('handles environment where navigator.vibrate is undefined safely', () => {
    // @ts-expect-error simulating missing vibrate
    navigator.vibrate = undefined
    expect(() => triggerHaptic('light')).not.toThrow()
  })
})
