import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded'
import { Checkbox, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import type { TodoItem } from '../../../../types/database'

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
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{
        alignItems: 'center',
        px: 1.5,
        py: 0.75,
        '&:hover': { bgcolor: 'action.hover' },
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
          onClick={() => onDelete(todo)}
        >
          <DeleteOutlineRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  )
}
