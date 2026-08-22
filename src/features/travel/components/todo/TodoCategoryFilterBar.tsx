import TuneRoundedIcon from '@mui/icons-material/TuneRounded'
import { Button, Card, Chip, Stack } from '@mui/material'
import type { TodoItem } from '../../../../types/database'

interface TodoCategoryFilterBarProps {
  categories: string[]
  todos: TodoItem[]
  grouped: Record<string, TodoItem[]>
  selectedFilterCategory: string
  onSelectCategory: (category: string) => void
  onOpenManager: () => void
}

export function TodoCategoryFilterBar({
  categories,
  todos,
  grouped,
  selectedFilterCategory,
  onSelectCategory,
  onOpenManager,
}: TodoCategoryFilterBarProps) {
  const totalCompleted = todos.filter((t) => t.isCompleted).length
  const categoryOrder = Array.from(new Set([...categories, ...todos.map((t) => t.category)]))

  return (
    <Card sx={{ p: { xs: 1.5, sm: 2 } }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: 'center',
            overflowX: 'auto',
            maxWidth: '100%',
            pb: { xs: 0.5, sm: 0 },
          }}
        >
          <Chip
            label={`全部 (${totalCompleted}/${todos.length})`}
            onClick={() => onSelectCategory('all')}
            variant={selectedFilterCategory === 'all' ? 'filled' : 'outlined'}
            color={selectedFilterCategory === 'all' ? 'primary' : 'default'}
            clickable
          />
          {categoryOrder.map((cat) => {
            const catItems = grouped[cat] ?? []
            const catCompleted = catItems.filter((i) => i.isCompleted).length
            const isSelected = selectedFilterCategory === cat

            return (
              <Chip
                key={cat}
                label={`${cat} (${catCompleted}/${catItems.length})`}
                onClick={() => onSelectCategory(isSelected ? 'all' : cat)}
                variant={isSelected ? 'filled' : 'outlined'}
                color={isSelected ? 'primary' : 'default'}
                clickable
              />
            )
          })}
        </Stack>

        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', ml: 'auto' }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<TuneRoundedIcon />}
            onClick={onOpenManager}
          >
            管理分類
          </Button>
        </Stack>
      </Stack>
    </Card>
  )
}
