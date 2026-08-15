import { useEffect, useState } from 'react'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from '@mui/material'
import type { TodoItem } from '../../../types/database'

interface TodoItemEditorDialogProps {
  todo: TodoItem | null
  categories: string[]
  saving?: boolean
  onClose: () => void
  onSave: (todo: TodoItem) => void | Promise<void>
  onOpenCategoryManager?: () => void
}

export function TodoItemEditorDialog({
  todo,
  categories,
  saving = false,
  onClose,
  onSave,
  onOpenCategoryManager,
}: TodoItemEditorDialogProps) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')

  useEffect(() => {
    if (todo) {
      setTitle(todo.title)
      setCategory(todo.category || categories[0] || '其他')
    }
  }, [todo, categories])

  if (!todo) return null

  const handleSave = () => {
    if (!title.trim()) return
    void onSave({
      ...todo,
      title: title.trim(),
      category: category || '其他',
    })
  }

  return (
    <Dialog open={Boolean(todo)} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 900, fontSize: '1.15rem', pb: 1 }}>
        編輯待辦事項
      </DialogTitle>
      <DialogContent sx={{ pt: 1, pb: 2 }}>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <TextField
            autoFocus
            label="待辦事項名稱"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSave()
              }
            }}
          />
          <FormControl fullWidth>
            <InputLabel id="edit-todo-category-label">所屬分類</InputLabel>
            <Select
              labelId="edit-todo-category-label"
              label="所屬分類"
              value={category}
              onChange={(e) => {
                if (e.target.value === '__add_category__') {
                  onOpenCategoryManager?.()
                } else {
                  setCategory(e.target.value)
                }
              }}
            >
              {categories.map((item) => (
                <MenuItem key={item} value={item}>
                  {item}
                </MenuItem>
              ))}
              {onOpenCategoryManager ? (
                <MenuItem
                  value="__add_category__"
                  sx={{
                    color: 'primary.main',
                    fontWeight: 700,
                    borderTop: '1px dashed rgba(13, 118, 110, 0.2)',
                  }}
                >
                  <AddRoundedIcon fontSize="small" sx={{ mr: 1 }} />
                  管理或新增自訂分類…
                </MenuItem>
              ) : null}
            </Select>
          </FormControl>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          取消
        </Button>
        <Button
          variant="contained"
          disabled={saving || !title.trim()}
          onClick={handleSave}
          startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined}
        >
          {saving ? '儲存中…' : '儲存'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
