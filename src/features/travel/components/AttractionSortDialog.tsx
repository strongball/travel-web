import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import DragHandleRoundedIcon from '@mui/icons-material/DragHandleRounded'
import { Alert, Avatar, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Paper, Stack, Typography } from '@mui/material'
import type { Attraction, TripDay } from '../../../types/database'

export function AttractionSortDialog({
  open,
  day,
  onClose,
  onApply,
}: {
  open: boolean
  day: TripDay
  onClose: () => void
  onApply: (attractions: Attraction[]) => void
}) {
  const [draftAttractions, setDraftAttractions] = useState(day.attractions)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const draftRef = useRef(draftAttractions)
  const cleanupDrag = useRef<(() => void) | null>(null)
  const draggedIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!open) return
    draftRef.current = day.attractions
    setDraftAttractions(day.attractions)
    setDraggingId(null)
    cleanupDrag.current?.()
  }, [day, open])

  useEffect(() => () => cleanupDrag.current?.(), [])

  const moveDraft = (attractionId: string, overId: string, after: boolean) => {
    const current = draftRef.current
    const fromIndex = current.findIndex((item) => item.id === attractionId)
    const overIndex = current.findIndex((item) => item.id === overId)
    if (fromIndex < 0 || overIndex < 0 || fromIndex === overIndex) return
    const insertionIndex = after ? overIndex + 1 : overIndex
    const next = [...current]
    const [moved] = next.splice(fromIndex, 1)
    const adjustedIndex = fromIndex < insertionIndex ? insertionIndex - 1 : insertionIndex
    next.splice(adjustedIndex, 0, moved)
    draftRef.current = next
    setDraftAttractions(next)
  }

  const beginPointerDrag = (event: ReactPointerEvent<HTMLElement>, attractionId: string) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    cleanupDrag.current?.()
    draggedIdRef.current = attractionId
    setDraggingId(attractionId)
    const finish = () => {
      cleanupDrag.current?.()
      cleanupDrag.current = null
      draggedIdRef.current = null
      setDraggingId(null)
    }
    const handleMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault()
      const target = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest<HTMLElement>('[data-sort-id]')
      const overId = target?.dataset.sortId
      if (!overId || overId === draggedIdRef.current) return
      const bounds = target.getBoundingClientRect()
      moveDraft(attractionId, overId, moveEvent.clientY > bounds.top + bounds.height / 2)
    }
    window.addEventListener('pointermove', handleMove, { passive: false })
    window.addEventListener('pointerup', finish, { once: true })
    window.addEventListener('pointercancel', finish, { once: true })
    cleanupDrag.current = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ pb: 1 }}>編排景點順序</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          這裡先預覽新的順序，按「套用排序」後才會更新行程。
        </Typography>
        {draftAttractions.length === 0 ? (
          <Alert severity="info">這天還沒有可以排序的景點。</Alert>
        ) : (
          <Stack spacing={1}>
            {draftAttractions.map((attraction, index) => (
              <Paper
                key={attraction.id}
                data-sort-id={attraction.id}
                variant="outlined"
                sx={{
                  p: 0.75,
                  borderRadius: 1.5,
                  opacity: draggingId === attraction.id ? 0.48 : 1,
                  transition: 'opacity 120ms ease, border-color 120ms ease',
                  borderColor: draggingId === attraction.id ? 'primary.main' : 'divider',
                }}
              >
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <IconButton
                    size="small"
                    aria-label={`拖曳排序 ${attraction.name}`}
                    onPointerDown={(event) => beginPointerDrag(event, attraction.id)}
                    sx={{ width: 42, height: 42, touchAction: 'none', cursor: draggingId === attraction.id ? 'grabbing' : 'grab', color: 'primary.main', bgcolor: 'rgba(13, 118, 110, 0.08)' }}
                  >
                    <DragHandleRoundedIcon />
                  </IconButton>
                  <Avatar sx={{ width: 28, height: 28, fontSize: '0.8rem', bgcolor: 'action.hover', color: 'text.secondary' }}>{index + 1}</Avatar>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography sx={{ fontWeight: 800, overflowWrap: 'anywhere' }}>{attraction.name || '未命名景點'}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                      {attraction.startTime?.slice(11, 16) ?? '尚未安排時間'} · {attraction.duration} 分鐘
                    </Typography>
                  </Box>
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" onClick={() => onApply(draftAttractions)}>套用排序</Button>
      </DialogActions>
    </Dialog>
  )
}


