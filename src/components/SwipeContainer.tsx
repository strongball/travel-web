import type { ReactNode } from 'react'
import { Box, type BoxProps } from '@mui/material'
import { useSwipeGesture, type SwipeGestureOptions } from '../hooks/useSwipeGesture'

export interface SwipeContainerProps
  extends SwipeGestureOptions,
    Omit<BoxProps, 'onTouchStart' | 'onTouchMove' | 'onTouchEnd'> {
  children: ReactNode
}

/**
 * 聲明式的觸控滑動容器元件 (SwipeContainer)
 * 自動封裝手勢事件綁定與 touch-action、user-select 樣式。
 */
export function SwipeContainer({
  onSwipeLeft,
  onSwipeRight,
  minSwipeDistance,
  maxPerpendicularDistance,
  disabled,
  children,
  sx,
  ...boxProps
}: SwipeContainerProps) {
  const { touchHandlers } = useSwipeGesture({
    onSwipeLeft,
    onSwipeRight,
    minSwipeDistance,
    maxPerpendicularDistance,
    disabled,
  })

  return (
    <Box
      {...touchHandlers}
      sx={{
        touchAction: 'pan-y', // 允許垂直滑動，防止手勢衝突
        userSelect: 'none',
        ...sx,
      }}
      {...boxProps}
    >
      {children}
    </Box>
  )
}
