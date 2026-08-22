import { useState, useRef, type TouchEvent } from 'react'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded'
import { Box, Checkbox, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import type { TodoItem } from '../../../../types/database'
import { triggerHaptic } from '../../../../lib/haptics'

interface TodoItemRowProps {
  todo: TodoItem
  onToggle: (todo: TodoItem) => void
  onDelete: (todo: TodoItem) => void
  onEdit?: (todo: TodoItem) => void
}

export function TodoItemRow({
  todo,
  onToggle,
  onDelete,
  onEdit,
}: TodoItemRowProps) {
  const [offsetX, setOffsetX] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

  const handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    setIsSwiping(false)
  }

  const handleTouchMove = (e: TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return
    const currentX = e.touches[0].clientX
    const currentY = e.touches[0].clientY
    const deltaX = currentX - touchStartX.current
    const deltaY = currentY - touchStartY.current

    // 如果垂直滑動過大，不攔截水平手勢，避免阻礙上下頁面滾動
    if (!isSwiping && Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
      return
    }

    if (Math.abs(deltaX) > 10) {
      setIsSwiping(true)
      // 限制最大滑動幅度 (阻尼效果)
      const clampedOffset = deltaX > 0 ? Math.min(deltaX * 0.75, 110) : Math.max(deltaX * 0.75, -110)
      setOffsetX(clampedOffset)
    }
  }

  const handleTouchEnd = () => {
    if (touchStartX.current === null) return
    const threshold = 65

    if (offsetX > threshold) {
      // 右滑超過門檻 -> 切換完成狀態
      triggerHaptic('success')
      onToggle(todo)
    } else if (offsetX < -threshold) {
      // 左滑超過門檻 -> 刪除
      triggerHaptic('warning')
      onDelete(todo)
    }

    // 重置滑動狀態
    touchStartX.current = null
    touchStartY.current = null
    setOffsetX(0)
    setIsSwiping(false)
  }

  const handleToggleClick = () => {
    triggerHaptic(todo.isCompleted ? 'light' : 'success')
    onToggle(todo)
  }

  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        touchAction: 'pan-y',
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* 右滑背景：完成/取消完成提示 */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          bgcolor: todo.isCompleted ? 'warning.main' : 'success.main',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          px: 2.5,
          opacity: offsetX > 20 ? Math.min(offsetX / 60, 1) : 0,
          transition: isSwiping ? 'none' : 'opacity 200ms ease',
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <CheckRoundedIcon fontSize="small" />
          <Typography variant="caption" sx={{ fontWeight: 800 }}>
            {todo.isCompleted ? '設為未完成' : '標記完成'}
          </Typography>
        </Stack>
      </Box>

      {/* 左滑背景：刪除提示 */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          bgcolor: 'error.main',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          px: 2.5,
          opacity: offsetX < -20 ? Math.min(Math.abs(offsetX) / 60, 1) : 0,
          transition: isSwiping ? 'none' : 'opacity 200ms ease',
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="caption" sx={{ fontWeight: 800 }}>
            刪除
          </Typography>
          <DeleteOutlineRoundedIcon fontSize="small" />
        </Stack>
      </Box>

      {/* 主列內容 */}
      <Stack
        direction="row"
        spacing={1}
        sx={{
          position: 'relative',
          alignItems: 'center',
          px: 1.5,
          py: 0.75,
          bgcolor: 'background.paper',
          transform: `translateX(${offsetX}px)`,
          transition: isSwiping ? 'none' : 'transform 200ms cubic-bezier(0.25, 1, 0.5, 1)',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <Checkbox
          checked={todo.isCompleted}
          onChange={handleToggleClick}
          icon={<TaskAltRoundedIcon color="disabled" />}
          checkedIcon={<CheckRoundedIcon color="primary" />}
          slotProps={{ input: { 'aria-label': `完成 ${todo.title}` } }}
        />
        <Typography
          sx={{
            flex: 1,
            textDecoration: todo.isCompleted ? 'line-through' : 'none',
            color: todo.isCompleted ? 'text.secondary' : 'text.primary',
            userSelect: 'none',
          }}
        >
          {todo.title}
        </Typography>
        {onEdit ? (
          <Tooltip title="編輯事項">
            <IconButton
              size="small"
              aria-label={`編輯 ${todo.title}`}
              onClick={() => onEdit(todo)}
            >
              <EditOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : null}
        <Tooltip title="刪除事項">
          <IconButton
            size="small"
            color="error"
            aria-label={`刪除 ${todo.title}`}
            onClick={() => {
              triggerHaptic('warning')
              onDelete(todo)
            }}
          >
            <DeleteOutlineRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </Box>
  )
}

