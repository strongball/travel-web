import { useState, type FormEvent } from 'react'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded'
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded'
import TuneRoundedIcon from '@mui/icons-material/TuneRounded'
import {
  Box,
  Button,
  Card,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  Menu,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import type { TodoItem } from '../../../types/database'
import { TodoCategoryManagerDialog } from './TodoCategoryManagerDialog'
import { TodoItemEditorDialog } from './TodoItemEditorDialog'

export interface TodoSectionProps {
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
  onSaveTodo?: (todo: TodoItem) => void | Promise<void>
  onSaveCategories: (categories: string[]) => void | Promise<void>
  onRenameCategory: (oldName: string, newName: string) => void | Promise<void>
  onDeleteCategory: (categoryName: string) => void | Promise<void>
}

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
  onSaveTodo,
  onSaveCategories,
  onRenameCategory,
  onDeleteCategory,
}: TodoSectionProps) {
  const [selectedFilterCategory, setSelectedFilterCategory] = useState<string>('all')
  const [managerOpen, setManagerOpen] = useState(false)
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null)
  const [quickAddCatOpen, setQuickAddCatOpen] = useState(false)
  const [quickCatName, setQuickCatName] = useState('')
  const [quickCatError, setQuickCatError] = useState('')

  // Group menu state
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null)
  const [activeMenuCategory, setActiveMenuCategory] = useState<string | null>(null)

  // Single category rename dialog from group menu
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameOldName, setRenameOldName] = useState('')
  const [renameNewName, setRenameNewName] = useState('')
  const [renameError, setRenameError] = useState('')

  // Group todos by category, ordered by `categories` list
  const categoryOrder = Array.from(new Set([...categories, ...todos.map((t) => t.category)]))
  const grouped = categoryOrder.reduce<Record<string, TodoItem[]>>((result, cat) => {
    result[cat] = todos.filter((item) => item.category === cat)
    return result
  }, {})

  const totalCompleted = todos.filter((t) => t.isCompleted).length

  // Quick add category handling
  const handleCreateCategory = () => {
    const trimmed = quickCatName.trim()
    if (!trimmed) return
    if (categories.includes(trimmed)) {
      setQuickCatError('此分類已存在')
      return
    }
    setQuickCatError('')
    const nextCategories = [...categories, trimmed]
    void onSaveCategories(nextCategories)
    onCategoryChange(trimmed)
    setQuickCatName('')
    setQuickAddCatOpen(false)
  }

  const handleOpenGroupMenu = (event: React.MouseEvent<HTMLElement>, cat: string) => {
    setMenuAnchorEl(event.currentTarget)
    setActiveMenuCategory(cat)
  }

  const handleCloseGroupMenu = () => {
    setMenuAnchorEl(null)
    setActiveMenuCategory(null)
  }

  const handleStartRenameFromMenu = () => {
    if (!activeMenuCategory) return
    setRenameOldName(activeMenuCategory)
    setRenameNewName(activeMenuCategory)
    setRenameError('')
    setRenameDialogOpen(true)
    handleCloseGroupMenu()
  }

  const handleSaveRename = () => {
    const trimmed = renameNewName.trim()
    if (!trimmed) return
    if (trimmed !== renameOldName && categories.includes(trimmed)) {
      setRenameError('此分類名稱已存在')
      return
    }
    setRenameError('')
    if (trimmed !== renameOldName) {
      void onRenameCategory(renameOldName, trimmed)
    }
    setRenameDialogOpen(false)
  }

  const handleDeleteFromMenu = () => {
    if (!activeMenuCategory) return
    const cat = activeMenuCategory
    handleCloseGroupMenu()
    const count = (grouped[cat] ?? []).length
    if (count > 0) {
      const confirmed = window.confirm(
        `分類「${cat}」下有 ${count} 個待辦事項，刪除後這些事項將自動歸類至「其他」。確定要刪除嗎？`,
      )
      if (!confirmed) return
    }
    void onDeleteCategory(cat)
  }

  const handleAddTodoToGroup = (cat: string) => {
    onCategoryChange(cat)
    handleCloseGroupMenu()
    const input = document.getElementById('todo-input-field')
    input?.focus()
  }

  const displayedGroups = Object.entries(grouped).filter(([group, items]) => {
    if (selectedFilterCategory !== 'all' && group !== selectedFilterCategory) {
      return false
    }
    // If filtering "all", show groups that have items or all groups if there are no items at all
    return items.length > 0 || categories.includes(group)
  })

  return (
    <Stack spacing={2.5}>
      {/* Category Filter Chips & Management Bar */}
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
              onClick={() => setSelectedFilterCategory('all')}
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
                  onClick={() => setSelectedFilterCategory(isSelected ? 'all' : cat)}
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
              onClick={() => setManagerOpen(true)}
            >
              管理分類
            </Button>
          </Stack>
        </Stack>
      </Card>

      {/* Add Todo Form */}
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
                  setQuickCatName('')
                  setQuickCatError('')
                  setQuickAddCatOpen(true)
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

      {/* Todo Groups */}
      {displayedGroups.map(([group, items]) => {
        const completedInGroup = items.filter((i) => i.isCompleted).length

        return (
          <Card
            key={group}
            sx={{ overflow: 'hidden' }}
          >
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
                    onClick={() => handleAddTodoToGroup(group)}
                    aria-label={`新增事項至 ${group}`}
                  >
                    <AddRoundedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <IconButton
                  size="small"
                  onClick={(e) => handleOpenGroupMenu(e, group)}
                  aria-label={`分類選單 ${group}`}
                >
                  <MoreVertRoundedIcon fontSize="small" />
                </IconButton>
              </Stack>
            </Stack>

            {items.length > 0 ? (
              <Stack divider={<Divider />}>
                {items.map((todo) => (
                  <Stack
                    key={todo.id}
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
                    {onSaveTodo ? (
                      <Tooltip title="編輯事項">
                        <IconButton
                          size="small"
                          aria-label={`編輯 ${todo.title}`}
                          onClick={() => setEditingTodo(todo)}
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
      })}

      {todos.length === 0 ? (
        <Card sx={{ p: 4, textAlign: 'center' }}>
          <TaskAltRoundedIcon color="disabled" sx={{ fontSize: 44, opacity: 0.7 }} />
          <Typography color="text.secondary" sx={{ mt: 1, fontWeight: 650 }}>
            還沒有待辦事項，輸入上方表單建立清單。
          </Typography>
        </Card>
      ) : null}

      {/* Group Action Menu */}
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleCloseGroupMenu}
        slotProps={{
          paper: {
            sx: { borderRadius: 2, minWidth: 160, boxShadow: '0 6px 20px rgba(0,0,0,0.08)' },
          },
        }}
      >
        <MenuItem
          onClick={() => {
            if (activeMenuCategory) handleAddTodoToGroup(activeMenuCategory)
          }}
        >
          <AddRoundedIcon fontSize="small" sx={{ mr: 1, color: 'primary.main' }} />
          新增待辦到此分類
        </MenuItem>
        <MenuItem onClick={handleStartRenameFromMenu}>
          <EditOutlinedIcon fontSize="small" sx={{ mr: 1 }} />
          重新命名分類
        </MenuItem>
        <MenuItem
          onClick={handleDeleteFromMenu}
          sx={{ color: 'error.main' }}
          disabled={categories.length <= 1}
        >
          <DeleteOutlineRoundedIcon fontSize="small" sx={{ mr: 1 }} />
          刪除分類
        </MenuItem>
      </Menu>

      {/* Quick Add Category Dialog */}
      <Dialog
        open={quickAddCatOpen}
        onClose={() => setQuickAddCatOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 900, fontSize: '1.15rem', pb: 1 }}>
          新增自訂分類
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <TextField
            autoFocus
            label="分類名稱"
            placeholder="例如：行李打包、票券門票…"
            value={quickCatName}
            onChange={(e) => {
              setQuickCatName(e.target.value)
              if (quickCatError) setQuickCatError('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleCreateCategory()
              }
            }}
            error={Boolean(quickCatError)}
            helperText={quickCatError}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setQuickAddCatOpen(false)} color="inherit">
            取消
          </Button>
          <Button
            variant="contained"
            disabled={!quickCatName.trim()}
            onClick={handleCreateCategory}
            sx={{ borderRadius: 2, px: 3 }}
          >
            建立並選取
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rename Category Dialog from Group Menu */}
      <Dialog
        open={renameDialogOpen}
        onClose={() => setRenameDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 900, fontSize: '1.15rem', pb: 1 }}>
          重新命名分類
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <TextField
            autoFocus
            label="新分類名稱"
            value={renameNewName}
            onChange={(e) => {
              setRenameNewName(e.target.value)
              if (renameError) setRenameError('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSaveRename()
              }
            }}
            error={Boolean(renameError)}
            helperText={renameError}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setRenameDialogOpen(false)} color="inherit">
            取消
          </Button>
          <Button
            variant="contained"
            disabled={!renameNewName.trim()}
            onClick={handleSaveRename}
            sx={{ borderRadius: 2, px: 3 }}
          >
            儲存變更
          </Button>
        </DialogActions>
      </Dialog>

      {/* Full Category Manager Dialog */}
      <TodoCategoryManagerDialog
        open={managerOpen}
        categories={categories}
        todos={todos}
        onClose={() => setManagerOpen(false)}
        onSaveCategories={onSaveCategories}
        onRenameCategory={onRenameCategory}
        onDeleteCategory={onDeleteCategory}
      />

      {/* Edit Todo Item Dialog */}
      <TodoItemEditorDialog
        todo={editingTodo}
        categories={categories}
        saving={saving}
        onClose={() => setEditingTodo(null)}
        onSave={async (updated) => {
          if (onSaveTodo) {
            await onSaveTodo(updated)
          }
          setEditingTodo(null)
        }}
        onOpenCategoryManager={() => {
          setEditingTodo(null)
          setManagerOpen(true)
        }}
      />
    </Stack>
  )
}
