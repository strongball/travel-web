import type { FormEvent } from 'react'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded'
import { Button, Checkbox, CircularProgress, Divider, FormControl, IconButton, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography } from '@mui/material'
import type { TodoItem } from '../../../types/database'

export function TodoSection({
  todos,
  categories,
  title,
  category,
  onTitleChange,
  onCategoryChange,
  onSubmit,
  saving,
  onToggle,
  onDelete,
}: {
  todos: TodoItem[]
  categories: string[]
  title: string
  category: string
  onTitleChange: (value: string) => void
  onCategoryChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  saving: boolean
  onToggle: (todo: TodoItem) => void
  onDelete: (todo: TodoItem) => void
}) {
  const grouped = todos.reduce<Record<string, TodoItem[]>>((result, todo) => {
    result[todo.category] = [...(result[todo.category] ?? []), todo]
    return result
  }, {})

  return (
    <Stack spacing={2}>
      <Paper
        component="form"
        onSubmit={onSubmit}
        elevation={0}
        sx={{
          border: '1px solid rgba(13, 118, 110, 0.12)',
          borderRadius: 3.5,
          p: { xs: 2, sm: 2.5 },
          bgcolor: '#ffffff',
          boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
        }}
      >
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField
            label="新增待辦事項"
            placeholder="例如：準備護照、購買網卡…"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            sx={{ flex: 1 }}
          />
          <FormControl sx={{ minWidth: { sm: 140 } }}>
            <InputLabel id="todo-category-label">分類</InputLabel>
            <Select
              labelId="todo-category-label"
              label="分類"
              value={category}
              onChange={(event) => onCategoryChange(event.target.value)}
            >
              {categories.map((item) => (
                <MenuItem key={item} value={item}>
                  {item}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            type="submit"
            variant="contained"
            disabled={saving || !title.trim()}
            startIcon={
              saving ? (
                <CircularProgress size={18} color="inherit" />
              ) : (
                <AddRoundedIcon />
              )
            }
            sx={{
              borderRadius: 2.5,
              px: 3,
              background: 'linear-gradient(135deg, #0d766e 0%, #14b8a6 100%)',
            }}
          >
            {saving ? '新增中…' : '新增'}
          </Button>
        </Stack>
      </Paper>

      {Object.entries(grouped).map(([group, items]) => (
        <Paper
          key={group}
          elevation={0}
          sx={{
            border: '1px solid rgba(13, 118, 110, 0.12)',
            borderRadius: 3.5,
            overflow: 'hidden',
            bgcolor: '#ffffff',
            boxShadow: '0 4px 16px rgba(15, 23, 42, 0.03)',
          }}
        >
          <Stack
            direction="row"
            spacing={1}
            sx={{ px: 2, pt: 1.75, pb: 1, alignItems: 'center' }}
          >
            <Typography sx={{ fontWeight: 900, fontSize: '0.95rem' }}>{group}</Typography>
            <Typography variant="caption" color="text.secondary">
              ({items.filter((i) => i.isCompleted).length}/{items.length})
            </Typography>
          </Stack>
          <Stack divider={<Divider sx={{ borderColor: 'rgba(13, 118, 110, 0.06)' }} />}>
            {items.map((todo) => (
              <Stack
                key={todo.id}
                direction="row"
                spacing={1}
                sx={{
                  alignItems: 'center',
                  px: 1.5,
                  py: 0.75,
                  transition: 'background-color 150ms ease',
                  '&:hover': { bgcolor: 'rgba(13, 118, 110, 0.03)' },
                }}
              >
                <Checkbox
                  checked={todo.isCompleted}
                  onChange={() => onToggle(todo)}
                  icon={<TaskAltRoundedIcon color="disabled" />}
                  checkedIcon={<CheckRoundedIcon color="primary" />}
                  slotProps={{ input: { 'aria-label': `完成 ${todo.title}` } }}
                />
                <Typography
                  sx={{
                    flex: 1,
                    textDecoration: todo.isCompleted ? 'line-through' : 'none',
                    color: todo.isCompleted ? 'text.secondary' : 'text.primary',
                    fontSize: '0.92rem',
                  }}
                >
                  {todo.title}
                </Typography>
                <IconButton
                  size="small"
                  color="error"
                  aria-label={`刪除 ${todo.title}`}
                  onClick={() => onDelete(todo)}
                  sx={{ width: 34, height: 34 }}
                >
                  <DeleteOutlineRoundedIcon fontSize="small" />
                </IconButton>
              </Stack>
            ))}
          </Stack>
        </Paper>
      ))}

      {todos.length === 0 ? (
        <Paper
          elevation={0}
          sx={{
            border: '1px solid rgba(13, 118, 110, 0.12)',
            borderRadius: 3.5,
            p: 4,
            textAlign: 'center',
            bgcolor: '#ffffff',
          }}
        >
          <TaskAltRoundedIcon color="disabled" sx={{ fontSize: 44, opacity: 0.7 }} />
          <Typography color="text.secondary" sx={{ mt: 1, fontWeight: 650 }}>
            還沒有待辦事項，輸入上方表單建立清單。
          </Typography>
        </Paper>
      ) : null}
    </Stack>
  )
}


