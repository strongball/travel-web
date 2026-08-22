import { useRef, useCallback, type TouchEvent } from 'react'

export interface SwipeGestureOptions {
  /** 觸發滑動的最小水平位移距離 (像素)，預設 45 */
  minSwipeDistance?: number
  /** 垂直方向允許的最大位移 (防止在上下正常滾動時誤觸左右滑動)，預設 70 */
  maxPerpendicularDistance?: number
  /** 向左滑動回呼 (例如：切換到下一天) */
  onSwipeLeft?: () => void
  /** 向右滑動回呼 (例如：切換到上一天) */
  onSwipeRight?: () => void
  /** 是否禁用手勢 */
  disabled?: boolean
}

export function useSwipeGesture({
  minSwipeDistance = 45,
  maxPerpendicularDistance = 70,
  onSwipeLeft,
  onSwipeRight,
  disabled = false,
}: SwipeGestureOptions) {
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const touchEndX = useRef<number | null>(null)
  const touchEndY = useRef<number | null>(null)

  const onTouchStart = useCallback(
    (e: TouchEvent) => {
      if (disabled || e.touches.length !== 1) return
      touchStartX.current = e.touches[0].clientX
      touchStartY.current = e.touches[0].clientY
      touchEndX.current = e.touches[0].clientX
      touchEndY.current = e.touches[0].clientY
    },
    [disabled],
  )

  const onTouchMove = useCallback(
    (e: TouchEvent) => {
      if (disabled || touchStartX.current === null) return
      touchEndX.current = e.touches[0].clientX
      touchEndY.current = e.touches[0].clientY
    },
    [disabled],
  )

  const onTouchEnd = useCallback(() => {
    if (
      disabled ||
      touchStartX.current === null ||
      touchStartY.current === null ||
      touchEndX.current === null ||
      touchEndY.current === null
    ) {
      touchStartX.current = null
      touchStartY.current = null
      touchEndX.current = null
      touchEndY.current = null
      return
    }

    const deltaX = touchEndX.current - touchStartX.current
    const deltaY = touchEndY.current - touchStartY.current

    // 重置座標
    touchStartX.current = null
    touchStartY.current = null
    touchEndX.current = null
    touchEndY.current = null

    // 檢查垂直位移是否過大 (防止上下滾動時誤觸發)
    if (Math.abs(deltaY) > maxPerpendicularDistance) {
      return
    }

    // 確保水平位移大於垂直位移，並且超過門檻
    if (Math.abs(deltaX) >= minSwipeDistance && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
      if (deltaX < 0) {
        // 向左滑動 (Next)
        onSwipeLeft?.()
      } else {
        // 向右滑動 (Prev)
        onSwipeRight?.()
      }
    }
  }, [disabled, maxPerpendicularDistance, minSwipeDistance, onSwipeLeft, onSwipeRight])

  return {
    touchHandlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
  }
}
