import AddRoundedIcon from '@mui/icons-material/AddRounded'
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded'
import {
  Box,
  Card,
  Chip,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import type { TodoItem } from '../../../../types/database'
import { TodoItemRow } from './TodoItemRow'

interface TodoGroupCardProps {
  group: string
  items: TodoItem[]
  onToggle: (todo: TodoItem) => void
  onDelete: (todo: TodoItem) => void
  onEdit?: (todo: TodoItem) => void
  onAddTodoToGroup: (group: string) => void
  onOpenGroupMenu: (event: React.MouseEvent<HTMLElement>, group: string) => void
}

export function TodoGroupCard({
  group,
  items,
  onToggle,
  onDelete,
  onEdit,
  onAddTodoToGroup,
  onOpenGroupMenu,
}: TodoGroupCardProps) {
  const completedInGroup = items.filter((i) => i.isCompleted).length

  return (
    <Card sx={{ overflow: 'hidden' }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          px: 2,
          pt: 1.75,
          pb: 1,
          alignItems: 'center',
          justifyContent: 'space-between',
          bgcolor: 'action.hover',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography sx={{ fontWeight: 900 }}>
            {group}
          </Typography>
          <Chip
            size="small"
            label={`${completedInGroup}/${items.length}`}
            color={items.length > 0 && completedInGroup === items.length ? 'primary' : 'default'}
          />
        </Stack>

        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Tooltip title="新增事項至此分類">
            <IconButton
              size="small"
              color="primary"
              onClick={() => onAddTodoToGroup(group)}
              aria-label={`新增事項至 ${group}`}
            >
              <AddRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <IconButton
            size="small"
            onClick={(e) => onOpenGroupMenu(e, group)}
            aria-label={`分類選單 ${group}`}
          >
            <MoreVertRoundedIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Stack>

      {items.length > 0 ? (
        <Stack divider={<Divider />}>
          {items.map((todo) => (
            <TodoItemRow
              key={todo.id}
              todo={todo}
              onToggle={onToggle}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          ))}
        </Stack>
      ) : (
        <Box sx={{ py: 2.5, px: 2, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            此分類目前尚無項目。
          </Typography>
        </Box>
      )}
    </Card>
  )
}
