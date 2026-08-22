import { useState, type FormEvent } from 'react'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded'
import {
  Card,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from '@mui/material'
import type { TodoItem } from '../../../types/database'
import { TodoCategoryManagerDialog } from './TodoCategoryManagerDialog'
import { TodoItemEditorDialog } from './TodoItemEditorDialog'
import { TodoCategoryFilterBar } from './todo/TodoCategoryFilterBar'
import { TodoAddForm } from './todo/TodoAddForm'
import { TodoGroupCard } from './todo/TodoGroupCard'
import { QuickAddCategoryDialog } from './todo/QuickAddCategoryDialog'
import { RenameCategoryDialog } from './todo/RenameCategoryDialog'

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
    return items.length > 0 || categories.includes(group)
  })

  return (
    <Stack spacing={2.5}>
      {/* Category Filter Chips & Management Bar */}
      <TodoCategoryFilterBar
        categories={categories}
        todos={todos}
        grouped={grouped}
        selectedFilterCategory={selectedFilterCategory}
        onSelectCategory={setSelectedFilterCategory}
        onOpenManager={() => setManagerOpen(true)}
      />

      {/* Add Todo Form */}
      <TodoAddForm
        title={title}
        category={category}
        categories={categories}
        saving={saving}
        onTitleChange={onTitleChange}
        onCategoryChange={onCategoryChange}
        onSubmit={onSubmit}
        onOpenQuickAddCategory={() => {
          setQuickCatName('')
          setQuickCatError('')
          setQuickAddCatOpen(true)
        }}
      />

      {/* Todo Groups */}
      {displayedGroups.map(([group, items]) => (
        <TodoGroupCard
          key={group}
          group={group}
          items={items}
          onToggle={onToggle}
          onDelete={onDelete}
          onEdit={onSaveTodo ? setEditingTodo : undefined}
          onAddTodoToGroup={handleAddTodoToGroup}
          onOpenGroupMenu={handleOpenGroupMenu}
        />
      ))}

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
      <QuickAddCategoryDialog
        open={quickAddCatOpen}
        name={quickCatName}
        error={quickCatError}
        onNameChange={(val) => {
          setQuickCatName(val)
          if (quickCatError) setQuickCatError('')
        }}
        onClose={() => setQuickAddCatOpen(false)}
        onSubmit={handleCreateCategory}
      />

      {/* Rename Category Dialog from Group Menu */}
      <RenameCategoryDialog
        open={renameDialogOpen}
        name={renameNewName}
        error={renameError}
        onNameChange={(val) => {
          setRenameNewName(val)
          if (renameError) setRenameError('')
        }}
        onClose={() => setRenameDialogOpen(false)}
        onSubmit={handleSaveRename}
      />

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
