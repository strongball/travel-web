import { type FormEvent } from 'react'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import {
  Button,
  Card,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from '@mui/material'

interface TodoAddFormProps {
  title: string
  category: string
  categories: string[]
  saving: boolean
  onTitleChange: (value: string) => void
  onCategoryChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onOpenQuickAddCategory: () => void
}

export function TodoAddForm({
  title,
  category,
  categories,
  saving,
  onTitleChange,
  onCategoryChange,
  onSubmit,
  onOpenQuickAddCategory,
}: TodoAddFormProps) {
  return (
    <Card
      component="form"
      onSubmit={onSubmit}
      sx={{ p: { xs: 2, sm: 2.5 } }}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField
          id="todo-input-field"
          label="新增待辦事項"
          placeholder="例如：準備護照、購買網卡…"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          sx={{ flex: 1 }}
        />
        <FormControl sx={{ minWidth: { sm: 160 } }}>
          <InputLabel id="todo-category-label">分類</InputLabel>
          <Select
            labelId="todo-category-label"
            label="分類"
            value={category}
            onChange={(event) => {
              if (event.target.value === '__add_new__') {
                onOpenQuickAddCategory()
              } else {
                onCategoryChange(event.target.value)
              }
            }}
          >
            {categories.map((item) => (
              <MenuItem key={item} value={item}>
                {item}
              </MenuItem>
            ))}
            <Divider sx={{ my: 0.5 }} />
            <MenuItem
              value="__add_new__"
              sx={{
                color: 'primary.main',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
              }}
            >
              <AddRoundedIcon fontSize="small" />
              + 新增自訂分類…
            </MenuItem>
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
        >
          {saving ? '新增中…' : '新增'}
        </Button>
      </Stack>
    </Card>
  )
}
