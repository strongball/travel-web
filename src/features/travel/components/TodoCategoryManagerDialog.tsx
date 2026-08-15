import { useState } from 'react'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded'
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded'
import {
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import type { TodoItem } from '../../../types/database'

export const DEFAULT_TODO_CATEGORIES = ['行前準備', '旅途中', '其他']

interface TodoCategoryManagerDialogProps {
  open: boolean
  categories: string[]
  todos: TodoItem[]
  onClose: () => void
  onSaveCategories: (categories: string[]) => void | Promise<void>
  onRenameCategory: (oldName: string, newName: string) => void | Promise<void>
  onDeleteCategory: (categoryName: string) => void | Promise<void>
}

export function TodoCategoryManagerDialog({
  open,
  categories,
  todos,
  onClose,
  onSaveCategories,
  onRenameCategory,
  onDeleteCategory,
}: TodoCategoryManagerDialogProps) {
  const [newCategoryName, setNewCategoryName] = useState('')
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [errorText, setErrorText] = useState('')

  const handleAddCategory = () => {
    const trimmed = newCategoryName.trim()
    if (!trimmed) return
    if (categories.includes(trimmed)) {
      setErrorText('此分類名稱已存在')
      return
    }
    setErrorText('')
    const next = [...categories, trimmed]
    void onSaveCategories(next)
    setNewCategoryName('')
  }

  const startEdit = (cat: string) => {
    setEditingCategory(cat)
    setEditName(cat)
    setErrorText('')
  }

  const cancelEdit = () => {
    setEditingCategory(null)
    setEditName('')
    setErrorText('')
  }

  const saveEdit = (oldName: string) => {
    const trimmed = editName.trim()
    if (!trimmed) {
      cancelEdit()
      return
    }
    if (trimmed !== oldName && categories.includes(trimmed)) {
      setErrorText('此分類名稱已存在')
      return
    }
    setErrorText('')
    if (trimmed !== oldName) {
      void onRenameCategory(oldName, trimmed)
    }
    setEditingCategory(null)
    setEditName('')
  }

  const handleDelete = (cat: string) => {
    const count = todos.filter((t) => t.category === cat).length
    if (count > 0) {
      const confirmed = window.confirm(
        `分類「${cat}」下有 ${count} 個待辦事項，刪除後這些事項將自動歸類至「其他」。確定要刪除嗎？`,
      )
      if (!confirmed) return
    }
    void onDeleteCategory(cat)
  }

  const moveUp = (index: number) => {
    if (index <= 0) return
    const next = [...categories]
    const temp = next[index - 1]
    next[index - 1] = next[index]
    next[index] = temp
    void onSaveCategories(next)
  }

  const moveDown = (index: number) => {
    if (index >= categories.length - 1) return
    const next = [...categories]
    const temp = next[index + 1]
    next[index + 1] = next[index]
    next[index] = temp
    void onSaveCategories(next)
  }

  const handleResetDefaults = () => {
    const confirmed = window.confirm('確定要還原為預設分類（行前準備、旅途中、其他）嗎？')
    if (!confirmed) return
    void onSaveCategories(DEFAULT_TODO_CATEGORIES)
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1, fontWeight: 900, fontSize: '1.2rem' }}>
        管理待辦事項分類
      </DialogTitle>
      <DialogContent sx={{ pb: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          自定義適合您旅程的分類，可自由新增、修改名稱、調整排序或刪除分類。
        </Typography>

        {/* Add Category Form */}
        <Card
          sx={{
            p: 1.5,
            mb: 2.5,
            bgcolor: 'action.hover',
          }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder="新增自訂分類名稱（如：行李打包、票券門票）"
              value={newCategoryName}
              onChange={(e) => {
                setNewCategoryName(e.target.value)
                if (errorText) setErrorText('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAddCategory()
                }
              }}
              sx={{ flex: 1 }}
            />
            <Button
              variant="contained"
              disabled={!newCategoryName.trim()}
              onClick={handleAddCategory}
              startIcon={<AddRoundedIcon />}
              sx={{ whiteSpace: 'nowrap' }}
            >
              新增
            </Button>
          </Stack>
          {errorText ? (
            <Typography variant="caption" color="error" sx={{ mt: 0.75, display: 'block', px: 0.5 }}>
              {errorText}
            </Typography>
          ) : null}
        </Card>

        {/* Category List */}
        <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1, color: 'text.secondary' }}>
          現有分類（共 {categories.length} 個）
        </Typography>

        <Card
          sx={{
            overflow: 'hidden',
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          <List disablePadding>
            {categories.map((cat, index) => {
              const count = todos.filter((t) => t.category === cat).length
              const isEditing = editingCategory === cat

              return (
                <ListItem
                  key={cat}
                  divider={index < categories.length - 1}
                  sx={{
                    py: 1,
                    px: 2,
                    bgcolor: isEditing ? 'action.selected' : 'transparent',
                    '&:hover': {
                      bgcolor: isEditing ? 'action.selected' : 'action.hover',
                    },
                  }}
                >
                  {isEditing ? (
                    <Stack direction="row" spacing={1} sx={{ flex: 1, alignItems: 'center', mr: 2 }}>
                      <TextField
                        size="small"
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            saveEdit(cat)
                          } else if (e.key === 'Escape') {
                            cancelEdit()
                          }
                        }}
                        sx={{ flex: 1, bgcolor: '#ffffff' }}
                      />
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => saveEdit(cat)}
                        aria-label="確認修改"
                      >
                        <CheckRoundedIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={cancelEdit}
                        aria-label="取消修改"
                      >
                        <CloseRoundedIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  ) : (
                    <>
                      <ListItemText
                        primary={
                          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                            <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                              {cat}
                            </Typography>
                            <Chip
                              size="small"
                              label={`${count} 項`}
                              sx={{
                                height: 20,
                                fontSize: '0.72rem',
                                bgcolor: count > 0 ? 'rgba(13, 118, 110, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                                color: count > 0 ? '#0d766e' : 'text.secondary',
                                fontWeight: 700,
                              }}
                            />
                          </Stack>
                        }
                      />
                      <ListItemSecondaryAction>
                        <Stack direction="row" spacing={0.5}>
                          <Tooltip title="上移">
                            <span>
                              <IconButton
                                size="small"
                                disabled={index === 0}
                                onClick={() => moveUp(index)}
                                aria-label="上移分類"
                              >
                                <ArrowUpwardRoundedIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="下移">
                            <span>
                              <IconButton
                                size="small"
                                disabled={index === categories.length - 1}
                                onClick={() => moveDown(index)}
                                aria-label="下移分類"
                              >
                                <ArrowDownwardRoundedIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="重新命名">
                            <IconButton
                              size="small"
                              onClick={() => startEdit(cat)}
                              aria-label={`編輯分類 ${cat}`}
                            >
                              <EditOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="刪除分類">
                            <span>
                              <IconButton
                                size="small"
                                color="error"
                                disabled={categories.length <= 1}
                                onClick={() => handleDelete(cat)}
                                aria-label={`刪除分類 ${cat}`}
                              >
                                <DeleteOutlineRoundedIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Stack>
                      </ListItemSecondaryAction>
                    </>
                  )}
                </ListItem>
              )
            })}
          </List>
        </Card>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, justifyContent: 'space-between' }}>
        <Button
          size="small"
          color="inherit"
          startIcon={<RestartAltRoundedIcon />}
          onClick={handleResetDefaults}
          sx={{ color: 'text.secondary' }}
        >
          還原預設分類
        </Button>
        <Button variant="contained" onClick={onClose} sx={{ borderRadius: 2, px: 3 }}>
          完成
        </Button>
      </DialogActions>
    </Dialog>
  )
}
